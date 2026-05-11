const http = require('http');
const fs = require('fs');
const path = require('path');
const { storeAdapters } = require('./stores');
const { matchesKeywords, inPriceRange, isStandaloneGpuProduct, isNewRetailCondition, enrichListing, withinTargetCap, isMsrpHit, listingKey } = require('./utils');
const { detectNewInStockAlerts, detectNewListingAlerts } = require('./alerting');
const { databaseHealth, initDatabase, persistScanToDatabase, seedHistoryToDatabase } = require('./db');
const { buildStats, isGoodObservation, latestListings, updateHistory } = require('./stats');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const STATE_FILE = path.join(ROOT, 'data', 'state.json');
const HISTORY_FILE = path.join(ROOT, 'data', 'history.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.STOCK_DASHBOARD_PORT || 4388;
let activeScan = null;
const KNOWN_STORES = new Set(['bestbuy', 'walmart', 'amd', 'newegg', 'ebay', 'amazon', 'bhphoto', 'antonline', 'asus', 'msi']);

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function send(res, code, body, type='application/json') { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body, null, 2) : body); }
function isLegacyFakeListing(listing = {}) {
  const text = `${listing.title || ''} ${listing.url || ''} ${listing.productId || ''}`.toLowerCase();
  return /example[.]com/.test(text) || text.includes(`place${'holder'}`);
}
function isHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
function validateConfig(config = {}) {
  const issues = [];
  const minPrice = Number(config.minPrice);
  const maxPrice = Number(config.maxPrice);
  const timeoutMs = Number(config.storeTimeoutMs);
  const pollIntervalMs = Number(config.pollIntervalMs);
  const storeRequestDelayMs = Number(config.storeRequestDelayMs || 0);
  const schedulerTickMs = Number(config.schedulerTickMs || 30000);
  const minStoreRequestDelayMs = Number(config.minStoreRequestDelayMs || 3000);
  const maxAutoStoresPerTick = Number(config.maxAutoStoresPerTick || 1);

  if (!Number.isFinite(minPrice) || minPrice < 0) issues.push('minPrice must be zero or greater');
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) issues.push('maxPrice must be greater than zero');
  if (Number.isFinite(minPrice) && Number.isFinite(maxPrice) && minPrice > maxPrice) issues.push('minPrice cannot be greater than maxPrice');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 60000) issues.push('storeTimeoutMs must be between 1000 and 60000');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 60000) issues.push('pollIntervalMs must be at least 60000 for polite public-page watching');
  if (!Number.isFinite(schedulerTickMs) || schedulerTickMs < 15000 || schedulerTickMs > 300000) issues.push('schedulerTickMs must be between 15000 and 300000');
  if (!Number.isFinite(storeRequestDelayMs) || storeRequestDelayMs < 0 || storeRequestDelayMs > 30000) issues.push('storeRequestDelayMs must be between 0 and 30000');
  if (!Number.isFinite(minStoreRequestDelayMs) || minStoreRequestDelayMs < 1000 || minStoreRequestDelayMs > 30000) issues.push('minStoreRequestDelayMs must be between 1000 and 30000');
  if (!Number.isFinite(maxAutoStoresPerTick) || maxAutoStoresPerTick < 1 || maxAutoStoresPerTick > 3) issues.push('maxAutoStoresPerTick must be between 1 and 3');
  if (!Array.isArray(config.productKeywords) || config.productKeywords.length === 0) issues.push('productKeywords must contain at least one keyword');
  if (!Array.isArray(config.stores) || config.stores.length === 0) issues.push('stores must contain at least one store');
  if (config?.goodBot?.userAgent && !/watch|monitor|bot|crawler/i.test(config.goodBot.userAgent)) issues.push('goodBot.userAgent should identify this as a watcher/bot');

  for (const store of config.stores || []) {
    if (!store || typeof store !== 'object') {
      issues.push('store entries must be objects');
      continue;
    }
    if (!KNOWN_STORES.has(store.id)) issues.push(`unknown store id: ${store.id || 'missing'}`);
    if (store.enabled && typeof store.query === 'string' && store.query.trim().length > 80) issues.push(`${store.id} query is too long`);
    if (store.enabled && store.queries) {
      if (!Array.isArray(store.queries)) issues.push(`${store.id} queries must be an array`);
      else if (store.queries.length > 8) issues.push(`${store.id} queries must contain 8 or fewer entries`);
      else {
        for (const query of store.queries) {
          if (typeof query !== 'string' || !query.trim()) issues.push(`${store.id} has an empty query`);
          if (String(query || '').length > 80) issues.push(`${store.id} query is too long`);
        }
      }
    }
    if (store.enabled && store.urls) {
      if (!Array.isArray(store.urls)) issues.push(`${store.id} urls must be an array`);
      else {
        for (const entry of store.urls) {
          if (!isHttpUrl(entry)) issues.push(`${store.id} has an invalid url`);
        }
      }
    }
  }

  return issues;
}
function readStateForResponse() {
  const state = readJson(STATE_FILE, {});
  if (state && typeof state === 'object' && state.isScanning && !activeScan) {
    state.isScanning = false;
    state.recoveredStaleScanAt = new Date().toISOString();
    writeJson(STATE_FILE, state);
  }
  const history = readJson(HISTORY_FILE, {});
  if (Array.isArray(state.stores)) {
    state.stores = state.stores.filter(isGoodObservation);
    state.summary = summarizeListings(state.stores);
  }
  if ((!Array.isArray(state.stores) || state.stores.length === 0) && Array.isArray(history.observations) && history.observations.length) {
    state.stores = latestListings(history);
    state.summary = summarizeListings(state.stores);
    state.restoredListingsFromHistory = true;
  }
  state.stats = state.stats || history.stats || buildStats(history, state);
  return state;
}
function sameStoreError(a, b) {
  return a && b && a.type === 'store_error' && b.type === 'store_error' && a.store === b.store && a.error === b.error;
}
function pruneAlerts(alerts = []) {
  const out = [];
  const recentStoreError = new Map();
  for (const alert of alerts) {
    if (isLegacyFakeListing(alert.listing)) continue;
    if (alert.type === 'store_error') {
      const key = `${alert.store}:${alert.error}`;
      if (recentStoreError.has(key)) continue;
      recentStoreError.set(key, true);
    }
    out.push(alert);
  }
  return out.slice(-80);
}

function classifyError(error) {
  const text = String(error || 'unknown_error').toLowerCase();
  if (text.includes('abort')) return 'timeout';
  if (text.includes('403')) return 'http_403';
  if (text.includes('404')) return 'http_404';
  if (text.includes('fetch failed')) return 'network';
  return 'store_error';
}

function summarizeListings(listings = []) {
  const clean = listings.filter(item => isGoodObservation(item));
  const inStock = clean.filter(item => item.inStock).length;
  const withinTarget = clean.filter(item => item.withinTarget !== false).length;
  const cheapest = clean.slice().sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
  return {
    total: clean.length,
    inStock,
    withinTarget,
    cheapest
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function storePollIntervalMs(store = {}, config = {}) {
  const value = Number(store.pollIntervalMs || config.pollIntervalMs || 300000);
  return Number.isFinite(value) ? Math.max(value, 60000) : 300000;
}

function schedulerTickMs(config = {}) {
  const value = Number(config.schedulerTickMs || 30000);
  if (!Number.isFinite(value)) return 30000;
  return Math.min(Math.max(value, 15000), 300000);
}

function storeRequestDelayMs(store = {}, config = {}) {
  const configured = Number(store.requestDelayMs ?? config.storeRequestDelayMs ?? 3000);
  const minimum = Number(config.minStoreRequestDelayMs ?? 3000);
  const safeMinimum = Number.isFinite(minimum) ? Math.min(Math.max(minimum, 1000), 30000) : 3000;
  const value = Number.isFinite(configured) ? configured : safeMinimum;
  return Math.min(Math.max(value, safeMinimum), 30000);
}

function addSchedule(status = {}, store = {}, config = {}) {
  const pollIntervalMs = storePollIntervalMs(store, config);
  const checkedAt = status.checkedAt || new Date().toISOString();
  const checkedMs = Date.parse(checkedAt);
  return {
    ...status,
    pollIntervalMs,
    nextCheckAt: Number.isFinite(checkedMs) ? new Date(checkedMs + pollIntervalMs).toISOString() : null
  };
}

async function runScan(options = {}) {
  const forceAll = options.forceAll === true;
  const scanMode = forceAll ? 'manual_all_sources' : 'automatic_due_sources';
  const config = readJson(CONFIG_FILE, {});
  const maxStoresThisRun = forceAll ? Infinity : Math.min(Math.max(Number(config.maxAutoStoresPerTick || 1), 1), 3);
  const state = readJson(STATE_FILE, { stores: [], alerts: [], lastScanAt: null, storeFailures: {} });
  const previousStatusByStore = new Map((state.storeStatus || []).map(status => [status.store, status]));
  state.isScanning = true;
  state.scanStartedAt = new Date().toISOString();
  state.scanMode = scanMode;
  writeJson(STATE_FILE, state);

  const previousListings = state.stores || [];
  const nextListings = [];
  const newAlerts = [];
  const storeStatus = [];
  const existingAlerts = state.alerts || [];
  const storeFailures = state.storeFailures || {};
  let contactedStores = 0;
  let dueStores = 0;
  let deferredStores = 0;

  try {
    for (const store of config.stores || []) {
      if (!store.enabled) continue;
      const configIssues = validateConfig({ ...config, stores: [store] });
      if (configIssues.length) {
        storeStatus.push({
          store: store.id || 'unknown',
          ok: false,
          seen: 0,
          matchedKeywords: 0,
          matchedPrice: 0,
          qualifying: 0,
          inStock: 0,
          diagnosis: 'config_invalid',
          checkedAt: new Date().toISOString(),
          error: configIssues.join('; '),
          consecutiveFailures: 0,
          cooldownUntil: null
        });
        continue;
      }
      const adapter = storeAdapters[store.id];
      if (!adapter) {
        storeStatus.push({
          store: store.id,
          ok: false,
          seen: 0,
          matchedKeywords: 0,
          matchedPrice: 0,
          qualifying: 0,
          inStock: 0,
          diagnosis: 'adapter_missing',
          checkedAt: new Date().toISOString(),
          error: `No store adapter registered for ${store.id}`,
          consecutiveFailures: 0,
          cooldownUntil: null
        });
        continue;
      }

      const previousStatus = previousStatusByStore.get(store.id);
      const intervalMs = storePollIntervalMs(store, config);
      const previousCheckedMs = Date.parse(previousStatus?.checkedAt || '');
      const storeIsDue = !Number.isFinite(previousCheckedMs) || Date.now() - previousCheckedMs >= intervalMs;
      if (!forceAll && !storeIsDue) {
        nextListings.push(...previousListings.filter(item => item.store === store.id));
        storeStatus.push(addSchedule({
          ...previousStatus,
          cached: true,
          diagnosis: previousStatus.diagnosis || 'waiting_for_store_interval'
        }, store, config));
        continue;
      }
      if (storeIsDue) dueStores += 1;
      if (!forceAll && contactedStores >= maxStoresThisRun) {
        deferredStores += 1;
        nextListings.push(...previousListings.filter(item => item.store === store.id));
        storeStatus.push(addSchedule({
          ...(previousStatus || { store: store.id, ok: false, checkedAt: new Date().toISOString() }),
          cached: true,
          diagnosis: 'waiting_for_next_scheduler_tick'
        }, store, config));
        continue;
      }

      const failureState = storeFailures[store.id] || { consecutiveFailures: 0, cooldownUntil: null, lastError: null, lastFailureAt: null };
      if (failureState.cooldownUntil && new Date(failureState.cooldownUntil).getTime() > Date.now()) {
        nextListings.push(...previousListings.filter(item => item.store === store.id));
        storeStatus.push({
          store: store.id,
          ok: false,
          seen: 0,
          matchedKeywords: 0,
          matchedPrice: 0,
          qualifying: 0,
          diagnosis: 'cooldown_active',
          checkedAt: new Date().toISOString(),
          error: failureState.lastError || 'cooldown_active',
          consecutiveFailures: failureState.consecutiveFailures,
          cooldownUntil: failureState.cooldownUntil
        });
        continue;
      }

      try {
        contactedStores += 1;
        const adapterResult = await adapter(store, config);
        const results = Array.isArray(adapterResult?.listings) ? adapterResult.listings : [];
        const adapterStatus = adapterResult?.status || {};
        const previousStoreListings = previousListings.filter(item => item.store === store.id);
        let matchedKeywords = 0;
        let matchedProductType = 0;
        let matchedCondition = 0;
        let matchedPrice = 0;
        let qualifying = 0;
        let inStock = 0;

        for (const item of results) {
          const normalized = enrichListing({ ...item, store: store.id });
          if (!matchesKeywords(normalized.title, config.productKeywords)) continue;
          matchedKeywords += 1;
          if (!isStandaloneGpuProduct(normalized.title)) continue;
          matchedProductType += 1;
          if (store.condition === 'new' && !isNewRetailCondition(normalized.title)) continue;
          matchedCondition += 1;
          const maxPrice = store.ignoreMaxPrice ? undefined : (store.maxPrice ?? config.maxPrice);
          if (!inPriceRange(normalized.price, config.minPrice, maxPrice)) continue;
          matchedPrice += 1;
          normalized.withinTarget = withinTargetCap(normalized, config.targetCaps || {});
          normalized.msrpHit = isMsrpHit(normalized, config.msrpTargets || {});
          qualifying += 1;
          if (normalized.inStock) inStock += 1;
          nextListings.push(normalized);
        }

        let preservedListings = 0;
        if (adapterStatus.ok === false && previousStoreListings.length) {
          const checkedAt = adapterStatus.checkedAt || new Date().toISOString();
          for (const item of previousStoreListings) {
            nextListings.push({
              ...item,
              stale: true,
              staleReason: adapterStatus.diagnosis || 'store_unavailable',
              checkedAt: item.checkedAt || checkedAt
            });
            preservedListings += 1;
          }
        }

        const filterDiagnosis = results.length === 0
          ? 'parser_no_match_or_no_results'
          : matchedKeywords === 0
            ? 'no_keyword_match'
            : matchedProductType === 0
              ? 'not_standalone_gpu'
              : matchedCondition === 0
                ? 'condition_filtered'
                : matchedPrice === 0
                  ? 'no_price_match'
                  : qualifying === 0
                    ? 'no_qualifying_items'
                    : 'qualifying_items_found';
        const diagnosis = adapterStatus.ok === false ? (adapterStatus.diagnosis || 'store_unavailable') : filterDiagnosis;

        storeFailures[store.id] = { consecutiveFailures: 0, cooldownUntil: null, lastError: null, lastFailureAt: null };
        storeStatus.push({
          store: store.id,
          ok: adapterStatus.ok !== false,
          source: adapterStatus.source || store.strategy || 'unknown',
          strategy: adapterStatus.strategy || store.strategy || 'unknown',
          seen: Number.isFinite(Number(adapterStatus.seen)) ? Number(adapterStatus.seen) : results.length,
          listingCount: Number.isFinite(Number(adapterStatus.listingCount)) ? Number(adapterStatus.listingCount) : results.length,
          matchedKeywords,
          matchedProductType,
          matchedCondition,
          matchedPrice,
          qualifying,
          inStock,
          diagnosis,
          checkedAt: adapterStatus.checkedAt || new Date().toISOString(),
          error: adapterStatus.error || null,
          url: adapterStatus.url || null,
          consecutiveFailures: 0,
          cooldownUntil: null,
          preservedListings
        });
      } catch (error) {
        const errorText = String(error);
        const consecutiveFailures = (failureState.consecutiveFailures || 0) + 1;
        const shouldCooldown = consecutiveFailures >= (config.storeFailureBackoffThreshold || 3);
        const cooldownUntil = shouldCooldown ? new Date(Date.now() + (config.storeFailureCooldownMs || 300000)).toISOString() : null;
        storeFailures[store.id] = { consecutiveFailures, cooldownUntil, lastError: errorText, lastFailureAt: new Date().toISOString() };
        storeStatus.push({
          store: store.id,
          ok: false,
          seen: 0,
          matchedKeywords: 0,
          matchedPrice: 0,
          qualifying: 0,
          inStock: 0,
          diagnosis: classifyError(error),
          checkedAt: new Date().toISOString(),
          error: errorText,
          consecutiveFailures,
          cooldownUntil
        });
        const latestExisting = [...existingAlerts].reverse().find(alert => alert.type === 'store_error' && alert.store === store.id);
        const nextError = { at: new Date().toISOString(), type: 'store_error', store: store.id, error: errorText };
        if (!sameStoreError(latestExisting, nextError)) {
          newAlerts.push(nextError);
        }
      }
      const delayMs = storeRequestDelayMs(store, config);
      if (delayMs > 0) await sleep(Math.min(delayMs, 30000));
    }
  } finally {
    let dedupedListings = Array.from(new Map(nextListings.filter(isGoodObservation).map(item => [listingKey(item), item])).values());
    if (!dedupedListings.length) {
      const restored = latestListings(readJson(HISTORY_FILE, {}));
      if (restored.length) dedupedListings = restored;
    }
    const storeById = new Map((config.stores || []).map(store => [store.id, store]));
    const scheduledStoreStatus = storeStatus.map(status => addSchedule(status, storeById.get(status.store) || {}, config));
    const transitionAlerts = detectNewInStockAlerts(previousListings, dedupedListings);
    const listingAlerts = detectNewListingAlerts(previousListings, dedupedListings);
    const generatedAlerts = [...listingAlerts, ...transitionAlerts, ...newAlerts];
    const nextState = {
      stores: dedupedListings,
      summary: summarizeListings(dedupedListings),
      alerts: pruneAlerts([...(state.alerts || []), ...generatedAlerts]),
      lastScanAt: new Date().toISOString(),
      scanStartedAt: state.scanStartedAt,
      scanMode,
      isScanning: false,
      storeStatus: scheduledStoreStatus,
      soundConfig: (config.sounds || {}),
      watchlist: [],
      storeFailures,
      goodBot: {
        userAgent: config?.goodBot?.userAgent || config?.userAgent || 'GPUHunterWatcher/1.0 (+local personal stock alert; no purchase automation)',
        respectRobotsTxt: config.respectRobotsTxt !== false,
        storeRequestDelayMs: Number(config.storeRequestDelayMs || 0),
        effectiveMinStoreRequestDelayMs: storeRequestDelayMs({}, config),
        maxConcurrentStoreRequests: 1,
        purchaseAutomation: false
      },
      scheduler: {
        autoPolling: Boolean(config.autoPolling),
        schedulerTickMs: schedulerTickMs(config),
        maxAutoStoresPerTick: maxStoresThisRun === Infinity ? null : maxStoresThisRun,
        contactedStores,
        dueStores,
        deferredStores,
        manualScanMode: 'all_sources_sequential_with_rate_limit',
        automaticScanMode: 'due_sources_only',
        maxConcurrentStoreRequests: 1
      },
      configIssues: validateConfig(config)
    };
    const history = updateHistory(readJson(HISTORY_FILE, {}), {
      at: nextState.lastScanAt,
      listings: dedupedListings,
      storeStatus: scheduledStoreStatus,
      alerts: generatedAlerts,
      currentState: nextState
    });
    nextState.stats = history.stats;
    const dbResult = await persistScanToDatabase({
      at: nextState.lastScanAt,
      listings: dedupedListings,
      storeStatus: scheduledStoreStatus,
      alerts: generatedAlerts,
      stats: history.stats,
      summary: nextState.summary
    });
    nextState.database = dbResult;
    writeJson(HISTORY_FILE, history);
    writeJson(STATE_FILE, nextState);
  }

  return readJson(STATE_FILE, state);
}

async function scan() {
  if (activeScan) return activeScan;
  activeScan = runScan({ forceAll: false }).finally(() => {
    activeScan = null;
  });
  return activeScan;
}

function triggerScan(options = {}) {
  if (!activeScan) {
    activeScan = runScan({ forceAll: options.forceAll === true }).finally(() => {
      activeScan = null;
    });
  }
  return activeScan;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/state') return send(res, 200, readStateForResponse());
  if (url.pathname === '/api/stats') {
    const state = readStateForResponse();
    return send(res, 200, state.stats || buildStats(readJson(HISTORY_FILE, {}), state));
  }
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const config = readJson(CONFIG_FILE, {});
    return send(res, 200, {
      watchlist: [],
      targetCaps: config.targetCaps || {},
      minPrice: config.minPrice,
      maxPrice: config.maxPrice
    });
  }
  if (url.pathname === '/api/health') {
    const config = readJson(CONFIG_FILE, {});
    const state = readStateForResponse();
    return send(res, 200, {
      ok: true,
      port: Number(PORT),
      polling: {
        intervalMs: config.pollIntervalMs || 120000,
        schedulerTickMs: schedulerTickMs(config),
        inProgress: Boolean(activeScan),
        lastScanAt: state.lastScanAt || null,
        scanStartedAt: state.scanStartedAt || null,
        scanMode: state.scanMode || null,
        autoPolling: Boolean(config.autoPolling),
        maxConcurrentStoreRequests: 1,
        effectiveMinStoreRequestDelayMs: storeRequestDelayMs({}, config),
        maxAutoStoresPerTick: Math.min(Math.max(Number(config.maxAutoStoresPerTick || 1), 1), 3),
        lastScheduler: state.scheduler || null
      },
      enabledStores: (config.stores || []).filter(store => store.enabled).map(store => store.id),
      configIssues: validateConfig(config),
      listingCount: Array.isArray(state.stores) ? state.stores.length : 0,
      alertCount: Array.isArray(state.alerts) ? state.alerts.length : 0,
      summary: state.summary || summarizeListings(state.stores || []),
      database: await databaseHealth()
    });
  }
  if (url.pathname === '/api/scan' && req.method === 'POST') {
    triggerScan({ forceAll: true });
    return send(res, 202, { ok: true, started: true, inProgress: true });
  }
  if (url.pathname === '/api/watchlist' && req.method === 'POST') {
    return send(res, 410, {
      error: 'manual_watchlist_disabled',
      message: 'GPU Hunter is automatic-only. Add or change stores in config.json instead of posting manual products.'
    });
  }
  if (url.pathname.startsWith('/api/watchlist/') && req.method === 'DELETE') {
    return send(res, 410, {
      error: 'manual_watchlist_disabled',
      message: 'GPU Hunter is automatic-only. There are no manual watchlist targets to delete.'
    });
  }
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8'), 'text/html');
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf8'), 'text/css');
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8'), 'application/javascript');
  }
  if (req.method === 'GET' && url.pathname.startsWith('/sounds/')) {
    const file = path.join(ROOT, url.pathname.replace(/^\//, ''));
    if (fs.existsSync(file)) {
      const ext = path.extname(file).toLowerCase();
      const type = ext === '.mp3' ? 'audio/mpeg' : 'application/octet-stream';
      return send(res, 200, fs.readFileSync(file), type);
    }
    return send(res, 404, { error: 'Sound not found' });
  }
  return send(res, 404, { error: 'Not found' });
});

async function start() {
  try {
    const db = await initDatabase();
    console.log(`database ${db.ready ? 'ready' : 'disabled'}`);
    if (db.ready) {
      const seeded = await seedHistoryToDatabase(readJson(HISTORY_FILE, {}));
      if (seeded.seeded) console.log('database seeded from JSON history');
    }
  } catch (error) {
    console.error('database init error', error);
  }

  server.listen(PORT, () => {
    console.log(`5090 stock dashboard listening on http://127.0.0.1:${PORT}`);
  });

  const configAtStartup = readJson(CONFIG_FILE, { pollIntervalMs: 120000, schedulerTickMs: 30000, autoStartScan: false, autoPolling: false });
  if (configAtStartup.autoPolling) {
    setInterval(() => {
      scan().catch(err => console.error('scan error', err));
    }, schedulerTickMs(configAtStartup));
  }

  if (configAtStartup.autoStartScan) {
    scan().catch(err => console.error('initial scan error', err));
  }
}

start().catch(error => {
  console.error('startup error', error);
  process.exit(1);
});

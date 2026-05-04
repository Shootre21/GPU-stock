const http = require('http');
const fs = require('fs');
const path = require('path');
const { storeFetchers } = require('./stores');
const { matchesKeywords, inPriceRange, enrichListing, withinTargetCap, listingKey } = require('./utils');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const STATE_FILE = path.join(ROOT, 'data', 'state.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.STOCK_DASHBOARD_PORT || 4388;
let activeScan = null;

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}
function send(res, code, body, type='application/json') { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body, null, 2) : body); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
function sameStoreError(a, b) {
  return a && b && a.type === 'store_error' && b.type === 'store_error' && a.store === b.store && a.error === b.error;
}
function pruneAlerts(alerts = []) {
  const out = [];
  const recentStoreError = new Map();
  for (const alert of alerts) {
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

function listingFromWatchItem(item) {
  return enrichListing({
    store: item.store || 'watchlist',
    title: item.title || item.url,
    price: Number(item.price),
    url: item.url,
    imageUrl: item.imageUrl || '',
    inStock: item.inStock !== false,
    productId: item.productId || item.gpuId,
    note: item.note || '' ,
    source: 'watchlist'
  });
}

function summarizeListings(listings = []) {
  const inStock = listings.filter(item => item.inStock).length;
  const withinTarget = listings.filter(item => item.withinTarget !== false).length;
  const cheapest = listings.slice().sort((a, b) => Number(a.price) - Number(b.price))[0] || null;
  return {
    total: listings.length,
    inStock,
    withinTarget,
    cheapest
  };
}

async function runScan() {
  const config = readJson(CONFIG_FILE, {});
  const state = readJson(STATE_FILE, { stores: [], alerts: [], lastScanAt: null, storeFailures: {} });
  state.isScanning = true;
  state.scanStartedAt = new Date().toISOString();
  state.storeStatus = [];
  writeJson(STATE_FILE, state);

  const previousListings = state.stores || [];
  const previousInStockKeys = new Set(previousListings.filter(item => item.inStock).map(listingKey));
  const nextListings = [];
  const newAlerts = [];
  const storeStatus = [];
  const existingAlerts = state.alerts || [];
  const storeFailures = state.storeFailures || {};

  try {
    for (const watchItem of config.watchlist || []) {
      const normalized = listingFromWatchItem(watchItem);
      if (!matchesKeywords(normalized.title, config.productKeywords)) continue;
      if (!inPriceRange(normalized.price, config.minPrice, config.maxPrice)) continue;
      normalized.withinTarget = withinTargetCap(normalized, config.targetCaps || {});
      nextListings.push(normalized);
      const key = listingKey(normalized);
      if (normalized.inStock && !previousInStockKeys.has(key)) {
        newAlerts.push({ at: new Date().toISOString(), type: 'new_in_stock', listing: normalized, sound: 'BRUH_OR_FAHHH' });
      }
    }

    for (const store of config.stores || []) {
      if (!store.enabled) continue;
      const fetcher = storeFetchers[store.id];
      if (!fetcher) continue;

      const failureState = storeFailures[store.id] || { consecutiveFailures: 0, cooldownUntil: null, lastError: null, lastFailureAt: null };
      if (failureState.cooldownUntil && new Date(failureState.cooldownUntil).getTime() > Date.now()) {
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
        const results = await fetcher(config);
        let matchedKeywords = 0;
        let matchedPrice = 0;
        let qualifying = 0;
        let inStock = 0;

        for (const item of results) {
          const normalized = enrichListing({ ...item, store: store.id });
          if (!matchesKeywords(normalized.title, config.productKeywords)) continue;
          matchedKeywords += 1;
          if (!inPriceRange(normalized.price, config.minPrice, config.maxPrice)) continue;
          matchedPrice += 1;
          normalized.withinTarget = withinTargetCap(normalized, config.targetCaps || {});
          qualifying += 1;
          if (normalized.inStock) inStock += 1;
          nextListings.push(normalized);
          const key = listingKey(normalized);
          if (normalized.inStock && !previousInStockKeys.has(key)) {
            newAlerts.push({ at: new Date().toISOString(), type: 'new_in_stock', listing: normalized, sound: 'BRUH_OR_FAHHH' });
          }
        }

        const diagnosis = results.length === 0
          ? 'parser_no_match_or_no_results'
          : matchedKeywords === 0
            ? 'no_keyword_match'
            : matchedPrice === 0
              ? 'no_price_match'
              : qualifying === 0
                ? 'no_qualifying_items'
                : 'qualifying_items_found';

        storeFailures[store.id] = { consecutiveFailures: 0, cooldownUntil: null, lastError: null, lastFailureAt: null };
        storeStatus.push({
          store: store.id,
          ok: true,
          seen: results.length,
          matchedKeywords,
          matchedPrice,
          qualifying,
          inStock,
          diagnosis,
          checkedAt: new Date().toISOString(),
          error: null,
          consecutiveFailures: 0,
          cooldownUntil: null
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
    }
  } finally {
    const dedupedListings = Array.from(new Map(nextListings.map(item => [listingKey(item), item])).values());
    const nextState = {
      stores: dedupedListings,
      summary: summarizeListings(dedupedListings),
      alerts: pruneAlerts([...(state.alerts || []), ...newAlerts]),
      lastScanAt: new Date().toISOString(),
      scanStartedAt: state.scanStartedAt,
      isScanning: false,
      storeStatus,
      soundConfig: (config.sounds || {}),
      watchlist: (config.watchlist || []).map(listingFromWatchItem),
      storeFailures
    };
    writeJson(STATE_FILE, nextState);
  }

  return readJson(STATE_FILE, state);
}

async function scan() {
  if (activeScan) return activeScan;
  activeScan = runScan().finally(() => {
    activeScan = null;
  });
  return activeScan;
}

function triggerScan() {
  if (!activeScan) {
    activeScan = runScan().finally(() => {
      activeScan = null;
    });
  }
  return activeScan;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/state') return send(res, 200, readJson(STATE_FILE, {}));
  if (url.pathname === '/api/config' && req.method === 'GET') {
    const config = readJson(CONFIG_FILE, {});
    return send(res, 200, {
      watchlist: config.watchlist || [],
      targetCaps: config.targetCaps || {},
      minPrice: config.minPrice,
      maxPrice: config.maxPrice
    });
  }
  if (url.pathname === '/api/health') {
    const config = readJson(CONFIG_FILE, {});
    const state = readJson(STATE_FILE, {});
    return send(res, 200, {
      ok: true,
      port: Number(PORT),
      polling: {
        intervalMs: config.pollIntervalMs || 120000,
        inProgress: Boolean(activeScan),
        lastScanAt: state.lastScanAt || null,
        scanStartedAt: state.scanStartedAt || null,
        autoPolling: Boolean(config.autoPolling)
      },
      enabledStores: (config.stores || []).filter(store => store.enabled).map(store => store.id),
      listingCount: Array.isArray(state.stores) ? state.stores.length : 0,
      alertCount: Array.isArray(state.alerts) ? state.alerts.length : 0,
      summary: state.summary || summarizeListings(state.stores || [])
    });
  }
  if (url.pathname === '/api/scan' && req.method === 'POST') {
    triggerScan();
    return send(res, 202, { ok: true, started: true, inProgress: true });
  }
  if (url.pathname === '/api/watchlist' && req.method === 'POST') {
    const raw = await readBody(req);
    const body = JSON.parse(raw || '{}');
    const numericPrice = Number(body.price);
    if (!body.title || !Number.isFinite(numericPrice) || !(body.productId || body.gpuId)) {
      return send(res, 400, { error: 'title, numeric price, and productId are required' });
    }
    const config = readJson(CONFIG_FILE, {});
    const nextItem = {
      store: body.store || 'manual',
      title: String(body.title),
      price: numericPrice,
      url: body.url ? String(body.url) : '',
      imageUrl: body.imageUrl ? String(body.imageUrl) : '',
      inStock: body.inStock !== false,
      productId: String(body.productId || body.gpuId),
      note: body.note ? String(body.note) : ''
    };
    const existing = new Map((config.watchlist || []).map(item => [String(item.productId || item.gpuId || ''), item]));
    existing.set(nextItem.productId, nextItem);
    config.watchlist = Array.from(existing.values());
    writeJson(CONFIG_FILE, config);
    return send(res, 201, { ok: true, item: nextItem, watchlistCount: config.watchlist.length });
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

server.listen(PORT, () => {
  console.log(`5090 stock dashboard listening on http://127.0.0.1:${PORT}`);
});

const configAtStartup = readJson(CONFIG_FILE, { pollIntervalMs: 120000, autoStartScan: false, autoPolling: false });
if (configAtStartup.autoPolling) {
  setInterval(() => {
    scan().catch(err => console.error('scan error', err));
  }, configAtStartup.pollIntervalMs || 120000);
}

if (configAtStartup.autoStartScan) {
  scan().catch(err => console.error('initial scan error', err));
}

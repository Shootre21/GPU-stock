const { isStandaloneGpuProduct } = require('./utils');

const MAX_OBSERVATIONS = 8000;
const MAX_CHECKS = 3000;
const MAX_DROPS = 1500;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isoDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/Los_Angeles' });
}

function hourLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/Los_Angeles' });
}

function modelKey(item = {}) {
  return item.model || (String(item.title || '').match(/\b(3090|4080|4090|5090)\b/) || [])[1] || 'unknown';
}

function listingSnapshot(item = {}, at) {
  return {
    at,
    store: item.store || 'unknown',
    productId: item.productId || item.url || item.title,
    title: item.displayTitle || item.title || 'GPU listing',
    price: Number(item.price),
    url: item.url || '',
    inStock: item.inStock === true,
    msrpHit: item.msrpHit === true,
    withinTarget: item.withinTarget !== false,
    model: modelKey(item),
    source: item.source || 'public_page',
    rawAvailability: item.rawAvailability || 'unknown'
  };
}

function isGoodObservation(item = {}) {
  return isStandaloneGpuProduct(item.title || '') && Number.isFinite(Number(item.price));
}

function countBy(items, keyFn) {
  const out = new Map();
  for (const item of items) {
    const key = keyFn(item);
    out.set(key, (out.get(key) || 0) + 1);
  }
  return Array.from(out.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function bestPriceRows(observations = []) {
  const best = new Map();
  for (const item of observations.filter(isGoodObservation)) {
    if (!Number.isFinite(Number(item.price))) continue;
    const key = item.model || 'unknown';
    const current = best.get(key);
    if (!current || Number(item.price) < Number(current.price)) best.set(key, item);
  }
  return Array.from(best.values()).sort((a, b) => String(a.model).localeCompare(String(b.model)));
}

function hourDiff(a, b) {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.abs(end - start) / 3600000;
}

function storeStats(observations = [], drops = [], checks = []) {
  const stores = new Set([
    ...observations.map(item => item.store),
    ...drops.map(item => item.store),
    ...checks.map(item => item.store)
  ].filter(Boolean));

  return Array.from(stores).map(store => {
    const storeObs = observations.filter(item => item.store === store);
    const storeDrops = drops.filter(item => item.store === store);
    const storeChecks = checks.filter(item => item.store === store);
    const prices = storeObs.map(item => Number(item.price)).filter(Number.isFinite);
    const inStockObs = storeObs.filter(item => item.inStock);
    const msrpDrops = storeDrops.filter(item => item.msrpHit);
    const dropTimes = storeDrops.map(item => item.at).filter(Boolean).sort();
    const gaps = dropTimes.slice(1).map((time, index) => hourDiff(dropTimes[index], time)).filter(Number.isFinite);
    const firstCheck = storeChecks.map(item => Date.parse(item.at)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    const lastCheck = storeChecks.map(item => Date.parse(item.at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
    const observedDays = firstCheck && lastCheck ? Math.max((lastCheck - firstCheck) / 86400000, 1) : 1;
    return {
      store,
      observations: storeObs.length,
      checks: storeChecks.length,
      successfulChecks: storeChecks.filter(item => item.ok).length,
      inStockObservations: inStockObs.length,
      restockEvents: storeDrops.length,
      msrpDrops: msrpDrops.length,
      msrpDropRate: storeDrops.length ? msrpDrops.length / storeDrops.length : 0,
      dropsPerWeek: storeDrops.length / observedDays * 7,
      avgHoursBetweenDrops: gaps.length ? gaps.reduce((sum, n) => sum + n, 0) / gaps.length : null,
      bestPrice: prices.length ? Math.min(...prices) : null,
      avgObservedPrice: prices.length ? prices.reduce((sum, n) => sum + n, 0) / prices.length : null,
      lastSeenAt: storeObs.map(item => item.at).filter(Boolean).sort().at(-1) || null,
      bestDropDay: countBy(storeDrops, item => isoDay(item.at))[0] || null,
      bestDropHour: countBy(storeDrops, item => hourLabel(item.at))[0] || null
    };
  }).sort((a, b) =>
    b.msrpDrops - a.msrpDrops ||
    b.restockEvents - a.restockEvents ||
    b.inStockObservations - a.inStockObservations ||
    (a.avgObservedPrice || Infinity) - (b.avgObservedPrice || Infinity)
  );
}

function buildStats(history = {}, currentState = {}) {
  const observations = asArray(history.observations).filter(isGoodObservation);
  const drops = asArray(history.drops).filter(isGoodObservation);
  const checks = asArray(history.checks);
  const inStockObs = observations.filter(item => item.inStock);
  const msrpEvents = drops.filter(item => item.msrpHit);
  const msrpObservations = observations.filter(item => item.msrpHit && item.inStock);
  const msrpSignal = msrpEvents.length ? msrpEvents : msrpObservations;
  const stores = storeStats(observations, drops, checks);

  return {
    generatedAt: new Date().toISOString(),
    sample: {
      observations: observations.length,
      checks: checks.length,
      restockEvents: drops.length,
      msrpEvents: msrpSignal.length,
      currentListings: asArray(currentState.stores).length
    },
    bestHistoricalPrice: bestPriceRows(observations).map(item => ({
      model: item.model,
      store: item.store,
      title: item.title,
      price: item.price,
      url: item.url,
      at: item.at,
      inStock: item.inStock
    })),
    bestStores: stores.slice(0, 8),
    restockFrequency: stores.map(store => ({
      store: store.store,
      restockEvents: store.restockEvents,
      dropsPerWeek: store.dropsPerWeek,
      avgHoursBetweenDrops: store.avgHoursBetweenDrops,
      bestDropDay: store.bestDropDay,
      bestDropHour: store.bestDropHour,
      checks: store.checks,
      successfulChecks: store.successfulChecks
    })),
    msrpTiming: {
      bestHour: countBy(msrpSignal, item => hourLabel(item.at))[0] || null,
      bestDay: countBy(msrpSignal, item => isoDay(item.at))[0] || null,
      byHour: countBy(msrpSignal, item => hourLabel(item.at)).slice(0, 8),
      byDay: countBy(msrpSignal, item => isoDay(item.at)).slice(0, 7),
      byStore: countBy(msrpSignal, item => item.store).slice(0, 8)
    },
    bestDayToCheck: {
      byInStockObservation: countBy(inStockObs, item => isoDay(item.at)).slice(0, 7),
      byRestockEvent: countBy(drops, item => isoDay(item.at)).slice(0, 7)
    },
    currentBest: asArray(currentState.stores)
      .filter(item => Number.isFinite(Number(item.price)))
      .sort((a, b) => Number(a.price) - Number(b.price))
      .slice(0, 12)
      .map(item => listingSnapshot(item, item.checkedAt || currentState.lastScanAt || new Date().toISOString())),
    notes: observations.length < 50
      ? 'Stats are early. Patterns get more reliable after several days of scans.'
      : 'Stats are based only on public listings observed by this local watcher.'
  };
}

function latestListings(history = {}) {
  const byKey = new Map();
  for (const item of asArray(history.observations)) {
    if (!isGoodObservation(item)) continue;
    const key = `${item.store}:${item.productId || item.url || item.title}`;
    const current = byKey.get(key);
    if (!current || Date.parse(item.at) >= Date.parse(current.at)) byKey.set(key, item);
  }
  return Array.from(byKey.values()).map(item => ({
    store: item.store,
    title: item.title,
    price: item.price,
    url: item.url,
    imageUrl: '',
    inStock: item.inStock === true,
    productId: item.productId,
    source: item.source || 'history_observation',
    checkedAt: item.at,
    rawAvailability: item.rawAvailability || 'last_observed',
    model: item.model,
    msrpHit: item.msrpHit === true,
    withinTarget: item.withinTarget !== false,
    stale: true,
    staleReason: 'restored_from_history'
  })).slice(-200);
}

function updateHistory(history = {}, payload = {}) {
  const at = payload.at || new Date().toISOString();
  const previousDrops = new Set(asArray(history.drops).map(item => `${item.store}:${item.productId}:${item.at}`));
  const next = {
    version: 1,
    createdAt: history.createdAt || at,
    updatedAt: at,
    observations: asArray(history.observations).slice(),
    checks: asArray(history.checks).slice(),
    drops: asArray(history.drops).slice()
  };

  for (const status of asArray(payload.storeStatus)) {
    next.checks.push({
      at: status.checkedAt || at,
      store: status.store || 'unknown',
      ok: status.ok === true,
      source: status.source || 'public_page',
      diagnosis: status.diagnosis || 'unknown',
      listingCount: Number(status.listingCount || 0),
      qualifying: Number(status.qualifying || 0),
      inStock: Number(status.inStock || 0)
    });
  }

  for (const item of asArray(payload.listings)) {
    if (!isGoodObservation(item)) continue;
    next.observations.push(listingSnapshot(item, item.checkedAt || at));
  }

  for (const alert of asArray(payload.alerts)) {
    if (!['new_in_stock', 'new_listing'].includes(alert.type)) continue;
    const item = alert.listing;
    if (!item || !isGoodObservation(item)) continue;
    const drop = listingSnapshot(item, alert.at || at);
    const key = `${drop.store}:${drop.productId}:${drop.at}`;
    if (previousDrops.has(key)) continue;
    next.drops.push(drop);
    previousDrops.add(key);
  }

  next.observations = next.observations.slice(-MAX_OBSERVATIONS);
  next.observations = next.observations.filter(isGoodObservation);
  next.checks = next.checks.slice(-MAX_CHECKS);
  next.drops = next.drops.filter(isGoodObservation).slice(-MAX_DROPS);
  next.stats = buildStats(next, payload.currentState || { stores: payload.listings, lastScanAt: at });
  return next;
}

module.exports = {
  buildStats,
  isGoodObservation,
  latestListings,
  updateHistory
};

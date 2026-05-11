const STORE_ORDER = ['bestbuy', 'newegg', 'amazon', 'bhphoto', 'ebay', 'walmart', 'antonline', 'asus', 'msi', 'amd'];
const STORE_NAMES = {
  bestbuy: 'BESTBUY',
  newegg: 'NEWEGG',
  amazon: 'AMAZON',
  bhphoto: 'B&H PHOTO',
  ebay: 'EBAY',
  walmart: 'WALMART',
  antonline: 'ANTONLINE',
  asus: 'ASUS STORE US',
  msi: 'MSI STORE',
  amd: 'AMD'
};

const els = {
  scanBtn: document.querySelector('#scanBtn'),
  status: document.querySelector('#status'),
  stockWall: document.querySelector('#stockWall'),
  directLinks: document.querySelector('#directLinks'),
  alerts: document.querySelector('#alerts'),
  storeStatus: document.querySelector('#storeStatus'),
  tabButtons: document.querySelectorAll('.tab-btn'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  msrpStats: document.querySelector('#msrpStats'),
  bestStores: document.querySelector('#bestStores'),
  bestPrices: document.querySelector('#bestPrices'),
  restockStats: document.querySelector('#restockStats'),
  bestDays: document.querySelector('#bestDays'),
  bruhSound: document.querySelector('#bruhSound'),
  fahhhSound: document.querySelector('#fahhhSound')
};

let lastAlertCount = 0;
let seenMsrpKeys = new Set();
let audioUnlocked = false;

function markAudioUnlocked() {
  audioUnlocked = true;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? esc(url.toString()) : '#';
  } catch {
    return '#';
  }
}

function dollars(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'PRICE UNKNOWN';
  return `$${number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function numberLabel(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 'not enough data';
  return number.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function pct(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0%';
  return `${Math.round(number * 100)}%`;
}

function clock(value) {
  if (!value) return 'never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'never';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function secondsUntil(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return Infinity;
  return Math.ceil((date.getTime() - Date.now()) / 1000);
}

function updatedLabel(item = {}) {
  return `updated ${clock(item.checkedAt)}`;
}

function compactLabel(item = {}) {
  const title = item.displayTitle || item.title || 'GPU listing';
  return `${item.store || 'store'} - ${title}`;
}

function listingKey(item = {}) {
  return `${item.store || 'store'}:${item.productId || item.url || item.title || 'listing'}`;
}

function playAudioElement(audio) {
  if (!audio) return Promise.reject(new Error('missing_audio_element'));
  audio.currentTime = 0;
  return audio.play();
}

function synthNotify() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(880, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.3);
}

function synthFahhhh() {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance('FAAAAHHHH');
    utterance.rate = 0.82;
    utterance.pitch = 0.72;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return;
  }
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(196, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(98, ctx.currentTime + 0.9);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 1.1);
}

function playNotificationSound(kind = 'notify') {
  const audio = kind === 'fahhhh' ? els.fahhhSound : els.bruhSound;
  playAudioElement(audio).catch(() => {
    if (kind === 'fahhhh') synthFahhhh();
    else synthNotify();
  });
}

function groupByStore(items = []) {
  return items.reduce((acc, item) => {
    const key = item.store || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

function storeList(state = {}) {
  const ids = new Set([
    ...STORE_ORDER,
    ...(state.storeStatus || []).map(status => status.store),
    ...(state.stores || []).map(item => item.store)
  ].filter(Boolean));
  return Array.from(ids).sort((a, b) => {
    const ai = STORE_ORDER.indexOf(a);
    const bi = STORE_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });
}

function statusText(status = {}, listings = []) {
  if (listings.some(item => item.inStock)) return 'IN STOCK';
  if (listings.length) return 'OUT of STOCK';
  if (status.cached) return 'WAITING';
  if (/credential/i.test(status.diagnosis || '')) return 'NO CREDS';
  if (/blocked|verification|captcha|robot|cloudflare|datadome/i.test(`${status.diagnosis || ''} ${status.error || ''}`)) return 'CHECKING';
  if (/cooldown/i.test(status.diagnosis || '')) return 'COOLDOWN';
  return 'CHECKING';
}

function renderStoreColumn(store, listings, status, state = {}) {
  const visible = listings
    .slice()
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || Number(a.price) - Number(b.price))
    .slice(0, 12);
  const stockClass = visible.some(item => item.inStock) ? 'has-stock' : 'no-stock';
  const untilNext = secondsUntil(status?.nextCheckAt);
  const preUpdating = untilNext <= 10 && untilNext >= 5;
  const isWaiting = Boolean(status?.cached) || Boolean(state.isScanning) || preUpdating;
  const syncTitle = state.isScanning
    ? '***Updating***'
    : preUpdating
      ? '***Updating***'
      : status?.cached
        ? 'waiting for next safe interval'
        : 'checking for resync';
  const rows = visible.length
    ? visible.map(item => `
      <a class="stock-row ${item.inStock ? 'row-in' : 'row-out'} ${item.msrpHit ? 'msrp-hit' : ''}" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
        <span class="row-title">${esc(compactLabel(item))}</span>
        <span class="row-updated">${esc(updatedLabel(item))}</span>
        <span class="row-price">${esc(dollars(item.price))}</span>
        <span class="row-state">${item.msrpHit ? 'MSRP ALERT' : (item.inStock ? 'IN STOCK' : 'OUT of STOCK')}</span>
      </a>
    `).join('')
    : `<div class="empty-row ${stockClass}">${esc(statusText(status, visible))}</div>`;

  const next = preUpdating ? `***Updating*** in ${untilNext}s` : (status?.nextCheckAt ? `next ${clock(status.nextCheckAt)}` : 'interval pending');
  const counts = `${status?.listingCount || visible.length} seen / ${status?.inStock || visible.filter(item => item.inStock).length} in`;

  return `
    <article class="store-column ${stockClass}">
      <header class="store-head">
        <div>
          <h2>${esc(STORE_NAMES[store] || store.toUpperCase())}</h2>
          <span>${esc(counts)}</span>
        </div>
        <small class="next-check">${isWaiting ? '<i class="sync-spinner" aria-hidden="true"></i>' : ''}${esc(next)}</small>
      </header>
      <div class="scan-item">${isWaiting ? `<span class="sync-label">${esc(syncTitle)}</span>` : 'Scan item'}</div>
      <div class="rows">${rows}</div>
    </article>
  `;
}

function renderStockWall(state = {}) {
  const grouped = groupByStore(state.stores || []);
  const statusByStore = new Map((state.storeStatus || []).map(status => [status.store, status]));
  els.stockWall.innerHTML = storeList(state).map(store => renderStoreColumn(store, grouped[store] || [], statusByStore.get(store) || { store }, state)).join('');
}

function renderDirectLinks(state = {}) {
  const items = (state.stores || [])
    .slice()
    .sort((a, b) => Number(b.inStock) - Number(a.inStock) || String(a.store).localeCompare(String(b.store)) || Number(a.price) - Number(b.price))
    .slice(0, 80);
  if (!items.length) {
    els.directLinks.innerHTML = '<div class="muted-row">No direct product links yet. They appear after a public store parser returns real GPU listings.</div>';
    return;
  }
  els.directLinks.innerHTML = items.map(item => `
    <a class="direct-link ${item.inStock ? 'direct-in' : 'direct-out'} ${item.msrpHit ? 'msrp-hit' : ''}" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
      <span>${esc(compactLabel(item))}</span>
      <small>${esc(updatedLabel(item))}</small>
      <strong>${esc(dollars(item.price))}</strong>
    </a>
  `).join('');
}

function renderStatus(state = {}) {
  const summary = state.summary || {};
  const last = state.isScanning ? 'scanning now' : `last scan ${clock(state.lastScanAt)}`;
  const intervalCount = (state.storeStatus || []).filter(status => status.cached).length;
  const mode = state.scanMode === 'manual_all_sources' ? 'manual all-source scan' : 'automatic due-source scan';
  els.status.innerHTML = `
    <span>${esc(last)}</span>
    <span>${esc(mode)}</span>
    <span>${esc(summary.total || 0)} listings</span>
    <span>${esc(summary.inStock || 0)} in stock</span>
    <span>${esc(intervalCount)} stores waiting for their interval</span>
  `;
}

function renderAlerts(state = {}) {
  const alerts = (state.alerts || []).slice(-18).reverse();
  if (!alerts.length) {
    els.alerts.innerHTML = '<div class="muted-row">No drops yet. Alerts appear here when a real listing flips in stock.</div>';
    return;
  }
  els.alerts.innerHTML = alerts.map(alert => {
    if (alert.type === 'store_error') {
      return `<div class="drop-row error"><span>${esc(clock(alert.at))}</span><strong>${esc(alert.store)}</strong><em>${esc(alert.error)}</em></div>`;
    }
    const item = alert.listing || {};
    return `<a class="drop-row" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer"><span>${esc(clock(alert.at))}</span><strong>${esc(compactLabel(item))}</strong><em>${esc(dollars(item.price))}</em></a>`;
  }).join('');
}

function renderDiagnostics(state = {}) {
  const statuses = state.storeStatus || [];
  els.storeStatus.innerHTML = statuses.map(status => {
    const ok = status.ok ? 'ok' : 'warn';
    return `
      <div class="diag ${ok}">
        <strong>${esc(STORE_NAMES[status.store] || status.store)}</strong>
        <span>${esc(status.diagnosis || 'unknown')}</span>
        <small>${esc(status.source || 'public')} | checked ${esc(clock(status.checkedAt))} | next ${esc(clock(status.nextCheckAt))}</small>
      </div>
    `;
  }).join('');
}

function statRow(label, value, meta = '') {
  return `
    <div class="stat-row">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
      ${meta ? `<small>${esc(meta)}</small>` : ''}
    </div>
  `;
}

function storeName(store) {
  return STORE_NAMES[store] || String(store || 'UNKNOWN').toUpperCase();
}

function renderMsrpStats(stats = {}) {
  const msrp = stats.msrpTiming || {};
  const sample = stats.sample || {};
  const bestHour = msrp.bestHour ? `${msrp.bestHour.label} (${msrp.bestHour.count})` : 'not enough MSRP hits';
  const bestDay = msrp.bestDay ? `${msrp.bestDay.label} (${msrp.bestDay.count})` : 'not enough MSRP hits';
  const store = (msrp.byStore || [])[0];
  els.msrpStats.innerHTML = [
    statRow('Best MSRP hour', bestHour),
    statRow('Best MSRP day', bestDay),
    statRow('Most MSRP signals', store ? `${storeName(store.label)} (${store.count})` : 'not enough MSRP hits'),
    statRow('MSRP sample size', `${sample.msrpEvents || 0} events`, stats.notes || '')
  ].join('');
}

function renderBestStores(stats = {}) {
  const rows = (stats.bestStores || []).slice(0, 6);
  if (!rows.length) {
    els.bestStores.innerHTML = '<div class="muted-row">No store history yet.</div>';
    return;
  }
  els.bestStores.innerHTML = rows.map(store => statRow(
    storeName(store.store),
    `${store.restockEvents} drops / ${store.inStockObservations} in-stock sightings`,
    `MSRP rate ${pct(store.msrpDropRate)} | best ${store.bestPrice == null ? 'none' : dollars(store.bestPrice)}`
  )).join('');
}

function renderBestPrices(stats = {}) {
  const rows = stats.bestHistoricalPrice || [];
  if (!rows.length) {
    els.bestPrices.innerHTML = '<div class="muted-row">No historical prices recorded yet.</div>';
    return;
  }
  els.bestPrices.innerHTML = rows.map(item => `
    <a class="stat-row stat-link" href="${safeUrl(item.url)}" target="_blank" rel="noreferrer">
      <span>RTX ${esc(item.model)}</span>
      <strong>${esc(dollars(item.price))}</strong>
      <small>${esc(storeName(item.store))} | ${esc(clock(item.at))} | ${esc(item.title)}</small>
    </a>
  `).join('');
}

function renderRestockStats(stats = {}) {
  const rows = (stats.restockFrequency || []).slice(0, 10);
  if (!rows.length) {
    els.restockStats.innerHTML = '<div class="muted-row">No restock events yet. The watcher records these when a listing first appears or flips in stock.</div>';
    return;
  }
  els.restockStats.innerHTML = rows.map(row => statRow(
    storeName(row.store),
    `${numberLabel(row.dropsPerWeek, 2)} drops/week`,
    `${row.restockEvents} events | avg gap ${row.avgHoursBetweenDrops == null ? 'not enough data' : `${numberLabel(row.avgHoursBetweenDrops, 1)}h`} | checks ${row.successfulChecks}/${row.checks}`
  )).join('');
}

function renderBestDays(stats = {}) {
  const days = stats.bestDayToCheck || {};
  const inStock = days.byInStockObservation || [];
  const drops = days.byRestockEvent || [];
  const left = inStock.length
    ? inStock.map(day => statRow(day.label, `${day.count} in-stock sightings`)).join('')
    : '<div class="muted-row">No in-stock day pattern yet.</div>';
  const right = drops.length
    ? drops.map(day => statRow(day.label, `${day.count} restock events`)).join('')
    : '<div class="muted-row">No drop day pattern yet.</div>';
  els.bestDays.innerHTML = `
    <div class="split-stats">
      <div><h3>By in-stock sightings</h3>${left}</div>
      <div><h3>By drops</h3>${right}</div>
    </div>
  `;
}

function renderStats(state = {}) {
  const stats = state.stats || {};
  renderMsrpStats(stats);
  renderBestStores(stats);
  renderBestPrices(stats);
  renderRestockStats(stats);
  renderBestDays(stats);
}

function playNewAlertSound(state = {}) {
  const alerts = state.alerts || [];
  const msrpKeys = new Set((state.stores || []).filter(item => item.msrpHit && item.inStock).map(listingKey));
  const hasNewMsrp = [...msrpKeys].some(key => !seenMsrpKeys.has(key));
  if (lastAlertCount && alerts.length > lastAlertCount) {
    const fresh = alerts.slice(lastAlertCount);
    const hasMsrpAlert = fresh.some(alert => alert.sound === 'fahhhh' || alert.listing?.msrpHit);
    const hasListingAlert = fresh.some(alert => alert.type === 'new_listing' || alert.type === 'new_in_stock');
    if (hasMsrpAlert) playNotificationSound('fahhhh');
    else if (hasListingAlert) playNotificationSound('notify');
    else if (fresh.some(alert => alert.type === 'store_error')) playNotificationSound('notify');
  }
  if (seenMsrpKeys.size && hasNewMsrp) {
    playNotificationSound('fahhhh');
  }
  seenMsrpKeys = msrpKeys;
  lastAlertCount = alerts.length;
}

async function loadState() {
  const res = await fetch('/api/state', { cache: 'no-store' });
  const state = await res.json();
  renderStatus(state);
  renderStockWall(state);
  renderDirectLinks(state);
  renderAlerts(state);
  renderDiagnostics(state);
  renderStats(state);
  playNewAlertSound(state);
  els.scanBtn.disabled = Boolean(state.isScanning);
  els.scanBtn.textContent = state.isScanning ? 'Scanning...' : 'Scan now';
}

function switchTab(id) {
  els.tabButtons.forEach(button => button.classList.toggle('active', button.dataset.tab === id));
  els.tabPanels.forEach(panel => panel.classList.toggle('active', panel.id === id));
}

async function scanNow() {
  els.scanBtn.disabled = true;
  els.scanBtn.textContent = 'Scanning...';
  await fetch('/api/scan', { method: 'POST' });
  setTimeout(loadState, 1200);
}

els.scanBtn?.addEventListener('click', scanNow);
els.tabButtons.forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
window.addEventListener('pointerdown', markAudioUnlocked, { once: true });
window.addEventListener('keydown', markAudioUnlocked, { once: true });
loadState().catch(error => {
  els.status.textContent = `Dashboard error: ${error.message}`;
});
setInterval(loadState, 5000);

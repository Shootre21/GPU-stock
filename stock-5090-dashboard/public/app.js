const statusEl = document.getElementById('status');
const alertsEl = document.getElementById('alerts');
const listingsEl = document.getElementById('listings');
const storeStatusEl = document.getElementById('storeStatus');
const watchlistEl = document.getElementById('watchlist');
const scanBtn = document.getElementById('scanBtn');
const bruhSound = document.getElementById('bruhSound');
const fahhhSound = document.getElementById('fahhhSound');
const modelSummaryEl = document.getElementById('modelSummary');
const signalSummaryEl = document.getElementById('signalSummary');

let lastAlertCount = 0;
let soundConfig = { bruh: '/sounds/bruh.mp3', fahhhh: '/sounds/fahhhh.mp3' };

function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function chooseSound(listing) {
  if (!listing || !listing.price) return null;
  const price = Number(listing.price);
  if (price <= 1999.99) return 'fahhh';
  return 'bruh';
}

function deriveTrackedModels(listings = [], watchlist = []) {
  const source = [...listings, ...watchlist].map(item => String(item.title || '')).join(' | ').toLowerCase();
  const known = ['3090', '4080', '4090', '5080', '5090'];
  const found = known.filter(model => source.includes(model));
  return found.length ? found : known;
}

function computeSignalSummary(state) {
  const checks = state.storeStatus || [];
  const enabled = checks.length;
  const healthy = checks.filter(item => item.ok).length;
  const cooldown = checks.filter(item => item.diagnosis === 'cooldown_active').length;
  const stale = !state.lastScanAt || (Date.now() - new Date(state.lastScanAt).getTime()) > (10 * 60 * 1000);
  return { enabled, healthy, cooldown, stale };
}

async function loadState() {
  const res = await fetch('/api/state');
  const state = await res.json();
  if (state.soundConfig) soundConfig = state.soundConfig;
  bruhSound.src = soundConfig.bruh;
  fahhhSound.src = soundConfig.fahhhh;

  statusEl.innerHTML = `
    <div class="item"><strong>Last scan:</strong> <span class="muted">${state.lastScanAt ? new Date(state.lastScanAt).toLocaleString() : 'never'}</span></div>
    <div class="item"><strong>Scan state:</strong> <span class="${state.isScanning ? 'warn' : 'good'}">${state.isScanning ? 'scanning…' : 'idle'}</span></div>
    <div class="item"><strong>Qualifying listings:</strong> <span class="good">${(state.stores || []).length}</span></div>
    <div class="item"><strong>Total alerts kept:</strong> <span class="warn">${(state.alerts || []).length}</span></div>
    <div class="item"><strong>Watchlist targets:</strong> <span class="warn">${(state.watchlist || []).length}</span></div>
  `;

  const trackedModels = deriveTrackedModels(state.stores || [], state.watchlist || []);
  modelSummaryEl.innerHTML = `
    <div class="pill-row">${trackedModels.map(model => `<span class="pill">RTX ${esc(model)}</span>`).join('')}</div>
    <div class="muted">Watching for lower-priced / MSRP-ish matches across the current configured model set, with per-model target caps.</div>
  `;

  const signal = computeSignalSummary(state);
  signalSummaryEl.innerHTML = `
    <div class="item"><strong>Healthy stores:</strong> <span class="${signal.healthy ? 'good' : 'bad'}">${signal.healthy}/${signal.enabled || 0}</span></div>
    <div class="item"><strong>Cooldown stores:</strong> <span class="warn">${signal.cooldown}</span></div>
    <div class="item"><strong>Signal state:</strong> <span class="${signal.stale ? 'warn' : 'good'}">${signal.stale ? 'stale / degraded' : 'fresh enough'}</span></div>
  `;

  const alerts = state.alerts || [];
  alertsEl.innerHTML = alerts.length ? alerts.slice().reverse().slice(0, 12).map(alert => `
    <div class="item">
      <div><strong>${esc(alert.type)}</strong></div>
      <div class="muted">${new Date(alert.at).toLocaleString()}</div>
      <div>${alert.listing ? esc(`${alert.listing.store} — ${alert.listing.title} — $${alert.listing.price}`) : esc(alert.store || alert.error || '')}</div>
    </div>
  `).join('') : '<div class="muted">No alerts yet.</div>';

  const listings = state.stores || [];
  listingsEl.innerHTML = listings.length ? listings.map(item => `
    <div class="item product-card">
      <div class="product-media">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" />` : '<div class="image-placeholder muted">No image</div>'}</div>
      <div class="product-body">
        <div><strong>${esc(item.title)}</strong></div>
        <div class="muted">${esc(item.store)}${item.model ? ` • RTX ${esc(item.model)}` : ''} — $${esc(item.price)} — ${item.inStock ? '<span class="good">in stock</span>' : '<span class="bad">out of stock</span>'}</div>
        <div class="muted">target fit: ${item.withinTarget === false ? '<span class="bad">above target</span>' : '<span class="good">within target</span>'}</div>
        <div><a class="link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open listing</a></div>
      </div>
    </div>
  `).join('') : '<div class="muted">No qualifying listings yet. That can mean no 5090s matched, prices fell outside range, or store parsers need more tuning.</div>';

  const storeChecks = state.storeStatus || [];
  storeStatusEl.innerHTML = storeChecks.length ? storeChecks.map(item => `
    <div class="item">
      <div><strong>${esc(item.store)}</strong> — <span class="${item.ok ? 'good' : 'bad'}">${item.ok ? 'ok' : 'error'}</span></div>
      <div class="muted">checked ${item.checkedAt ? new Date(item.checkedAt).toLocaleTimeString() : 'unknown'} • seen ${esc(item.seen)} • keyword ${esc(item.matchedKeywords)} • price-ok ${esc(item.matchedPrice)} • qualifying ${esc(item.qualifying)}</div>
      <div class="muted">diagnosis: ${esc(item.diagnosis || 'unknown')} • failures ${esc(item.consecutiveFailures ?? 0)}${item.cooldownUntil ? ` • cooldown until ${esc(new Date(item.cooldownUntil).toLocaleTimeString())}` : ''}</div>
      ${item.error ? `<div class="bad">${esc(item.error)}</div>` : ''}
    </div>
  `).join('') : '<div class="muted">No store checks yet.</div>';

  const watchlist = state.watchlist || [];
  watchlistEl.innerHTML = watchlist.length ? watchlist.map(item => `
    <div class="item product-card">
      <div class="product-body">
        <div><strong>${esc(item.title || item.url)}</strong></div>
        <div class="muted">${esc(item.store || 'watchlist')}${item.model ? ` • RTX ${esc(item.model)}` : ''} — $${esc(item.price)} — ${item.inStock === false ? '<span class="bad">out of stock</span>' : '<span class="good">tracked</span>'}</div>
        <div class="muted">target fit: ${item.withinTarget === false ? '<span class="bad">above target</span>' : '<span class="good">within target</span>'}</div>
        <div><a class="link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open target</a></div>
      </div>
    </div>
  `).join('') : '<div class="muted">No manual watchlist targets yet.</div>';

  if (alerts.length > lastAlertCount) {
    const newest = alerts[alerts.length - 1];
    if (newest.type === 'new_in_stock') {
      const sound = chooseSound(newest.listing);
      try {
        if (sound === 'fahhh') await fahhhSound.play();
        else if (sound === 'bruh') await bruhSound.play();
      } catch {}
    }
  }
  lastAlertCount = alerts.length;
}

scanBtn.addEventListener('click', async () => {
  scanBtn.disabled = true;
  scanBtn.textContent = 'Scanning…';
  try {
    await fetch('/api/scan', { method: 'POST' });
    await loadState();
  } finally {
    setTimeout(() => {
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan now';
    }, 1500);
  }
});

setInterval(loadState, 5000);
loadState();

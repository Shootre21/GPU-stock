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
const heroStatsEl = document.getElementById('heroStats');
const watchlistForm = document.getElementById('watchlistForm');
const watchTitleEl = document.getElementById('watchTitle');
const watchProductIdEl = document.getElementById('watchProductId');
const watchPriceEl = document.getElementById('watchPrice');
const watchUrlEl = document.getElementById('watchUrl');

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
  const inStock = (state.stores || []).filter(item => item.inStock).length;
  const stale = !state.lastScanAt || (Date.now() - new Date(state.lastScanAt).getTime()) > (10 * 60 * 1000);
  return { enabled, healthy, cooldown, stale, inStock };
}

function metric(label, value, tone = '') {
  return `<div class="metric"><span class="metric-label">${esc(label)}</span><span class="metric-value ${tone}">${esc(value)}</span></div>`;
}

function renderHeroStats(state, signal) {
  const summary = state.summary || {};
  heroStatsEl.innerHTML = [
    metric('Listings', summary.total || 0),
    metric('In stock', summary.inStock || 0, (summary.inStock || 0) ? 'good' : 'warn'),
    metric('Within target', summary.withinTarget || 0, (summary.withinTarget || 0) ? 'good' : ''),
    metric('Healthy stores', `${signal.healthy}/${signal.enabled || 0}`, signal.healthy ? 'good' : 'bad')
  ].join('');
}

function renderListingCard(item, ctaLabel) {
  return `
    <div class="item product-card">
      <div class="product-media">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" />` : '<div class="image-placeholder muted">No image</div>'}</div>
      <div class="product-body">
        <div class="product-title"><strong>${esc(item.title)}</strong></div>
        <div class="meta-row">
          <span class="badge">${esc(item.store)}</span>
          ${item.model ? `<span class="badge">RTX ${esc(item.model)}</span>` : ''}
          ${item.brand ? `<span class="badge">${esc(item.brand)}</span>` : ''}
          ${item.edition ? `<span class="badge">${esc(item.edition)}</span>` : ''}
        </div>
        <div class="detail-row">
          <span class="good"><strong>$${esc(item.price)}</strong></span>
          <span class="${item.inStock ? 'good' : 'bad'}">${item.inStock ? 'In stock' : 'Out of stock'}</span>
          <span class="${item.withinTarget === false ? 'bad' : 'good'}">${item.withinTarget === false ? 'Above target' : 'Within target'}</span>
        </div>
        <div class="muted">Tracking ID: <code class="inline-code">${esc(item.productId || 'missing-id')}</code></div>
        <div class="detail-row">
          ${item.url ? `<a class="link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(ctaLabel)}</a>` : '<span class="muted">No URL saved</span>'}
        </div>
      </div>
    </div>
  `;
}

async function loadState() {
  const res = await fetch('/api/state');
  const state = await res.json();
  if (state.soundConfig) soundConfig = state.soundConfig;
  bruhSound.src = soundConfig.bruh;
  fahhhSound.src = soundConfig.fahhhh;

  const signal = computeSignalSummary(state);
  renderHeroStats(state, signal);

  statusEl.innerHTML = `
    <div class="item"><strong>Last scan:</strong> <span class="muted">${state.lastScanAt ? new Date(state.lastScanAt).toLocaleString() : 'never'}</span></div>
    <div class="item"><strong>Scan state:</strong> <span class="${state.isScanning ? 'warn' : 'good'}">${state.isScanning ? 'scanning…' : 'idle'}</span></div>
    <div class="item"><strong>Qualifying listings:</strong> <span class="good">${(state.summary && state.summary.total) || (state.stores || []).length}</span></div>
    <div class="item"><strong>Alerts retained:</strong> <span class="warn">${(state.alerts || []).length}</span></div>
    <div class="item"><strong>Cheapest match:</strong> <span class="good">${state.summary?.cheapest ? `$${esc(state.summary.cheapest.price)} (${esc(state.summary.cheapest.store)})` : 'none yet'}</span></div>
  `;

  const trackedModels = deriveTrackedModels(state.stores || [], state.watchlist || []);
  modelSummaryEl.innerHTML = `
    <div class="pill-row">${trackedModels.map(model => `<span class="pill">RTX ${esc(model)}</span>`).join('')}</div>
    <div class="muted">Inspired by the stronger public trackers: keep the top-level view simple, then show price and stock signal immediately.</div>
  `;

  signalSummaryEl.innerHTML = `
    <div class="item"><strong>Healthy stores:</strong> <span class="${signal.healthy ? 'good' : 'bad'}">${signal.healthy}/${signal.enabled || 0}</span></div>
    <div class="item"><strong>Cooldown stores:</strong> <span class="warn">${signal.cooldown}</span></div>
    <div class="item"><strong>In-stock listings:</strong> <span class="${signal.inStock ? 'good' : 'warn'}">${signal.inStock}</span></div>
    <div class="item"><strong>Signal state:</strong> <span class="${signal.stale ? 'warn' : 'good'}">${signal.stale ? 'stale / degraded' : 'fresh enough'}</span></div>
  `;

  const alerts = state.alerts || [];
  alertsEl.innerHTML = alerts.length ? alerts.slice().reverse().slice(0, 12).map(alert => `
    <div class="item">
      <div><strong>${esc(alert.type === 'new_in_stock' ? 'In-stock hit' : alert.type)}</strong></div>
      <div class="muted">${new Date(alert.at).toLocaleString()}</div>
      <div>${alert.listing ? esc(`${alert.listing.store} — ${alert.listing.title} — $${alert.listing.price}`) : esc(alert.store || alert.error || '')}</div>
      ${alert.listing?.productId ? `<div class="muted">ID: <code class="inline-code">${esc(alert.listing.productId)}</code></div>` : ''}
    </div>
  `).join('') : '<div class="muted">No alerts yet.</div>';

  const listings = state.stores || [];
  listingsEl.innerHTML = listings.length
    ? listings
        .slice()
        .sort((a, b) => Number(a.price) - Number(b.price))
        .map(item => renderListingCard(item, 'Open listing'))
        .join('')
    : '<div class="muted">No qualifying listings yet. That can mean no GPU matches, prices outside range, or store parsers still need tuning.</div>';

  const storeChecks = state.storeStatus || [];
  storeStatusEl.innerHTML = storeChecks.length ? storeChecks.map(item => `
    <div class="item">
      <div><strong>${esc(item.store)}</strong> — <span class="${item.ok ? 'good' : 'bad'}">${item.ok ? 'ok' : 'error'}</span></div>
      <div class="muted">checked ${item.checkedAt ? new Date(item.checkedAt).toLocaleTimeString() : 'unknown'} • seen ${esc(item.seen)} • keyword ${esc(item.matchedKeywords)} • price-ok ${esc(item.matchedPrice)} • qualifying ${esc(item.qualifying)} • in-stock ${esc(item.inStock ?? 0)}</div>
      <div class="muted">diagnosis: ${esc(item.diagnosis || 'unknown')} • failures ${esc(item.consecutiveFailures ?? 0)}${item.cooldownUntil ? ` • cooldown until ${esc(new Date(item.cooldownUntil).toLocaleTimeString())}` : ''}</div>
      ${item.error ? `<div class="bad">${esc(item.error)}</div>` : ''}
    </div>
  `).join('') : '<div class="muted">No store checks yet.</div>';

  const watchlist = state.watchlist || [];
  watchlistEl.innerHTML = watchlist.length
    ? watchlist.map(item => renderListingCard(item, 'Open target')).join('')
    : '<div class="muted">No manual watchlist targets yet.</div>';

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

watchlistForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = {
    title: watchTitleEl.value.trim(),
    productId: watchProductIdEl.value.trim(),
    price: Number(watchPriceEl.value),
    url: watchUrlEl.value.trim()
  };
  if (!payload.title || !payload.productId || !Number.isFinite(payload.price)) return;
  await fetch('/api/watchlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  watchTitleEl.value = '';
  watchProductIdEl.value = '';
  watchPriceEl.value = '';
  watchUrlEl.value = '';
  await fetch('/api/scan', { method: 'POST' });
  await loadState();
});

setInterval(loadState, 5000);
loadState();

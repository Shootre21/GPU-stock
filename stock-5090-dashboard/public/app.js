const statusEl = document.getElementById('status');
const alertsEl = document.getElementById('alerts');
const listingsEl = document.getElementById('listings');
const scanBtn = document.getElementById('scanBtn');
const bruhSound = document.getElementById('bruhSound');
const fahhhSound = document.getElementById('fahhhSound');

let lastAlertCount = 0;

function esc(s) {
  return String(s ?? '').replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function chooseSound(listing) {
  if (!listing || !listing.price) return null;
  const price = Number(listing.price);
  if (price <= 1999.99) return 'fahhh';
  return 'bruh';
}

async function loadState() {
  const res = await fetch('/api/state');
  const state = await res.json();

  statusEl.innerHTML = `
    <div class="item"><strong>Last scan:</strong> <span class="muted">${state.lastScanAt ? new Date(state.lastScanAt).toLocaleString() : 'never'}</span></div>
    <div class="item"><strong>Qualifying listings:</strong> <span class="good">${(state.stores || []).length}</span></div>
    <div class="item"><strong>Total alerts kept:</strong> <span class="warn">${(state.alerts || []).length}</span></div>
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
    <div class="item">
      <div><strong>${esc(item.title)}</strong></div>
      <div class="muted">${esc(item.store)} — $${esc(item.price)} — ${item.inStock ? '<span class="good">in stock</span>' : '<span class="bad">out of stock</span>'}</div>
      <div><a class="link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open listing</a></div>
    </div>
  `).join('') : '<div class="muted">No qualifying listings yet.</div>';

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
  try {
    await fetch('/api/scan', { method: 'POST' });
    await loadState();
  } finally {
    scanBtn.disabled = false;
  }
});

setInterval(loadState, 15000);
loadState();

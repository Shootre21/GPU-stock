const http = require('http');
const fs = require('fs');
const path = require('path');
const { storeFetchers } = require('./stores');
const { matchesKeywords, inPriceRange, listingKey } = require('./utils');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const STATE_FILE = path.join(ROOT, 'data', 'state.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = process.env.STOCK_DASHBOARD_PORT || 4388;

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function send(res, code, body, type='application/json') { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body, null, 2) : body); }

async function scan() {
  const config = readJson(CONFIG_FILE, {});
  const state = readJson(STATE_FILE, { stores: [], alerts: [], lastScanAt: null });
  const previousKeys = new Set((state.stores || []).map(listingKey));
  const nextListings = [];
  const newAlerts = [];

  for (const store of config.stores || []) {
    if (!store.enabled) continue;
    const fetcher = storeFetchers[store.id];
    if (!fetcher) continue;
    try {
      const results = await fetcher();
      for (const item of results) {
        const normalized = { ...item, store: store.id };
        if (!matchesKeywords(normalized.title, config.productKeywords)) continue;
        if (!inPriceRange(normalized.price, config.minPrice, config.maxPrice)) continue;
        nextListings.push(normalized);
        const key = listingKey(normalized);
        if (!previousKeys.has(key) && normalized.inStock) {
          newAlerts.push({ at: new Date().toISOString(), type: 'new_in_stock', listing: normalized, sound: 'BRUH_OR_FAHHH' });
        }
      }
    } catch (error) {
      newAlerts.push({ at: new Date().toISOString(), type: 'store_error', store: store.id, error: String(error) });
    }
  }

  const nextState = {
    stores: nextListings,
    alerts: [...(state.alerts || []), ...newAlerts].slice(-200),
    lastScanAt: new Date().toISOString()
  };
  writeJson(STATE_FILE, nextState);
  return nextState;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/state') return send(res, 200, readJson(STATE_FILE, {}));
  if (url.pathname === '/api/scan' && req.method === 'POST') return send(res, 200, await scan());
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    const file = path.join(PUBLIC_DIR, 'index.html');
    return send(res, 200, fs.readFileSync(file, 'utf8'), 'text/html');
  }
  if (req.method === 'GET' && url.pathname === '/styles.css') {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, 'styles.css'), 'utf8'), 'text/css');
  }
  if (req.method === 'GET' && url.pathname === '/app.js') {
    return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, 'app.js'), 'utf8'), 'application/javascript');
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`5090 stock dashboard listening on http://127.0.0.1:${PORT}`);
});

setInterval(() => { scan().catch(err => console.error('scan error', err)); }, readJson(CONFIG_FILE, { pollIntervalMs: 120000 }).pollIntervalMs || 120000);
scan().catch(err => console.error('initial scan error', err));

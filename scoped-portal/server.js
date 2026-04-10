const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 4217;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const SITES_FILE = path.join(DATA_DIR, 'sites.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SITES_FILE)) fs.writeFileSync(SITES_FILE, '[]');
if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, '[]');
if (!fs.existsSync(REQUESTS_FILE)) fs.writeFileSync(REQUESTS_FILE, '[]');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function send(res, code, body, type='application/json') { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type==='application/json' ? JSON.stringify(body, null, 2) : body); }
function audit(action, payload={}) {
  const entries = readJson(AUDIT_FILE, []);
  entries.push({ id: randomUUID(), at: new Date().toISOString(), action, ...payload });
  writeJson(AUDIT_FILE, entries.slice(-1000));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data='';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
  });
}
function defaultBrowserLaunch(origin) {
  return {
    method: 'manual_browser_login',
    steps: [
      `Open a dedicated browser profile for ${origin}`,
      `Navigate to ${origin}`,
      'Log in manually yourself',
      'Complete MFA/challenges manually if prompted',
      'Return here and mark manual login done',
      'Only allow posting or settings changes with explicit approval'
    ]
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/sites' && req.method === 'GET') return send(res, 200, readJson(SITES_FILE, []));
  if (url.pathname === '/api/audit' && req.method === 'GET') return send(res, 200, readJson(AUDIT_FILE, []).slice().reverse());
  if (url.pathname === '/api/requests' && req.method === 'GET') return send(res, 200, readJson(REQUESTS_FILE, []).slice().reverse());

  if (url.pathname === '/api/sites' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const sites = readJson(SITES_FILE, []);
      const site = {
        id: randomUUID(),
        label: body.label || '',
        origin: body.origin || '',
        notes: body.notes || '',
        status: body.status || 'pending_login',
        permissions: {
          read: !!body.permissions?.read,
          draft: !!body.permissions?.draft,
          postWithApproval: !!body.permissions?.postWithApproval,
          changeSettingsWithApproval: !!body.permissions?.changeSettingsWithApproval,
          browserLaunch: body.permissions?.browserLaunch !== false
        },
        allowedActions: body.allowedActions || ['read_page', 'draft_post', 'draft_message'],
        browserLaunch: body.browserLaunch || defaultBrowserLaunch(body.origin || ''),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastManualLoginAt: null,
        revokedAt: null
      };
      sites.push(site);
      writeJson(SITES_FILE, sites);
      audit('site_created', { siteId: site.id, origin: site.origin, label: site.label });
      return send(res, 200, site);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/sites/') && req.method === 'PATCH') {
    try {
      const id = url.pathname.split('/').pop();
      const body = await parseBody(req);
      const sites = readJson(SITES_FILE, []);
      const idx = sites.findIndex(s => s.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      const current = sites[idx];
      const next = {
        ...current,
        ...('label' in body ? { label: body.label } : {}),
        ...('origin' in body ? { origin: body.origin } : {}),
        ...('notes' in body ? { notes: body.notes } : {}),
        ...('status' in body ? { status: body.status } : {}),
        ...('lastManualLoginAt' in body ? { lastManualLoginAt: body.lastManualLoginAt } : {}),
        ...(body.allowedActions ? { allowedActions: body.allowedActions } : {}),
        ...(body.browserLaunch ? { browserLaunch: body.browserLaunch } : {}),
        permissions: body.permissions ? { ...current.permissions, ...body.permissions } : current.permissions,
        updatedAt: new Date().toISOString()
      };
      sites[idx] = next;
      writeJson(SITES_FILE, sites);
      audit('site_updated', { siteId: id, status: next.status, origin: next.origin, label: next.label });
      return send(res, 200, next);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/sites/') && url.pathname.endsWith('/revoke') && req.method === 'POST') {
    const id = url.pathname.split('/')[3];
    const sites = readJson(SITES_FILE, []);
    const idx = sites.findIndex(s => s.id === id);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    sites[idx].status = 'revoked';
    sites[idx].revokedAt = new Date().toISOString();
    sites[idx].updatedAt = new Date().toISOString();
    writeJson(SITES_FILE, sites);
    audit('site_revoked', { siteId: id, origin: sites[idx].origin, label: sites[idx].label });
    return send(res, 200, sites[idx]);
  }

  if (url.pathname.startsWith('/api/sites/') && url.pathname.endsWith('/request') && req.method === 'POST') {
    try {
      const id = url.pathname.split('/')[3];
      const body = await parseBody(req);
      const sites = readJson(SITES_FILE, []);
      const site = sites.find(s => s.id === id);
      if (!site) return send(res, 404, { error: 'Not found' });
      const requests = readJson(REQUESTS_FILE, []);
      const item = {
        id: randomUUID(),
        siteId: id,
        label: site.label,
        origin: site.origin,
        action: body.action || 'unknown_action',
        details: body.details || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        decidedAt: null
      };
      requests.push(item);
      writeJson(REQUESTS_FILE, requests);
      audit('approval_requested', { siteId: id, label: site.label, origin: site.origin, requestId: item.id, requestedAction: item.action });
      return send(res, 200, item);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/requests/') && req.method === 'PATCH') {
    try {
      const id = url.pathname.split('/').pop();
      const body = await parseBody(req);
      const requests = readJson(REQUESTS_FILE, []);
      const idx = requests.findIndex(r => r.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      requests[idx] = { ...requests[idx], status: body.status || requests[idx].status, decidedAt: new Date().toISOString() };
      writeJson(REQUESTS_FILE, requests);
      audit('approval_decided', { requestId: id, siteId: requests[idx].siteId, requestedAction: requests[idx].action, decision: requests[idx].status });
      return send(res, 200, requests[idx]);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  let filePath = url.pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(filePath);
    const type = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html';
    send(res, 200, data, type);
  });
});

server.listen(PORT, () => console.log(`Scoped portal running on http://127.0.0.1:${PORT}`));

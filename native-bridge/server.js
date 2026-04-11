const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.BROWSER_BRIDGE_PORT || 4318;
const PORTAL_BASE = process.env.SCOPED_PORTAL_BASE || 'http://127.0.0.1:4217';
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');
const PAGE_CONTEXT_FILE = path.join(DATA_DIR, 'page-context.json');
const EXECUTION_LOG_FILE = path.join(DATA_DIR, 'executions.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(QUEUE_FILE)) fs.writeFileSync(QUEUE_FILE, '[]');
if (!fs.existsSync(PAGE_CONTEXT_FILE)) fs.writeFileSync(PAGE_CONTEXT_FILE, '[]');
if (!fs.existsSync(EXECUTION_LOG_FILE)) fs.writeFileSync(EXECUTION_LOG_FILE, '[]');

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function readQueue() { return readJson(QUEUE_FILE, []); }
function writeQueue(items) { writeJson(QUEUE_FILE, items); }
function readPageContexts() { return readJson(PAGE_CONTEXT_FILE, []); }
function writePageContexts(items) { writeJson(PAGE_CONTEXT_FILE, items); }
function readExecutionLog() { return readJson(EXECUTION_LOG_FILE, []); }
function writeExecutionLog(items) { writeJson(EXECUTION_LOG_FILE, items); }
function send(res, code, body, type='application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
  });
  res.end(type === 'application/json' ? JSON.stringify(body, null, 2) : body);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (error) { reject(error); } });
  });
}
function requestPortal(pathname, method='GET', body=null) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathname, PORTAL_BASE);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname + target.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': payload.length } : {})
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) return reject(new Error(JSON.stringify(parsed)));
          resolve(parsed);
        } catch (error) {
          if (res.statusCode >= 400) return reject(new Error(data || `Portal error ${res.statusCode}`));
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}
async function mirrorDraftToPortal(item) {
  if (!item.siteId) return null;
  try {
    return await requestPortal(`/api/sites/${item.siteId}/request`, 'POST', {
      action: `draft_${item.target || 'generic'}`,
      details: item.draft || item.title || item.url || 'Draft queued from browser bridge'
    });
  } catch (error) {
    return { error: String(error) };
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/health') return send(res, 200, { ok: true, port: PORT, portalBase: PORTAL_BASE });
  if (url.pathname === '/queue' && req.method === 'GET') return send(res, 200, readQueue().slice().reverse());
  if (url.pathname === '/page-context' && req.method === 'GET') return send(res, 200, readPageContexts().slice().reverse());
  if (url.pathname === '/executions' && req.method === 'GET') return send(res, 200, readExecutionLog().slice().reverse());
  if (url.pathname === '/portal-executions' && req.method === 'GET') {
    try {
      const executions = await requestPortal('/api/executions');
      return send(res, 200, executions);
    } catch (error) {
      return send(res, 502, { error: String(error) });
    }
  }
  if (url.pathname === '/queue-draft' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const queue = readQueue();
      const item = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        state: 'pending_approval',
        siteId: body.siteId || null,
        url: body.url || '',
        title: body.title || '',
        target: body.target || 'generic',
        draft: body.draft || '',
        pageContextId: body.pageContextId || null,
        executionId: body.executionId || null
      };
      queue.push(item);
      writeQueue(queue);
      const portalRequest = await mirrorDraftToPortal(item);
      return send(res, 200, { ...item, portalRequest });
    } catch (error) {
      return send(res, 400, { error: String(error) });
    }
  }
  if (url.pathname === '/page-context' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const items = readPageContexts();
      const item = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        siteId: body.siteId || null,
        platform: body.platform || 'generic',
        url: body.url || '',
        title: body.title || '',
        textSample: body.textSample || ''
      };
      items.push(item);
      writePageContexts(items.slice(-200));
      return send(res, 200, item);
    } catch (error) {
      return send(res, 400, { error: String(error) });
    }
  }
  if (url.pathname === '/execution-result' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const items = readExecutionLog();
      const item = {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        executionId: body.executionId || null,
        siteId: body.siteId || null,
        state: body.state || 'reported',
        detail: body.detail || '',
        url: body.url || ''
      };
      items.push(item);
      writeExecutionLog(items.slice(-300));
      if (body.executionId) {
        try { await requestPortal(`/api/executions/${body.executionId}`, 'PATCH', { state: body.state || 'executed' }); } catch {}
      }
      return send(res, 200, item);
    } catch (error) {
      return send(res, 400, { error: String(error) });
    }
  }
  return send(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`Larry native browser bridge running on http://127.0.0.1:${PORT}`);
});

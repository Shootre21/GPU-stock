const http = require('http');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const PORT = process.env.BROWSER_BRIDGE_PORT || 4318;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'queue.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(QUEUE_FILE)) fs.writeFileSync(QUEUE_FILE, '[]');

function readQueue() { try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch { return []; } }
function writeQueue(items) { fs.writeFileSync(QUEUE_FILE, JSON.stringify(items, null, 2)); }
function send(res, code, body, type='application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (url.pathname === '/health') return send(res, 200, { ok: true, port: PORT });
  if (url.pathname === '/queue' && req.method === 'GET') return send(res, 200, readQueue().slice().reverse());
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
        draft: body.draft || ''
      };
      queue.push(item);
      writeQueue(queue);
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

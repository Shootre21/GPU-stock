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
const EXECUTIONS_FILE = path.join(DATA_DIR, 'executions.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
const WORKER_FILE = path.join(DATA_DIR, 'worker-state.json');
const BRIDGE_BASE = process.env.BRIDGE_BASE || 'http://127.0.0.1:4318';

fs.mkdirSync(DATA_DIR, { recursive: true });
for (const [file, empty] of [[SITES_FILE,'[]'],[AUDIT_FILE,'[]'],[REQUESTS_FILE,'[]'],[EXECUTIONS_FILE,'[]'],[JOBS_FILE,'[]'],[WORKER_FILE,'{}']]) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, empty);
}

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2)); }
function send(res, code, body, type='application/json') { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' }); res.end(type==='application/json' ? JSON.stringify(body, null, 2) : body); }
function audit(action, payload={}) { const entries = readJson(AUDIT_FILE, []); entries.push({ id: randomUUID(), at: new Date().toISOString(), action, ...payload }); writeJson(AUDIT_FILE, entries.slice(-1500)); }
function parseBody(req) { return new Promise((resolve, reject) => { let data=''; req.on('data', c => data += c); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } }); }); }
function requestJson(targetUrl) {
  return new Promise((resolve, reject) => {
    const target = new URL(targetUrl);
    const req = http.request({ hostname: target.hostname, port: target.port, path: target.pathname + target.search, method: 'GET' }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) return reject(new Error(data || `HTTP ${res.statusCode}`));
          resolve(data ? JSON.parse(data) : {});
        } catch (error) { reject(error); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
function defaultBrowserLaunch(origin) {
  return {
    method: 'manual_browser_login',
    targetOrigin: origin,
    browserProfile: 'openclaw-controlled',
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
function normalizeSite(body) {
  return {
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
    session: {
      browserProfile: body.browserLaunch?.browserProfile || 'openclaw-controlled',
      state: 'not_started',
      freshness: 'unknown',
      lastManualLoginAt: null,
      lastValidatedAt: null,
      lastExecutionAt: null,
      browserHookStatus: 'placeholder_only'
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    revokedAt: null
  };
}

function findXSite() {
  const sites = readJson(SITES_FILE, []);
  return sites.find(site => /x\.com|twitter\.com/i.test(site.origin || site.label || '')) || null;
}

function normalizeJob(body, site) {
  return {
    id: randomUUID(),
    siteId: site.id,
    platform: body.platform || 'x',
    kind: body.kind || 'post',
    text: body.text || '',
    state: 'queued',
    priority: body.priority || 'normal',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    claimedAt: null,
    claimedBy: null,
    completedAt: null,
    lastError: null,
    logs: [{ at: new Date().toISOString(), message: 'Job created in portal v6 engine.' }],
    siteLabel: site.label,
    siteOrigin: site.origin
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
    });
    return res.end();
  }
  if (url.pathname === '/api/sites' && req.method === 'GET') return send(res, 200, readJson(SITES_FILE, []));
  if (url.pathname === '/api/audit' && req.method === 'GET') return send(res, 200, readJson(AUDIT_FILE, []).slice().reverse());
  if (url.pathname === '/api/requests' && req.method === 'GET') return send(res, 200, readJson(REQUESTS_FILE, []).slice().reverse());
  if (url.pathname === '/api/executions' && req.method === 'GET') return send(res, 200, readJson(EXECUTIONS_FILE, []).slice().reverse());
  if (url.pathname === '/api/jobs' && req.method === 'GET') return send(res, 200, readJson(JOBS_FILE, []).slice().reverse());
  if (url.pathname === '/api/worker' && req.method === 'GET') return send(res, 200, readJson(WORKER_FILE, {}));
  if (url.pathname === '/api/bridge/queue' && req.method === 'GET') {
    try { return send(res, 200, await requestJson(`${BRIDGE_BASE}/queue`)); } catch (e) { return send(res, 502, { error: String(e) }); }
  }
  if (url.pathname === '/api/bridge/page-context' && req.method === 'GET') {
    try { return send(res, 200, await requestJson(`${BRIDGE_BASE}/page-context`)); } catch (e) { return send(res, 502, { error: String(e) }); }
  }
  if (url.pathname === '/api/create-x-post' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const xSite = findXSite();
      if (!xSite) return send(res, 404, { error: 'No X site is registered in the portal.' });
      const jobs = readJson(JOBS_FILE, []);
      const job = normalizeJob({ ...body, platform: 'x', kind: 'post' }, xSite);
      jobs.push(job);
      writeJson(JOBS_FILE, jobs);
      const execs = readJson(EXECUTIONS_FILE, []);
      const item = {
        id: randomUUID(),
        siteId: xSite.id,
        jobId: job.id,
        label: xSite.label,
        origin: xSite.origin,
        action: 'post_x',
        payload: body.text || '',
        requestId: null,
        state: 'queued',
        executionBridge: 'x_execution_loop',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executedAt: null,
        approvalMode: body.approvalMode || 'explicit_command'
      };
      execs.push(item);
      writeJson(EXECUTIONS_FILE, execs);
      audit('x_post_created', { executionId: item.id, siteId: item.siteId, requestedAction: item.action, jobId: job.id });
      return send(res, 200, { job, execution: item });
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname === '/api/worker/heartbeat' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const current = readJson(WORKER_FILE, {});
      const next = {
        ...current,
        workerId: body.workerId || current.workerId || 'local-browser-worker',
        platform: body.platform || current.platform || 'x',
        status: body.status || 'online',
        activeUrl: body.activeUrl || current.activeUrl || '',
        activeTabTitle: body.activeTabTitle || current.activeTabTitle || '',
        lastSeenAt: new Date().toISOString(),
        note: body.note || current.note || ''
      };
      writeJson(WORKER_FILE, next);
      audit('worker_heartbeat', { requestedAction: next.status, origin: next.activeUrl || '', label: next.workerId });
      return send(res, 200, next);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname === '/api/worker/next' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const jobs = readJson(JOBS_FILE, []);
      const job = jobs.find(item => item.state === 'queued' && (body.platform ? item.platform === body.platform : true));
      if (!job) return send(res, 200, null);
      job.state = 'claimed';
      job.claimedAt = new Date().toISOString();
      job.claimedBy = body.workerId || 'local-browser-worker';
      job.updatedAt = new Date().toISOString();
      job.logs.push({ at: new Date().toISOString(), message: `Claimed by ${job.claimedBy}.` });
      writeJson(JOBS_FILE, jobs);
      audit('job_claimed', { requestedAction: job.kind, siteId: job.siteId, executionId: job.id, label: job.claimedBy });
      return send(res, 200, job);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/jobs/') && req.method === 'PATCH') {
    try {
      const id = url.pathname.split('/').pop();
      const body = await parseBody(req);
      const jobs = readJson(JOBS_FILE, []);
      const idx = jobs.findIndex(j => j.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      const logs = jobs[idx].logs || [];
      if (body.log) logs.push({ at: new Date().toISOString(), message: body.log });
      jobs[idx] = {
        ...jobs[idx],
        state: body.state || jobs[idx].state,
        updatedAt: new Date().toISOString(),
        completedAt: ['posted', 'failed', 'cancelled'].includes(body.state) ? new Date().toISOString() : jobs[idx].completedAt,
        lastError: body.lastError || jobs[idx].lastError || null,
        logs
      };
      writeJson(JOBS_FILE, jobs);
      audit('job_updated', { executionId: id, requestedAction: jobs[idx].kind, decision: jobs[idx].state, siteId: jobs[idx].siteId });
      return send(res, 200, jobs[idx]);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname === '/api/sites' && req.method === 'POST') {
    try {
      const body = await parseBody(req); const sites = readJson(SITES_FILE, []); const site = normalizeSite(body);
      sites.push(site); writeJson(SITES_FILE, sites); audit('site_created', { siteId: site.id, origin: site.origin, label: site.label });
      return send(res, 200, site);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/sites/') && req.method === 'PATCH' && !url.pathname.endsWith('/revoke') && !url.pathname.endsWith('/request') && !url.pathname.endsWith('/launch-login') && !url.pathname.endsWith('/queue-execution')) {
    try {
      const id = url.pathname.split('/').pop(); const body = await parseBody(req); const sites = readJson(SITES_FILE, []); const idx = sites.findIndex(s => s.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      const current = sites[idx];
      const next = {
        ...current,
        ...('label' in body ? { label: body.label } : {}),
        ...('origin' in body ? { origin: body.origin } : {}),
        ...('notes' in body ? { notes: body.notes } : {}),
        ...('status' in body ? { status: body.status } : {}),
        ...(body.allowedActions ? { allowedActions: body.allowedActions } : {}),
        ...(body.browserLaunch ? { browserLaunch: body.browserLaunch } : {}),
        permissions: body.permissions ? { ...current.permissions, ...body.permissions } : current.permissions,
        session: body.session ? { ...current.session, ...body.session } : current.session,
        updatedAt: new Date().toISOString()
      };
      sites[idx] = next; writeJson(SITES_FILE, sites); audit('site_updated', { siteId: id, status: next.status, origin: next.origin, label: next.label });
      return send(res, 200, next);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/sites/') && url.pathname.endsWith('/revoke') && req.method === 'POST') {
    const id = url.pathname.split('/')[3]; const sites = readJson(SITES_FILE, []); const idx = sites.findIndex(s => s.id === id);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    sites[idx].status = 'revoked'; sites[idx].revokedAt = new Date().toISOString(); sites[idx].updatedAt = new Date().toISOString(); sites[idx].session.state = 'revoked';
    writeJson(SITES_FILE, sites); audit('site_revoked', { siteId: id, origin: sites[idx].origin, label: sites[idx].label }); return send(res, 200, sites[idx]);
  }

  if (url.pathname.startsWith('/api/sites/') && url.pathname.endsWith('/launch-login') && req.method === 'POST') {
    const id = url.pathname.split('/')[3]; const sites = readJson(SITES_FILE, []); const idx = sites.findIndex(s => s.id === id);
    if (idx === -1) return send(res, 404, { error: 'Not found' });
    sites[idx].session.state = 'login_requested'; sites[idx].updatedAt = new Date().toISOString();
    writeJson(SITES_FILE, sites); audit('login_launch_requested', { siteId: id, origin: sites[idx].origin, label: sites[idx].label, browserProfile: sites[idx].session.browserProfile });
    return send(res, 200, { message: 'Login launch scaffold recorded', browserLaunch: sites[idx].browserLaunch, session: sites[idx].session });
  }

  if (url.pathname.startsWith('/api/sites/') && url.pathname.endsWith('/request') && req.method === 'POST') {
    try {
      const id = url.pathname.split('/')[3]; const body = await parseBody(req); const sites = readJson(SITES_FILE, []); const site = sites.find(s => s.id === id);
      if (!site) return send(res, 404, { error: 'Not found' });
      const requests = readJson(REQUESTS_FILE, []);
      const item = { id: randomUUID(), siteId: id, label: site.label, origin: site.origin, action: body.action || 'unknown_action', details: body.details || '', status: 'pending', createdAt: new Date().toISOString(), decidedAt: null };
      requests.push(item); writeJson(REQUESTS_FILE, requests); audit('approval_requested', { siteId: id, label: site.label, origin: site.origin, requestId: item.id, requestedAction: item.action });
      return send(res, 200, item);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/requests/') && req.method === 'PATCH') {
    try {
      const id = url.pathname.split('/').pop(); const body = await parseBody(req); const requests = readJson(REQUESTS_FILE, []); const idx = requests.findIndex(r => r.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      requests[idx] = { ...requests[idx], status: body.status || requests[idx].status, decidedAt: new Date().toISOString() }; writeJson(REQUESTS_FILE, requests);
      audit('approval_decided', { requestId: id, siteId: requests[idx].siteId, requestedAction: requests[idx].action, decision: requests[idx].status });
      return send(res, 200, requests[idx]);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/sites/') && url.pathname.endsWith('/queue-execution') && req.method === 'POST') {
    try {
      const id = url.pathname.split('/')[3]; const body = await parseBody(req); const sites = readJson(SITES_FILE, []); const siteIdx = sites.findIndex(s => s.id === id);
      if (siteIdx === -1) return send(res, 404, { error: 'Not found' });
      const execs = readJson(EXECUTIONS_FILE, []);
      const item = {
        id: randomUUID(),
        siteId: id,
        label: sites[siteIdx].label,
        origin: sites[siteIdx].origin,
        action: body.action || 'unknown_action',
        payload: body.payload || '',
        requestId: body.requestId || null,
        state: 'queued',
        executionBridge: 'placeholder_only',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        executedAt: null
      };
      execs.push(item); writeJson(EXECUTIONS_FILE, execs);
      sites[siteIdx].session.lastExecutionAt = new Date().toISOString(); sites[siteIdx].session.browserHookStatus = 'execution_queued_placeholder'; sites[siteIdx].updatedAt = new Date().toISOString(); writeJson(SITES_FILE, sites);
      audit('execution_queued', { executionId: item.id, siteId: id, requestedAction: item.action, requestId: item.requestId });
      return send(res, 200, item);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname.startsWith('/api/executions/') && req.method === 'PATCH') {
    try {
      const id = url.pathname.split('/').pop(); const body = await parseBody(req); const execs = readJson(EXECUTIONS_FILE, []); const idx = execs.findIndex(x => x.id === id);
      if (idx === -1) return send(res, 404, { error: 'Not found' });
      execs[idx] = {
        ...execs[idx],
        state: body.state || execs[idx].state,
        bridgeResult: body.bridgeResult || execs[idx].bridgeResult || null,
        updatedAt: new Date().toISOString(),
        executedAt: body.state === 'executed' ? new Date().toISOString() : execs[idx].executedAt
      };
      writeJson(EXECUTIONS_FILE, execs); audit('execution_updated', { executionId: id, state: execs[idx].state, siteId: execs[idx].siteId, requestedAction: execs[idx].action });
      return send(res, 200, execs[idx]);
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  if (url.pathname === '/api/bridge/page-context' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      audit('bridge_page_context', { siteId: body.siteId || null, origin: body.url || '', requestedAction: body.platform || 'generic' });
      return send(res, 200, { ok: true, storedAt: new Date().toISOString() });
    } catch (e) { return send(res, 400, { error: String(e) }); }
  }

  let filePath = url.pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const ext = path.extname(filePath); const type = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html'; send(res, 200, data, type);
  });
});

server.listen(PORT, () => console.log(`Scoped portal running on http://127.0.0.1:${PORT}`));

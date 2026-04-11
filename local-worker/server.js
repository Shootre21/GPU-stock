const http = require('http');

const PORTAL_BASE = process.env.SCOPED_PORTAL_BASE || 'http://127.0.0.1:4217';
const WORKER_ID = process.env.PORTAL_WORKER_ID || 'portal-local-worker';
const PLATFORM = process.env.PORTAL_WORKER_PLATFORM || 'x';
const HEARTBEAT_MS = Number(process.env.PORTAL_WORKER_HEARTBEAT_MS || 15000);
const CLAIM_MS = Number(process.env.PORTAL_WORKER_CLAIM_MS || 20000);

function requestPortal(pathname, method = 'GET', body = null) {
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
          if (res.statusCode >= 400) return reject(new Error(data || `HTTP ${res.statusCode}`));
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function heartbeat(note = 'Worker online.') {
  try {
    const result = await requestPortal('/api/worker/heartbeat', 'POST', {
      workerId: WORKER_ID,
      platform: PLATFORM,
      status: 'online',
      activeUrl: '',
      activeTabTitle: '',
      note
    });
    console.log('[heartbeat]', result.lastSeenAt || 'ok', note);
    return result;
  } catch (error) {
    console.error('[heartbeat:error]', String(error));
    return null;
  }
}

async function claimNextJob() {
  try {
    return await requestPortal('/api/worker/next', 'POST', {
      workerId: WORKER_ID,
      platform: PLATFORM
    });
  } catch (error) {
    console.error('[claim:error]', String(error));
    return null;
  }
}

async function updateJob(jobId, body) {
  try {
    return await requestPortal(`/api/jobs/${jobId}`, 'PATCH', body);
  } catch (error) {
    console.error('[job:update:error]', jobId, String(error));
    return null;
  }
}

async function pollJobs() {
  const job = await claimNextJob();
  if (!job || !job.id) {
    console.log('[claim] no queued jobs');
    return;
  }
  console.log('[claim] job', job.id, job.platform, job.kind);
  await updateJob(job.id, {
    state: 'staging',
    log: 'Claimed by local worker service. Waiting for browser executor hookup.'
  });
  await heartbeat(`Claimed job ${job.id}.`);
}

async function main() {
  console.log(`Portal local worker starting for ${PORTAL_BASE} as ${WORKER_ID}`);
  await heartbeat('Worker service started.');
  setInterval(() => { heartbeat('Worker heartbeat tick.'); }, HEARTBEAT_MS);
  setInterval(() => { pollJobs(); }, CLAIM_MS);
}

main().catch(error => {
  console.error('[fatal]', error);
  process.exit(1);
});

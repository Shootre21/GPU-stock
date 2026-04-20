import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const jobsDir = path.join(root, 'jobs');
const logsDir = path.join(root, 'logs');
const workerLog = path.join(logsDir, 'worker.log');

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  fs.appendFileSync(workerLog, line + '\n');
}

function loadJobs() {
  return fs.readdirSync(jobsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ file: f, data: JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8')) }))
    .sort((a, b) => new Date(a.data.createdAt) - new Date(b.data.createdAt));
}

function saveJob(file, job) {
  job.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(jobsDir, file), JSON.stringify(job, null, 2));
}

function transition(file, job, state, message, failureReason = null) {
  job.state = state;
  job.failureReason = failureReason;
  job.logs.push({ at: new Date().toISOString(), message });
  saveJob(file, job);
  log(`${job.id} -> ${state}: ${message}`);
}

async function processJob(file, job) {
  transition(file, job, 'browser_ready', 'Placeholder browser readiness check passed.');
  transition(file, job, 'staging', 'Placeholder compose stage reached.');
  transition(file, job, 'ready', 'Sentence staged in placeholder pipeline; real Chromium executor not wired yet.');
}

async function tick() {
  const queued = loadJobs().find(({ data }) => data.state === 'queued');
  if (!queued) return;
  await processJob(queued.file, queued.data);
}

log('X Post Deployer worker started.');
setInterval(() => { tick().catch(err => log(`tick error: ${err.message}`)); }, cfg.jobPollMs);

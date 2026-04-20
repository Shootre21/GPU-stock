import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root = path.resolve('.');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const jobsDir = path.join(root, 'jobs');
const text = process.argv.slice(2).join(' ').trim();

if (!text) {
  console.error('Usage: node submit.js "one sentence"');
  process.exit(1);
}

if (text.length > cfg.maxPostLength) {
  console.error(`Sentence too long (${text.length}/${cfg.maxPostLength})`);
  process.exit(1);
}

const existing = fs.readdirSync(jobsDir)
  .filter(f => f.endsWith('.json'))
  .map(f => JSON.parse(fs.readFileSync(path.join(jobsDir, f), 'utf8')))
  .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

const now = Date.now();
const duplicate = existing.find(job => job.text === text && (now - new Date(job.createdAt).getTime()) < cfg.dedupeWindowMs);
if (duplicate) {
  console.error(`Duplicate recent job exists: ${duplicate.id}`);
  process.exit(1);
}

const job = {
  id: randomUUID(),
  text,
  state: 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  logs: [{ at: new Date().toISOString(), message: 'Job queued.' }],
  failureReason: null
};

fs.writeFileSync(path.join(jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2));
console.log(JSON.stringify(job, null, 2));

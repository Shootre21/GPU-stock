import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const TARGET_URL = 'https://gemini.google.com/app';
const OUTPUT_DIR = path.resolve(process.cwd(), 'capture-output-gemini');
const PROFILE_DIR = path.resolve(process.cwd(), '.playwright-gemini-profile');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const browser = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    viewport: { width: 1440, height: 960 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = browser.pages()[0] || await browser.newPage();
  const networkLog = [];

  page.on('requestfinished', async (request) => {
    const url = request.url();
    if (/gemini|google|oauth|accounts|bard|generativelanguage/i.test(url)) {
      networkLog.push({
        url,
        method: request.method(),
        headers: request.headers(),
      });
    }
  });

  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  console.log('[gemini-session-capture] Opened Gemini web app.');
  console.log('[gemini-session-capture] Sign in if needed and let the target page settle.');
  console.log('[gemini-session-capture] Waiting 90 seconds before auto-capture...');

  await page.waitForTimeout(90000);

  const cookies = await browser.cookies();
  const state = await browser.storageState();
  const html = await page.content();
  const pageUrl = page.url();
  const pageTitle = await page.title();

  const candidateHeaders = networkLog
    .filter((entry) => Object.keys(entry.headers || {}).some((k) => /authorization|x-goog|cookie/i.test(k)))
    .slice(0, 50);

  const keyLikeStrings = [...new Set([
    ...(html.match(/AIza[0-9A-Za-z\-_]{20,}/g) || []),
    ...(html.match(/ya29\.[0-9A-Za-z\-_]+/g) || []),
  ])];

  await writeJson(path.join(OUTPUT_DIR, 'cookies.json'), cookies);
  await writeJson(path.join(OUTPUT_DIR, 'storage-state.json'), state);
  await writeJson(path.join(OUTPUT_DIR, 'network-log.json'), networkLog);
  await writeJson(path.join(OUTPUT_DIR, 'candidate-headers.json'), candidateHeaders);
  await writeJson(path.join(OUTPUT_DIR, 'summary.json'), {
    pageUrl,
    pageTitle,
    keyLikeStrings,
    cookieCount: cookies.length,
    candidateHeaderEntries: candidateHeaders.length,
    capturedAt: new Date().toISOString(),
  });

  await fs.writeFile(path.join(OUTPUT_DIR, 'page.html'), html, 'utf8');

  console.log('[gemini-session-capture] Capture complete.');
  console.log(JSON.stringify({ pageUrl, pageTitle, keyLikeStrings, cookieCount: cookies.length, candidateHeaderEntries: candidateHeaders.length }, null, 2));
  console.log(`[gemini-session-capture] Output dir: ${OUTPUT_DIR}`);

  await browser.close();
}

main().catch((err) => {
  console.error('[gemini-session-capture] FAILED', err);
  process.exit(1);
});

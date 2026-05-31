import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const OUTPUT_DIR = process.env.GOOGLE_CAPTURE_DIR || path.resolve(process.cwd(), 'capture-output');
const AI_STUDIO_URL = 'https://aistudio.google.com/app/apikey';
const PROFILE_DIR = process.env.GOOGLE_CAPTURE_PROFILE || path.resolve(process.cwd(), '.playwright-google-profile');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(file, data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  await ensureDir(OUTPUT_DIR);

  const executablePathCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ];

  const browserPath = executablePathCandidates[0];

  console.log('[google-capture] Launching headed browser...');
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    executablePath: browserPath,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || await context.newPage();
  const networkLog = [];

  page.on('response', async (response) => {
    const url = response.url();
    if (/googleapis\.com|aistudio\.google\.com|generativelanguage|oauth/i.test(url)) {
      networkLog.push({
        url,
        status: response.status(),
        headers: response.headers(),
      });
    }
  });

  await page.goto(AI_STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  console.log('[google-capture] Browser opened to Google AI Studio.');
  console.log('[google-capture] Please sign in manually if needed.');
  console.log('[google-capture] After the API key page is fully loaded, press ENTER in this terminal to capture browser state.');

  process.stdin.resume();
  await new Promise((resolve) => process.stdin.once('data', resolve));

  console.log('[google-capture] Capturing state...');

  const cookies = await context.cookies();
  const state = await context.storageState();
  const pageUrl = page.url();
  const pageTitle = await page.title();
  const html = await page.content();

  const keyLikeStrings = [];
  const keyRegexes = [
    /AIza[0-9A-Za-z\-_]{20,}/g,
    /ya29\.[0-9A-Za-z\-_]+/g,
  ];

  for (const re of keyRegexes) {
    const matches = html.match(re);
    if (matches) keyLikeStrings.push(...matches);
  }

  await writeJson(path.join(OUTPUT_DIR, 'cookies.json'), cookies);
  await writeJson(path.join(OUTPUT_DIR, 'storage-state.json'), state);
  await writeJson(path.join(OUTPUT_DIR, 'network-log.json'), networkLog);
  await writeJson(path.join(OUTPUT_DIR, 'summary.json'), {
    pageUrl,
    pageTitle,
    keyLikeStrings: [...new Set(keyLikeStrings)],
    cookieCount: cookies.length,
    capturedAt: new Date().toISOString(),
  });

  await fs.writeFile(path.join(OUTPUT_DIR, 'page.html'), html, 'utf8');

  console.log(`[google-capture] Capture complete. Output written to: ${OUTPUT_DIR}`);
  console.log('[google-capture] Summary:');
  console.log(JSON.stringify({ pageUrl, pageTitle, keyLikeStrings: [...new Set(keyLikeStrings)], cookieCount: cookies.length }, null, 2));
  console.log('[google-capture] Press ENTER to close the browser.');

  await new Promise((resolve) => process.stdin.once('data', resolve));
  await context.close();
}

main().catch((err) => {
  console.error('[google-capture] FAILED', err);
  process.exit(1);
});

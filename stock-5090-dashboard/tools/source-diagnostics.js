#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const DEFAULT_TIMEOUT_MS = 10000;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function headers(config = {}) {
  return {
    'user-agent': config?.goodBot?.userAgent || 'GPUHunterWatcher/1.0 (+local personal stock alert; no purchase automation)',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };
}

async function fetchText(url, config = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: headers(config), signal: controller.signal });
    const body = await Promise.race([
      response.text(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('body_read_timeout')), timeoutMs))
    ]);
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function robotsAllows(robots = '', targetPath = '/') {
  const rules = [];
  let applies = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [keyRaw, ...rest] = line.split(':');
    const key = String(keyRaw || '').trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'user-agent') applies = value === '*' || /gpuhunter|watcher|bot/i.test(value);
    if (applies && (key === 'allow' || key === 'disallow')) rules.push({ key, value });
  }
  let winner = null;
  for (const rule of rules) {
    if (!rule.value) continue;
    const pattern = '^' + rule.value.split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    if (!new RegExp(pattern).test(targetPath)) continue;
    const score = rule.value.replace(/\*/g, '').length;
    if (!winner || score > winner.score || (score === winner.score && rule.key === 'allow')) winner = { ...rule, score };
  }
  return !winner || winner.key !== 'disallow';
}

function classifyProtection(response, body = '') {
  const text = String(body).toLowerCase();
  const productSignals = [
    '__next_data__',
    'application/ld+json',
    'product',
    'availability',
    'price',
    'add to cart',
    'rtx',
    'geforce'
  ].filter(signal => text.includes(signal));
  const challengeSignals = {
    captcha: /captcha/.test(text),
    datadome: /datadome|geo\.captcha-delivery\.com|ct\.captcha-delivery\.com/.test(text),
    cloudflare: /cloudflare|just a moment|cf-ray|sorry, you have been blocked/.test(text),
    humanVerification: /verify you are human|checking your browser|robot or human\?|disable any ad blocker/.test(text),
    accessDenied: /access denied|pardon our interruption/.test(text)
  };
  const challenged = Object.values(challengeSignals).some(Boolean) && productSignals.length < 3;
  let diagnosis = 'public_page_parseable_or_unknown';
  if (challenged) diagnosis = 'human_verification_required';
  else if ([401, 403].includes(response.status)) diagnosis = 'blocked_http';
  else if ([409, 412, 429].includes(response.status)) diagnosis = 'rate_or_bot_limited';
  else if ([503, 504].includes(response.status)) diagnosis = 'temporarily_unavailable';

  return {
    diagnosis,
    challenged,
    challengeSignals,
    productSignals,
    productSignalCount: productSignals.length
  };
}

function structuredDataSummary(body = '') {
  const jsonLdCount = (body.match(/application\/ld\+json/gi) || []).length;
  const nextData = /id=["']__NEXT_DATA__["']/i.test(body);
  const priceMentions = (body.match(/\$\s*[\d,]+(?:\.\d{2})?/g) || []).slice(0, 6);
  const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  return {
    title: title ? title.replace(/\s+/g, ' ').trim() : null,
    jsonLdCount,
    hasNextData: nextData,
    priceMentions
  };
}

function urlsForArg(arg, config) {
  if (/^https?:\/\//i.test(arg)) return [{ store: 'url', url: arg }];
  const store = (config.stores || []).find(entry => entry.id === arg);
  if (!store) throw new Error(`Unknown store or URL: ${arg}`);
  return (store.urls || []).slice(0, store.maxUrlsPerCheck || 4).map(url => ({ store: store.id, url }));
}

async function inspectUrl(target, config) {
  const parsed = new URL(target.url);
  const robotsUrl = `${parsed.origin}/robots.txt`;
  let robots = { checked: false, allowed: true, url: robotsUrl };
  try {
    const robotResult = await fetchText(robotsUrl, config, 5000);
    robots = {
      checked: true,
      url: robotsUrl,
      status: robotResult.response.status,
      allowed: robotResult.response.ok ? robotsAllows(robotResult.body, `${parsed.pathname}${parsed.search}`) : true
    };
  } catch (error) {
    robots = { ...robots, checked: true, unavailable: true, error: String(error.message || error) };
  }

  if (!robots.allowed) {
    return {
      store: target.store,
      url: target.url,
      robots,
      diagnosis: 'robots_txt_disallowed',
      action: 'do_not_fetch_path'
    };
  }

  try {
    const started = Date.now();
    const { response, body } = await fetchText(target.url, config, Number(config.storeTimeoutMs || DEFAULT_TIMEOUT_MS));
    const protection = classifyProtection(response, body);
    return {
      store: target.store,
      url: target.url,
      httpStatus: response.status,
      finalUrl: response.url,
      elapsedMs: Date.now() - started,
      bytes: body.length,
      robots,
      ...protection,
      structuredData: structuredDataSummary(body),
      action: protection.challenged ? 'back_off_and_report_status' : 'parse_structured_product_data'
    };
  } catch (error) {
    return {
      store: target.store,
      url: target.url,
      robots,
      diagnosis: String(error.message || error).includes('abort') ? 'timeout' : 'fetch_error',
      error: String(error.message || error),
      action: 'back_off_and_report_status'
    };
  }
}

async function main() {
  const config = readJson(CONFIG_FILE, {});
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node tools/source-diagnostics.js asus amd walmart https://example.com/product');
    process.exit(2);
  }

  const targets = args.flatMap(arg => urlsForArg(arg, config));
  const results = [];
  for (const target of targets) {
    results.push(await inspectUrl(target, config));
    await sleep(Math.min(Number(config.minStoreRequestDelayMs || 3000), 10000));
  }
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

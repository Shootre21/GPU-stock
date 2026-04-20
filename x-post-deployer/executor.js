import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function detectBrowserBinary() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/mnt/c/Program Files/Google/Chrome/Application/chrome.exe',
    '/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p)) || null;
}

export function detectAutomationLib(root) {
  const hasPlaywright = fs.existsSync(path.join(root, 'node_modules', 'playwright'));
  const hasPuppeteer = fs.existsSync(path.join(root, 'node_modules', 'puppeteer'));
  if (hasPlaywright) return 'playwright';
  if (hasPuppeteer) return 'puppeteer';
  return null;
}

export function browserDiagnostics(root) {
  return {
    browserBinary: detectBrowserBinary(),
    automationLibrary: detectAutomationLib(root),
    xReachable: null
  };
}

export async function executeSentencePost(root, cfg, job) {
  const diag = browserDiagnostics(root);
  if (!diag.browserBinary) {
    return {
      ok: false,
      state: 'failed',
      reason: 'browser_not_available',
      message: 'No Chromium/Chrome binary found on this machine.'
    };
  }
  if (!diag.automationLibrary) {
    return {
      ok: false,
      state: 'failed',
      reason: 'automation_library_missing',
      message: 'No Playwright or Puppeteer dependency installed for X automation.'
    };
  }

  return {
    ok: false,
    state: 'failed',
    reason: 'executor_not_implemented',
    message: `Detected ${diag.automationLibrary} and browser binary at ${diag.browserBinary}, but real X executor is not implemented yet.`
  };
}

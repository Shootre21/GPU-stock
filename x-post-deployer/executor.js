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

  if (diag.automationLibrary === 'playwright') {
    const { chromium } = await import('playwright');
    const userDataDir = path.resolve(root, cfg.browserProfilePath || './profile');
    fs.mkdirSync(userDataDir, { recursive: true });

    let context;
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: undefined,
        executablePath: diag.browserBinary,
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
      });
    } catch (error) {
      const msg = String(error?.message || error);
      if (msg.includes('Remote debugging pipe file descriptors are not open')) {
        return {
          ok: false,
          state: 'failed',
          reason: 'wsl_windows_chrome_pipe_unsupported',
          message: 'Playwright cannot launch the Windows Chrome binary from WSL via remote-debugging-pipe. A Linux Chromium binary or remote CDP attach flow is needed.'
        };
      }
      return {
        ok: false,
        state: 'failed',
        reason: 'browser_launch_failed',
        message: `Browser launch failed: ${msg.split('\n')[0]}`
      };
    }

    try {
      const page = context.pages()[0] || await context.newPage();
      await page.goto(cfg.xHomeUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);

      const loggedOut = await page.locator('a[href="/login"], input[name="text"]').first().isVisible().catch(() => false);
      if (loggedOut) {
        return {
          ok: false,
          state: 'failed',
          reason: 'not_logged_in',
          message: 'X account is not logged in in the deployer browser profile.'
        };
      }

      const composeButton = page.locator('[data-testid="SideNav_NewTweet_Button"], a[href="/compose/post"]');
      if (await composeButton.first().isVisible().catch(() => false)) {
        await composeButton.first().click();
        await page.waitForTimeout(1500);
      }

      const composer = page.locator('[data-testid="tweetTextarea_0"], div[role="textbox"]').first();
      if (!await composer.isVisible().catch(() => false)) {
        return {
          ok: false,
          state: 'failed',
          reason: 'composer_not_found',
          message: 'Could not find X composer textbox.'
        };
      }

      await composer.click();
      await composer.fill(job.text);
      await page.waitForTimeout(500);

      const postButton = page.locator('[data-testid="tweetButtonInline"], [data-testid="tweetButton"]').first();
      if (!await postButton.isVisible().catch(() => false)) {
        return {
          ok: false,
          state: 'failed',
          reason: 'post_button_not_found',
          message: 'Could not find X post button.'
        };
      }

      const enabled = await postButton.isEnabled().catch(() => false);
      if (!enabled) {
        return {
          ok: false,
          state: 'failed',
          reason: 'post_button_disabled',
          message: 'Post button is disabled after inserting text.'
        };
      }

      if (!cfg.autoPostEnabled) {
        return {
          ok: false,
          state: 'ready',
          reason: null,
          message: 'Sentence staged successfully. autoPostEnabled is false, so publish was not clicked.'
        };
      }

      await postButton.click();
      await page.waitForTimeout(3000);

      return {
        ok: true,
        state: 'posted',
        reason: null,
        message: 'Post button clicked and no immediate error detected.'
      };
    } finally {
      await context.close();
    }
  }

  return {
    ok: false,
    state: 'failed',
    reason: 'executor_not_implemented',
    message: `Detected ${diag.automationLibrary} and browser binary at ${diag.browserBinary}, but real X executor is not implemented yet.`
  };
}

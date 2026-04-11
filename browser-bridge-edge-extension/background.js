const PORTAL_BASE = 'http://127.0.0.1:4217';
const BRIDGE_BASE = 'http://127.0.0.1:4318';
const WORKER_ID = 'edge-browser-worker';

async function getSiteContext(tab) {
  try {
    const sites = await fetch(`${PORTAL_BASE}/api/sites`).then(r => r.json());
    const matches = sites.filter(site => tab.url && tab.url.startsWith(site.origin.replace(/\/$/, '')));
    if (!matches.length) return null;
    matches.sort((a, b) => (b.origin || '').length - (a.origin || '').length);
    return matches[0];
  } catch (error) {
    return { error: String(error) };
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text, ok: response.ok }; }
}

async function getJson(url) {
  const response = await fetch(url);
  const text = await response.text();
  try { return JSON.parse(text); } catch { return { raw: text, ok: response.ok }; }
}

async function collectPageContext(tabId) {
  const [context] = await chrome.tabs.sendMessage(tabId, { type: 'bridge:collectPageContext' });
  return context;
}

async function getActiveXTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs.find(tab => /^https:\/\/(x\.com|twitter\.com)\//.test(tab.url || '')) || null;
}

async function sendWorkerHeartbeat(note = '') {
  const tab = await getActiveXTab();
  return postJson(`${PORTAL_BASE}/api/worker/heartbeat`, {
    workerId: WORKER_ID,
    platform: 'x',
    status: tab ? 'online' : 'idle',
    activeUrl: tab?.url || '',
    activeTabTitle: tab?.title || '',
    note
  });
}

async function claimNextJob() {
  return postJson(`${PORTAL_BASE}/api/worker/next`, {
    workerId: WORKER_ID,
    platform: 'x'
  });
}

async function updateJob(jobId, body) {
  return postJson(`${PORTAL_BASE}/api/jobs/${jobId}`, body);
}

async function findExecutionForJob(jobId) {
  const executions = await getJson(`${PORTAL_BASE}/api/executions`);
  if (!Array.isArray(executions)) return null;
  return executions.find(item => item.jobId === jobId) || null;
}

async function runNextPortalJobCore() {
  await sendWorkerHeartbeat('Checking for next portal v6 job.');
  const job = await claimNextJob();
  if (!job || !job.id) return { ok: false, error: 'No queued portal jobs found.' };
  const tab = await getActiveXTab();
  if (!tab?.id) {
    await updateJob(job.id, { state: 'queued', log: 'No active X tab found; job returned to queue.', lastError: 'No active X tab found.' });
    return { ok: false, error: 'No active X tab found.' };
  }
  await updateJob(job.id, { state: 'claimed', log: 'Worker is staging draft in X composer.' });
  const result = await chrome.tabs.sendMessage(tab.id, { type: 'bridge:stageDraft', draft: job.text || '' });
  const execution = await findExecutionForJob(job.id);
  if (execution?.id) {
    await postJson(`${BRIDGE_BASE}/execution-result`, {
      executionId: execution.id,
      siteId: execution.siteId || null,
      state: result?.ok ? 'executed' : 'failed',
      detail: result?.note || result?.error || 'portal v6 job attempted',
      url: tab.url
    });
  }
  if (result?.ok) {
    await updateJob(job.id, { state: 'posted', log: 'Draft staged successfully in X composer.' });
    await sendWorkerHeartbeat('Staged X post from portal v6 job.');
    return { ok: true, job, result, execution };
  }
  await updateJob(job.id, { state: 'failed', log: result?.error || 'Failed to stage X draft.', lastError: result?.error || 'Failed to stage X draft.' });
  await sendWorkerHeartbeat('Failed to stage X post from portal v6 job.');
  return { ok: false, job, result, execution };
}

chrome.alarms.create('poll-x-executions', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== 'poll-x-executions') return;
  try {
    await sendWorkerHeartbeat('Polling for queued X work.');
    const nextJob = await getJson(`${PORTAL_BASE}/api/jobs`);
    if (Array.isArray(nextJob) && nextJob.some(job => job.state === 'queued' && job.platform === 'x')) {
      await runNextPortalJobCore();
      return;
    }
    const next = await getJson(`${BRIDGE_BASE}/next-x-execution`);
    if (!next || !next.id) return;
    await runNextXExecutionCore();
  } catch {}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'bridge:getActiveContext') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = tab ? await getSiteContext(tab) : null;
        sendResponse({ ok: true, tab, site, bridgeBase: BRIDGE_BASE, portalBase: PORTAL_BASE });
        return;
      }
      if (message.type === 'bridge:queueDraft') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = tab ? await getSiteContext(tab) : null;
        if (!site || !site.id) {
          sendResponse({ ok: false, error: 'No scoped portal site matches this tab.' });
          return;
        }
        const page = await collectPageContext(tab.id);
        const pageContext = await postJson(`${BRIDGE_BASE}/page-context`, {
          siteId: site.id,
          platform: page?.platform || 'generic',
          url: tab.url,
          title: tab.title,
          textSample: page?.textSample || ''
        });
        const result = await postJson(`${BRIDGE_BASE}/queue-draft`, {
          siteId: site.id,
          url: tab.url,
          title: tab.title,
          draft: message.draft,
          target: message.target || 'generic',
          pageContextId: pageContext?.id || null
        });
        sendResponse({ ok: true, site, pageContext, result });
        return;
      }
      if (message.type === 'bridge:collectPageContext') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = tab ? await getSiteContext(tab) : null;
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'No active tab' });
          return;
        }
        const page = await collectPageContext(tab.id);
        const stored = await postJson(`${BRIDGE_BASE}/page-context`, {
          siteId: site?.id || null,
          platform: page?.platform || 'generic',
          url: tab.url,
          title: tab.title,
          textSample: page?.textSample || ''
        });
        sendResponse({ ok: true, site, page, stored });
        return;
      }
      if (message.type === 'bridge:stageDraft') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = tab ? await getSiteContext(tab) : null;
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'No active tab' });
          return;
        }
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'bridge:stageDraft', draft: message.draft || '' });
        if (site?.id) {
          await postJson(`${BRIDGE_BASE}/execution-result`, {
            siteId: site.id,
            state: result?.ok ? 'executed' : 'failed',
            detail: result?.note || result?.error || 'stageDraft attempted',
            url: tab.url,
            executionId: message.executionId || null
          });
        }
        sendResponse({ ok: true, site, result });
        return;
      }
      if (message.type === 'bridge:runNextXExecution') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const site = tab ? await getSiteContext(tab) : null;
        if (!tab?.id) {
          sendResponse({ ok: false, error: 'No active tab' });
          return;
        }
        const next = await getJson(`${BRIDGE_BASE}/next-x-execution`);
        if (!next || next.error) {
          sendResponse({ ok: false, error: next?.error || 'No queued X execution found.' });
          return;
        }
        if (!next.id) {
          sendResponse({ ok: false, error: 'No queued X execution found.' });
          return;
        }
        const result = await chrome.tabs.sendMessage(tab.id, { type: 'bridge:stageDraft', draft: next.payload || '' });
        await postJson(`${BRIDGE_BASE}/execution-result`, {
          executionId: next.id,
          siteId: next.siteId || site?.id || null,
          state: result?.ok ? 'executed' : 'failed',
          detail: result?.note || result?.error || 'runNextXExecution attempted',
          url: tab.url
        });
        sendResponse({ ok: true, site, execution: next, result });
        return;
      }
      if (message.type === 'bridge:runNextPortalJob') {
        sendResponse(await runNextPortalJobCore());
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});

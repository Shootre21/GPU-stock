const PORTAL_BASE = 'http://127.0.0.1:4217';
const BRIDGE_BASE = 'http://127.0.0.1:4318';

async function getSiteContext(tab) {
  try {
    const sites = await fetch(`${PORTAL_BASE}/api/sites`).then(r => r.json());
    return sites.find(site => tab.url && tab.url.startsWith(site.origin.replace(/\/$/, '')));
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

async function collectPageContext(tabId) {
  const [context] = await chrome.tabs.sendMessage(tabId, { type: 'bridge:collectPageContext' });
  return context;
}

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
            url: tab.url
          });
        }
        sendResponse({ ok: true, site, result });
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});

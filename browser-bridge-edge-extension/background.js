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
        const result = await postJson(`${BRIDGE_BASE}/queue-draft`, {
          siteId: site.id,
          url: tab.url,
          title: tab.title,
          draft: message.draft,
          target: message.target || 'generic'
        });
        sendResponse({ ok: true, site, result });
        return;
      }
      if (message.type === 'bridge:pageSnapshot') {
        sendResponse({ ok: true, html: document.documentElement?.outerHTML || '' });
        return;
      }
      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (error) {
      sendResponse({ ok: false, error: String(error) });
    }
  })();
  return true;
});

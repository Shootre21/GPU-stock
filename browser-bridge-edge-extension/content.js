function detectPlatform() {
  const host = location.hostname;
  if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('claude.ai')) return 'claude';
  return 'generic';
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'bridge:collectPageContext') {
    sendResponse({
      ok: true,
      platform: detectPlatform(),
      title: document.title,
      url: location.href,
      textSample: document.body?.innerText?.slice(0, 4000) || ''
    });
    return true;
  }
  return false;
});

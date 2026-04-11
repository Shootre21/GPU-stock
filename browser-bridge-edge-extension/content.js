function detectPlatform() {
  const host = location.hostname;
  if (host.includes('x.com') || host.includes('twitter.com')) return 'x';
  if (host.includes('facebook.com')) return 'facebook';
  if (host.includes('instagram.com')) return 'instagram';
  if (host.includes('claude.ai')) return 'claude';
  return 'generic';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function xComposer() {
  return document.querySelector('[data-testid="tweetTextarea_0"]')
    || document.querySelector('div[role="textbox"][data-testid="tweetTextarea_0"]')
    || document.querySelector('div[role="textbox"]');
}

async function stageDraftOnX(draft) {
  const composeButton = document.querySelector('[data-testid="SideNav_NewTweet_Button"]')
    || document.querySelector('[data-testid="tweetButtonInline"]');
  if (!xComposer() && composeButton) {
    composeButton.click();
    await sleep(700);
  }
  const composer = xComposer();
  if (!composer) {
    return { ok: false, error: 'Could not find X composer textbox.' };
  }
  composer.focus();
  document.execCommand('selectAll', false, null);
  document.execCommand('insertText', false, draft);
  composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: draft }));
  return {
    ok: true,
    platform: 'x',
    staged: true,
    finalButtonPressed: false,
    composerFound: true,
    note: 'Draft staged in X composer. Final post click intentionally not performed.'
  };
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
  if (message.type === 'bridge:stageDraft') {
    (async () => {
      const platform = detectPlatform();
      if (platform !== 'x') {
        sendResponse({ ok: false, error: `Stage draft currently only supports X, not ${platform}.` });
        return;
      }
      sendResponse(await stageDraftOnX(message.draft || ''));
    })();
    return true;
  }
  return false;
});

async function send(message) {
  return chrome.runtime.sendMessage(message);
}

async function loadContext() {
  const result = await send({ type: 'bridge:getActiveContext' });
  const node = document.getElementById('context');
  if (!result?.ok) {
    node.textContent = result?.error || 'Failed to load context';
    return null;
  }
  const site = result.site;
  node.textContent = site?.id
    ? `Matched site: ${site.label} (${site.origin})`
    : 'No matching scoped portal site for this tab yet.';
  return result;
}

(async () => {
  let context = await loadContext();
  document.getElementById('queueBtn').addEventListener('click', async () => {
    const draft = document.getElementById('draft').value.trim();
    if (!draft) return;
    if (!context) context = await loadContext();
    const result = await send({ type: 'bridge:queueDraft', draft, target: 'social_post' });
    document.getElementById('result').textContent = JSON.stringify(result, null, 2);
  });
  document.getElementById('stageBtn').addEventListener('click', async () => {
    const draft = document.getElementById('draft').value.trim();
    if (!draft) return;
    const result = await send({ type: 'bridge:stageDraft', draft });
    document.getElementById('result').textContent = JSON.stringify(result, null, 2);
  });
  document.getElementById('contextBtn').addEventListener('click', async () => {
    const result = await send({ type: 'bridge:collectPageContext' });
    document.getElementById('result').textContent = JSON.stringify(result, null, 2);
  });
})();

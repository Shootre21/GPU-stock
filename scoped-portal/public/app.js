function esc(s){return String(s??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));}
function badgeFor(status){ if(['authorized','approved','executed','fresh','reported'].includes(status)) return 'good'; if(['revoked','denied','failed','stale'].includes(status)) return 'bad'; return 'warn'; }
async function api(path, opts={}){ const r = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function safeApi(path){ try { return await api(path); } catch (e) { return { error: String(e) }; } }
async function load(){
  const [sites, audit, requests, executions, bridgeQueue, bridgeContext] = await Promise.all([api('/api/sites'), api('/api/audit'), api('/api/requests'), api('/api/executions'), safeApi('/api/bridge/queue'), safeApi('/api/bridge/page-context')]);
  document.getElementById('sites').innerHTML = sites.length ? sites.map(s => `
    <div class="site">
      <div class="row">
        <div><strong>${esc(s.label)}</strong><div class="small muted">${esc(s.origin)}</div></div>
        <div><span class="badge ${badgeFor(s.status)}">${esc(s.status)}</span></div>
      </div>
      <div class="small" style="margin-top:8px;">${esc(s.notes || 'No notes')}</div>
      <div class="small muted" style="margin-top:8px;">Permissions: ${Object.entries(s.permissions).filter(([,v])=>v).map(([k])=>k).join(', ') || 'none'}</div>
      <div class="small muted">Allowed actions: ${esc((s.allowedActions||[]).join(', '))}</div>
      <div class="small muted">Session: state=${esc(s.session?.state)} • freshness=${esc(s.session?.freshness)} • browserProfile=${esc(s.session?.browserProfile)} • hook=${esc(s.session?.browserHookStatus)}</div>
      <div class="small muted">Manual login: ${s.session?.lastManualLoginAt ? new Date(s.session.lastManualLoginAt).toLocaleString() : 'never'} • Last validated: ${s.session?.lastValidatedAt ? new Date(s.session.lastValidatedAt).toLocaleString() : 'never'} • Last execution: ${s.session?.lastExecutionAt ? new Date(s.session.lastExecutionAt).toLocaleString() : 'never'}</div>
      <div class="small" style="margin-top:8px;"><strong>Manual login steps</strong><ol class="list">${(s.browserLaunch?.steps||[]).map(step => `<li>${esc(step)}</li>`).join('')}</ol></div>
      <div class="inline-actions">
        <button class="secondary" onclick="launchLogin('${s.id}')">Launch login scaffold</button>
        <button class="secondary" onclick="markLogin('${s.id}')">Mark manual login done</button>
        <button class="secondary" onclick="markFresh('${s.id}')">Mark session fresh</button>
        <button class="secondary" onclick="requestAction('${s.id}')">Request action</button>
        <button onclick="revokeSite('${s.id}')">Revoke</button>
      </div>
    </div>
  `).join('') : '<div class="muted">No sites added yet.</div>';

  document.getElementById('requests').innerHTML = requests.length ? requests.slice(0, 40).map(r => `
    <div class="request">
      <div class="row"><div><strong>${esc(r.action)}</strong><div class="small muted">${esc(r.label)} • ${esc(r.origin)}</div></div><div><span class="badge ${badgeFor(r.status)}">${esc(r.status)}</span></div></div>
      <div class="small" style="margin-top:8px;">${esc(r.details || 'No extra details')}</div>
      <div class="small muted">Created: ${new Date(r.createdAt).toLocaleString()}</div>
      ${r.status==='pending' ? `<div class="inline-actions"><button class="secondary" onclick="decideRequest('${r.id}','approved')">Approve</button><button onclick="decideRequest('${r.id}','denied')">Deny</button></div>` : ''}
      ${r.status==='approved' ? `<div class="inline-actions"><button class="secondary" onclick="queueExecution('${r.siteId}','${r.id}','${esc(r.action)}')">Queue execution</button></div>` : ''}
    </div>
  `).join('') : '<div class="muted">No approval requests yet.</div>';

  document.getElementById('executions').innerHTML = executions.length ? executions.slice(0, 40).map(x => `
    <div class="request">
      <div class="row"><div><strong>${esc(x.action)}</strong><div class="small muted">${esc(x.label)} • ${esc(x.origin)}</div></div><div><span class="badge ${badgeFor(x.state)}">${esc(x.state)}</span></div></div>
      <div class="small muted">Bridge: ${esc(x.executionBridge)} • Created: ${new Date(x.createdAt).toLocaleString()}</div>
      <div class="small" style="margin-top:8px;">Payload: ${esc(x.payload || '')}</div>
      ${x.state==='queued' ? `<div class="inline-actions"><button class="secondary" onclick="updateExecution('${x.id}','executed')">Mark executed</button><button onclick="updateExecution('${x.id}','failed')">Mark failed</button></div>` : ''}
    </div>
  `).join('') : '<div class="muted">No execution items yet.</div>';

  const bridgeQueueItems = Array.isArray(bridgeQueue) ? bridgeQueue : [];
  const bridgeContextItems = Array.isArray(bridgeContext) ? bridgeContext : [];

  document.getElementById('bridgeQueue').innerHTML = bridgeQueueItems.length ? bridgeQueueItems.slice(0, 30).map(item => `
    <div class="request">
      <div class="row"><div><strong>${esc(item.target || 'generic')}</strong><div class="small muted">${esc(item.title || item.url || 'Untitled')}</div></div><div><span class="badge ${badgeFor(item.state)}">${esc(item.state)}</span></div></div>
      <div class="small tight">${esc(item.draft || '')}</div>
      <div class="small muted mono tight">site=${esc(item.siteId || 'none')} • pageContext=${esc(item.pageContextId || 'none')}</div>
    </div>
  `).join('') : `<div class="muted">${bridgeQueue.error ? esc(bridgeQueue.error) : 'No bridge drafts queued yet.'}</div>`;

  document.getElementById('bridgeContext').innerHTML = bridgeContextItems.length ? bridgeContextItems.slice(0, 30).map(item => `
    <div class="request">
      <div class="row"><div><strong>${esc(item.platform || 'generic')}</strong><div class="small muted">${esc(item.title || item.url || 'Untitled')}</div></div><div><span class="badge ${badgeFor('fresh')}">captured</span></div></div>
      <div class="small muted mono tight">${esc(item.url || '')}</div>
      <div class="small tight">${esc((item.textSample || '').slice(0, 280) || 'No text sample')}</div>
    </div>
  `).join('') : `<div class="muted">${bridgeContext.error ? esc(bridgeContext.error) : 'No bridge page context captured yet.'}</div>`;

  document.getElementById('audit').innerHTML = audit.length ? audit.slice(0, 80).map(a => `
    <div class="audit-entry">
      <div><strong>${esc(a.action)}</strong></div>
      <div class="small muted">${new Date(a.at).toLocaleString()} • ${esc(a.label || a.origin || a.requestedAction || a.siteId || a.executionId || '')}</div>
    </div>
  `).join('') : '<div class="muted">No audit entries yet.</div>';
}
async function launchLogin(id){ await api(`/api/sites/${id}/launch-login`, {method:'POST', body:'{}'}); load(); }
async function markLogin(id){ await api(`/api/sites/${id}`, {method:'PATCH', body: JSON.stringify({status:'authorized', session:{state:'authorized', freshness:'fresh', lastManualLoginAt:new Date().toISOString(), lastValidatedAt:new Date().toISOString(), browserHookStatus:'manual_login_complete_placeholder'}})}); load(); }
async function markFresh(id){ await api(`/api/sites/${id}`, {method:'PATCH', body: JSON.stringify({session:{freshness:'fresh', lastValidatedAt:new Date().toISOString()}})}); load(); }
async function revokeSite(id){ await api(`/api/sites/${id}/revoke`, {method:'POST', body:'{}'}); load(); }
async function requestAction(id){ const action = prompt('Requested action (example: post_tweet, send_message, change_profile):'); if(!action) return; const details = prompt('Optional details/context:') || ''; await api(`/api/sites/${id}/request`, {method:'POST', body: JSON.stringify({action, details})}); load(); }
async function decideRequest(id, status){ await api(`/api/requests/${id}`, {method:'PATCH', body: JSON.stringify({status})}); load(); }
async function queueExecution(siteId, requestId, action){ const payload = prompt('Optional execution payload / draft content:') || ''; await api(`/api/sites/${siteId}/queue-execution`, {method:'POST', body: JSON.stringify({requestId, action, payload})}); load(); }
async function updateExecution(id, state){ await api(`/api/executions/${id}`, {method:'PATCH', body: JSON.stringify({state})}); load(); }
window.launchLogin=launchLogin; window.markLogin=markLogin; window.markFresh=markFresh; window.revokeSite=revokeSite; window.requestAction=requestAction; window.decideRequest=decideRequest; window.queueExecution=queueExecution; window.updateExecution=updateExecution;

document.getElementById('siteForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const payload = { label:f.label.value, origin:f.origin.value, notes:f.notes.value, allowedActions:f.allowedActions.value.split(',').map(s=>s.trim()).filter(Boolean), permissions:{ read:f.read.checked, draft:f.draft.checked, postWithApproval:f.postWithApproval.checked, changeSettingsWithApproval:f.changeSettingsWithApproval.checked, browserLaunch:true } };
  await api('/api/sites', {method:'POST', body: JSON.stringify(payload)});
  f.reset(); f.read.checked=true; f.draft.checked=true; f.postWithApproval.checked=true; f.allowedActions.value='read_page,draft_post,draft_message'; load();
});
document.getElementById('refreshBtn').addEventListener('click', load);
load();
setInterval(load, 15000);

function esc(s){return String(s??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));}
function badgeFor(status){ if(status==='authorized'||status==='approved') return 'good'; if(status==='revoked'||status==='denied') return 'bad'; return 'warn'; }
async function api(path, opts={}){ const r = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts}); if(!r.ok) throw new Error(await r.text()); return r.json(); }
async function load(){
  const [sites, audit, requests] = await Promise.all([api('/api/sites'), api('/api/audit'), api('/api/requests')]);
  document.getElementById('sites').innerHTML = sites.length ? sites.map(s => `
    <div class="site">
      <div class="row">
        <div><strong>${esc(s.label)}</strong><div class="small muted">${esc(s.origin)}</div></div>
        <div><span class="badge ${badgeFor(s.status)}">${esc(s.status)}</span></div>
      </div>
      <div class="small" style="margin-top:8px;">${esc(s.notes || 'No notes')}</div>
      <div class="small muted" style="margin-top:8px;">Permissions: ${Object.entries(s.permissions).filter(([,v])=>v).map(([k])=>k).join(', ') || 'none'}</div>
      <div class="small muted">Allowed actions: ${esc((s.allowedActions||[]).join(', '))}</div>
      <div class="small muted">Created: ${new Date(s.createdAt).toLocaleString()}${s.lastManualLoginAt ? ` • Last manual login: ${new Date(s.lastManualLoginAt).toLocaleString()}` : ''}</div>
      <div class="small" style="margin-top:8px;"><strong>Manual login steps</strong><ol class="list">${(s.browserLaunch?.steps||[]).map(step => `<li>${esc(step)}</li>`).join('')}</ol></div>
      <div class="inline-actions">
        <button class="secondary" onclick="markAuthorized('${s.id}')">Mark authorized</button>
        <button class="secondary" onclick="markLogin('${s.id}')">Mark manual login done</button>
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
    </div>
  `).join('') : '<div class="muted">No approval requests yet.</div>';

  document.getElementById('audit').innerHTML = audit.length ? audit.slice(0, 60).map(a => `
    <div class="audit-entry">
      <div><strong>${esc(a.action)}</strong></div>
      <div class="small muted">${new Date(a.at).toLocaleString()} • ${esc(a.label || a.origin || a.requestedAction || a.siteId || '')}</div>
    </div>
  `).join('') : '<div class="muted">No audit entries yet.</div>';
}
async function markAuthorized(id){ await api(`/api/sites/${id}`, {method:'PATCH', body: JSON.stringify({status:'authorized'})}); load(); }
async function markLogin(id){ await api(`/api/sites/${id}`, {method:'PATCH', body: JSON.stringify({lastManualLoginAt:new Date().toISOString(), status:'authorized'})}); load(); }
async function revokeSite(id){ await api(`/api/sites/${id}/revoke`, {method:'POST', body:'{}'}); load(); }
async function requestAction(id){ const action = prompt('Requested action (example: post_tweet, send_message, change_profile):'); if(!action) return; const details = prompt('Optional details/context:') || ''; await api(`/api/sites/${id}/request`, {method:'POST', body: JSON.stringify({action, details})}); load(); }
async function decideRequest(id, status){ await api(`/api/requests/${id}`, {method:'PATCH', body: JSON.stringify({status})}); load(); }
window.markAuthorized = markAuthorized; window.markLogin = markLogin; window.revokeSite = revokeSite; window.requestAction = requestAction; window.decideRequest = decideRequest;

document.getElementById('siteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = {
    label: f.label.value,
    origin: f.origin.value,
    notes: f.notes.value,
    allowedActions: f.allowedActions.value.split(',').map(s => s.trim()).filter(Boolean),
    permissions: {
      read: f.read.checked,
      draft: f.draft.checked,
      postWithApproval: f.postWithApproval.checked,
      changeSettingsWithApproval: f.changeSettingsWithApproval.checked,
      browserLaunch: true
    }
  };
  await api('/api/sites', {method:'POST', body: JSON.stringify(payload)});
  f.reset();
  f.read.checked = true; f.draft.checked = true; f.postWithApproval.checked = true; f.allowedActions.value='read_page,draft_post,draft_message';
  load();
});
load();

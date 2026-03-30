function fmtBytes(bytes) { if (bytes == null || Number.isNaN(bytes)) return '—'; const units = ['B','KB','MB','GB','TB']; let i = 0, n = bytes; while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; } return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`; }
function fmtPct(n) { return `${Number(n || 0).toFixed(1)}%`; }
function meter(pct) { return `<div class="meter"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`; }
function cls(pct) { return pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'good'; }
function esc(s) { return String(s ?? '').replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }

function drawSpark(id, values, color = '#60a5fa', maxHint) {
  const el = document.getElementById(id);
  const w = 700, h = 120, pad = 10;
  const max = Math.max(maxHint || 0, ...values, 1);
  const points = values.map((v, idx) => {
    const x = pad + (idx * (w - pad * 2) / Math.max(values.length - 1, 1));
    const y = h - pad - ((v / max) * (h - pad * 2));
    return `${x},${y}`;
  }).join(' ');
  el.innerHTML = `<canvas width="${w}" height="${h}"></canvas>`;
  const c = el.querySelector('canvas');
  const ctx = c.getContext('2d');
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  for (let i = 1; i <= 3; i++) { const y = pad + i * ((h - pad*2) / 4); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w-pad, y); ctx.stroke(); }
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath();
  points.split(' ').forEach((p, i) => { const [x,y] = p.split(',').map(Number); if (i === 0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();
}

async function saveRules() {
  try {
    const parsed = JSON.parse(document.getElementById('rulesEditor').value);
    await fetch('/api/rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) });
    await load();
    alert('Rules saved');
  } catch (e) {
    alert('Rule save failed: ' + e.message);
  }
}
window.saveRules = saveRules;

async function load() {
  const res = await fetch('/api/stats', { cache: 'no-store' });
  const s = await res.json();
  document.getElementById('meta').textContent = `${s.hostname} • ${s.platform} • updated ${new Date(s.timestamp).toLocaleTimeString()}`;

  document.getElementById('alertSummary').innerHTML = `
    <span class="pill ${s.alerts.length ? 'warn' : 'good'}">${s.alerts.length} alerts</span>
    <span class="pill good">CPU ${fmtPct(s.cpu.averagePct)}</span>
    <span class="pill ${cls(s.memory.usedPct)}">RAM ${fmtPct(s.memory.usedPct)}</span>
    <span class="pill good">Public IP ${esc(s.publicNet.ip || 'unknown')}</span>
  `;

  document.getElementById('cpu').innerHTML = `
    <div class="kv"><span class="muted">Model</span><span>${esc(s.cpu.model)}</span></div>
    <div class="kv"><span class="muted">Avg usage</span><span class="${cls(s.cpu.averagePct)}">${fmtPct(s.cpu.averagePct)}</span></div>
    ${meter(s.cpu.averagePct)}
    <div class="kv"><span class="muted">Load avg</span><span>${s.cpu.loadAvg.map(v => v.toFixed(2)).join(' / ')}</span></div>
    <div class="kv"><span class="muted">Uptime</span><span>${Math.floor(s.cpu.uptimeSec / 3600)}h ${Math.floor((s.cpu.uptimeSec % 3600)/60)}m</span></div>
    <div class="small muted">Per-core: ${s.cpu.cores.map(v => v.toFixed(0)).join('%  ')}%</div>`;

  document.getElementById('memory').innerHTML = `
    <div class="kv"><span class="muted">Used</span><span class="${cls(s.memory.usedPct)}">${fmtBytes(s.memory.usedKB*1024)} / ${fmtBytes(s.memory.totalKB*1024)}</span></div>
    ${meter(s.memory.usedPct)}
    <div class="kv"><span class="muted">Available</span><span>${fmtBytes(s.memory.availableKB*1024)}</span></div>
    <div class="kv"><span class="muted">Swap used</span><span>${fmtBytes(s.memory.swapUsedKB*1024)} / ${fmtBytes(s.memory.swapTotalKB*1024)}</span></div>`;

  document.getElementById('packets').innerHTML = `
    <div class="kv"><span class="muted">RX packets</span><span>${s.packets.rxPackets.toLocaleString()}</span></div>
    <div class="kv"><span class="muted">TX packets</span><span>${s.packets.txPackets.toLocaleString()}</span></div>
    <div class="kv"><span class="muted">RX errors</span><span class="${s.packets.rxErrs ? 'bad':'good'}">${s.packets.rxErrs}</span></div>
    <div class="kv"><span class="muted">TX errors</span><span class="${s.packets.txErrs ? 'bad':'good'}">${s.packets.txErrs}</span></div>
    <div class="kv"><span class="muted">RX drops</span><span class="${s.packets.rxDrop ? 'warn':'good'}">${s.packets.rxDrop}</span></div>
    <div class="kv"><span class="muted">TX drops</span><span class="${s.packets.txDrop ? 'warn':'good'}">${s.packets.txDrop}</span></div>`;

  document.getElementById('routing').innerHTML = `<div class="kv"><span class="muted">Detected</span><span>${s.network.routingProtocols.join(', ')}</span></div><pre class="small">${esc(s.network.routingEvidence || 'No routing daemon evidence found.')}</pre>`;

  document.getElementById('publicNet').innerHTML = `
    <div class="kv"><span class="muted">Public IP</span><span>${esc(s.publicNet.ip || 'unknown')}</span></div>
    <div class="kv"><span class="muted">ISP / ASN</span><span>${esc(s.publicNet.org || 'unknown')}</span></div>
    <div class="kv"><span class="muted">Hostname</span><span>${esc(s.publicNet.hostname || 'unknown')}</span></div>
    <div class="kv"><span class="muted">Geo</span><span>${esc([s.publicNet.city, s.publicNet.region, s.publicNet.country].filter(Boolean).join(', '))}</span></div>`;

  document.getElementById('openclaw').textContent = s.openclaw.text || 'No status output';

  document.getElementById('alerts').innerHTML = s.alerts.length ? s.alerts.map(a => `<div class="alert ${a.severity === 'critical' ? 'critical':''}"><strong>${esc(a.type.toUpperCase())}</strong><div>${esc(a.message)}</div></div>`).join('') : '<div class="good">No active alerts.</div>';

  document.getElementById('interfaces').innerHTML = `<table><thead><tr><th>Interface</th><th>RX/TX rate</th><th>Packets/s</th><th>Errors/Drops</th><th>Total bytes</th></tr></thead><tbody>${s.interfaces.map(i => `<tr><td>${i.iface}</td><td>${fmtBytes(i.rxBps)}/s ↓<br>${fmtBytes(i.txBps)}/s ↑</td><td>${i.rxPps.toFixed(1)} rx / ${i.txPps.toFixed(1)} tx</td><td>rx err ${i.rxErrs}, drop ${i.rxDrop}<br>tx err ${i.txErrs}, drop ${i.txDrop}</td><td>${fmtBytes(i.rxBytes)} ↓<br>${fmtBytes(i.txBytes)} ↑</td></tr>`).join('')}</tbody></table>`;

  document.getElementById('thermal').innerHTML = s.thermal.length ? `<table><thead><tr><th>Zone</th><th>Type</th><th>Temp</th></tr></thead><tbody>${s.thermal.map(t => `<tr><td>${t.zone}</td><td>${t.type}</td><td>${t.tempC == null ? '—' : `${t.tempC.toFixed(1)} °C`}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">No thermal zones exposed.</div>';

  document.getElementById('disk').innerHTML = `<table><thead><tr><th>Filesystem</th><th>Mounted on</th><th>Used</th><th>Available</th><th>Use%</th></tr></thead><tbody>${s.disk.df.map(d => `<tr><td>${esc(d.filesystem)}</td><td>${esc(d.mountpoint)}</td><td>${fmtBytes(d.usedKB*1024)}</td><td>${fmtBytes(d.availKB*1024)}</td><td>${d.usePct}</td></tr>`).join('')}</tbody></table>`;

  document.getElementById('io').innerHTML = `<table><thead><tr><th>Device</th><th>Reads</th><th>Writes</th><th>I/O in progress</th><th>I/O time</th></tr></thead><tbody>${s.io.slice(0, 12).map(d => `<tr><td>${d.name}</td><td>${d.readsCompleted.toLocaleString()}</td><td>${d.writesCompleted.toLocaleString()}</td><td>${d.ioInProgress}</td><td>${d.ioTimeMs.toLocaleString()} ms</td></tr>`).join('')}</tbody></table>`;

  document.getElementById('processes').innerHTML = `<table><thead><tr><th>PID</th><th>Name</th><th>CPU</th><th>MEM</th><th>Args</th></tr></thead><tbody>${s.processes.map(p => `<tr><td>${p.pid}</td><td>${esc(p.command)}</td><td class="${cls(p.cpuPct)}">${p.cpuPct}%</td><td>${p.memPct}%</td><td class="small code">${esc(p.args)}</td></tr>`).join('')}</tbody></table>`;

  const dockerRows = [...s.docker.live];
  document.getElementById('docker').innerHTML = dockerRows.length ? `<table><thead><tr><th>Name</th><th>CPU</th><th>Mem</th><th>Net I/O</th></tr></thead><tbody>${dockerRows.map(d => `<tr><td>${esc(d.Name)}</td><td>${esc(d.CPUPerc)}</td><td>${esc(d.MemUsage)}</td><td>${esc(d.NetIO)}</td></tr>`).join('')}</tbody></table>` : '<div class="muted">No Docker stats available.</div>';

  document.getElementById('services').textContent = s.network.listening.join('\n') || 'No listening sockets found.';

  document.getElementById('rules').innerHTML = `<div class="small muted">Edit JSON rules for spike detection, ports, and thresholds.</div><textarea id="rulesEditor">${esc(JSON.stringify(s.alertRules, null, 2))}</textarea><button onclick="saveRules()">Save rules</button>`;

  document.getElementById('charts').innerHTML = `
    <div class="spark"><div class="small muted">CPU %</div><div id="chartCpu"></div></div>
    <div class="spark"><div class="small muted">RAM %</div><div id="chartMem"></div></div>
    <div class="spark"><div class="small muted">Network throughput</div><div id="chartNet"></div></div>
    <div class="spark"><div class="small muted">Packet rate</div><div id="chartPps"></div></div>`;

  const h = s.history || [];
  drawSpark('chartCpu', h.map(x => x.cpuPct || 0), '#60a5fa', 100);
  drawSpark('chartMem', h.map(x => x.memPct || 0), '#36d399', 100);
  drawSpark('chartNet', h.map(x => (x.totalThroughputBps || 0) / (1024*1024)), '#fbbf24');
  drawSpark('chartPps', h.map(x => x.totalPps || 0), '#f87171');
}

load();
setInterval(load, 5000);

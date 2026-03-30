function fmtBytes(bytes) {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0; let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}
function fmtPct(n) { return `${Number(n || 0).toFixed(1)}%`; }
function meter(pct) { return `<div class="meter"><span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`; }
function cls(pct) { return pct >= 90 ? 'bad' : pct >= 70 ? 'warn' : 'good'; }

async function load() {
  const res = await fetch('/api/stats', { cache: 'no-store' });
  const s = await res.json();

  document.getElementById('meta').textContent = `${s.hostname} • ${s.platform} • updated ${new Date(s.timestamp).toLocaleTimeString()}`;

  document.getElementById('cpu').innerHTML = `
    <div class="kv"><span class="muted">Model</span><span>${s.cpu.model}</span></div>
    <div class="kv"><span class="muted">Avg usage</span><span class="${cls(s.cpu.averagePct)}">${fmtPct(s.cpu.averagePct)}</span></div>
    ${meter(s.cpu.averagePct)}
    <div class="kv"><span class="muted">Load avg</span><span>${s.cpu.loadAvg.map(v => v.toFixed(2)).join(' / ')}</span></div>
    <div class="kv"><span class="muted">Uptime</span><span>${Math.floor(s.cpu.uptimeSec / 3600)}h ${Math.floor((s.cpu.uptimeSec % 3600)/60)}m</span></div>
    <div class="small muted">Per-core: ${s.cpu.cores.map(v => v.toFixed(0)).join('%  ')}%</div>
  `;

  const memUsed = s.memory.usedKB * 1024;
  const memTotal = s.memory.totalKB * 1024;
  document.getElementById('memory').innerHTML = `
    <div class="kv"><span class="muted">Used</span><span class="${cls(s.memory.usedPct)}">${fmtBytes(memUsed)} / ${fmtBytes(memTotal)}</span></div>
    ${meter(s.memory.usedPct)}
    <div class="kv"><span class="muted">Available</span><span>${fmtBytes(s.memory.availableKB * 1024)}</span></div>
    <div class="kv"><span class="muted">Swap used</span><span>${fmtBytes(s.memory.swapUsedKB * 1024)} / ${fmtBytes(s.memory.swapTotalKB * 1024)}</span></div>
  `;

  document.getElementById('packets').innerHTML = `
    <div class="kv"><span class="muted">RX packets</span><span>${s.packets.rxPackets.toLocaleString()}</span></div>
    <div class="kv"><span class="muted">TX packets</span><span>${s.packets.txPackets.toLocaleString()}</span></div>
    <div class="kv"><span class="muted">RX errors</span><span class="${s.packets.rxErrs ? 'bad' : 'good'}">${s.packets.rxErrs}</span></div>
    <div class="kv"><span class="muted">TX errors</span><span class="${s.packets.txErrs ? 'bad' : 'good'}">${s.packets.txErrs}</span></div>
    <div class="kv"><span class="muted">RX drops</span><span class="${s.packets.rxDrop ? 'warn' : 'good'}">${s.packets.rxDrop}</span></div>
    <div class="kv"><span class="muted">TX drops</span><span class="${s.packets.txDrop ? 'warn' : 'good'}">${s.packets.txDrop}</span></div>
  `;

  document.getElementById('routing').innerHTML = `
    <div class="kv"><span class="muted">Detected</span><span>${s.network.routingProtocols.join(', ')}</span></div>
    <pre class="small">${s.network.routingEvidence || 'No routing daemon evidence found.'}</pre>
  `;

  document.getElementById('interfaces').innerHTML = `
    <table>
      <thead><tr><th>Interface</th><th>RX/TX rate</th><th>Packets/s</th><th>Errors/Drops</th><th>Total bytes</th></tr></thead>
      <tbody>
        ${s.interfaces.map(i => `<tr>
          <td>${i.iface}</td>
          <td>${fmtBytes(i.rxBps)}/s ↓<br>${fmtBytes(i.txBps)}/s ↑</td>
          <td>${i.rxPps.toFixed(1)} rx / ${i.txPps.toFixed(1)} tx</td>
          <td>rx err ${i.rxErrs}, drop ${i.rxDrop}<br>tx err ${i.txErrs}, drop ${i.txDrop}</td>
          <td>${fmtBytes(i.rxBytes)} ↓<br>${fmtBytes(i.txBytes)} ↑</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('thermal').innerHTML = s.thermal.length ? `
    <table>
      <thead><tr><th>Zone</th><th>Type</th><th>Temp</th></tr></thead>
      <tbody>${s.thermal.map(t => `<tr><td>${t.zone}</td><td>${t.type}</td><td>${t.tempC == null ? '—' : `${t.tempC.toFixed(1)} °C`}</td></tr>`).join('')}</tbody>
    </table>
  ` : '<div class="muted">No thermal zones exposed in this environment.</div>';

  document.getElementById('disk').innerHTML = `
    <table>
      <thead><tr><th>Filesystem</th><th>Mounted on</th><th>Used</th><th>Available</th><th>Use%</th></tr></thead>
      <tbody>
        ${s.disk.df.map(d => `<tr><td>${d.filesystem}</td><td>${d.mountpoint}</td><td>${fmtBytes(d.usedKB * 1024)}</td><td>${fmtBytes(d.availKB * 1024)}</td><td>${d.usePct}</td></tr>`).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('io').innerHTML = `
    <table>
      <thead><tr><th>Device</th><th>Reads</th><th>Writes</th><th>I/O in progress</th><th>I/O time</th></tr></thead>
      <tbody>
        ${s.io.slice(0, 12).map(d => `<tr><td>${d.name}</td><td>${d.readsCompleted.toLocaleString()}</td><td>${d.writesCompleted.toLocaleString()}</td><td>${d.ioInProgress}</td><td>${d.ioTimeMs.toLocaleString()} ms</td></tr>`).join('')}
      </tbody>
    </table>
  `;

  document.getElementById('services').textContent = s.network.listening.join('\n') || 'No listening sockets found.';
}

load();
setInterval(load, 3000);

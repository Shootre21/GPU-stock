const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 4123;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
const ALERT_RULES_FILE = path.join(DATA_DIR, 'alert-rules.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

const defaultRules = {
  cpuWarnPct: 85,
  memWarnPct: 90,
  diskWarnPct: 90,
  tempWarnC: 80,
  rxErrorWarn: 1,
  txErrorWarn: 1,
  rxDropWarn: 10,
  txDropWarn: 10,
  throughputSpikeMBps: 25,
  packetSpikePps: 15000,
  ignorePorts: [53, 323, 5353, 18789, 3000, 4123, 5432, 5682, 8080],
  ignoreProcesses: ['openclaw-gatewa', 'node', 'docker', 'postgres']
};

if (!fs.existsSync(ALERT_RULES_FILE)) writeJson(ALERT_RULES_FILE, defaultRules);

function parseMeminfo() {
  const text = readText('/proc/meminfo') || '';
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^([^:]+):\s+(\d+)/);
    if (m) out[m[1]] = Number(m[2]);
  }
  const total = out.MemTotal || 0;
  const available = out.MemAvailable || 0;
  const used = total - available;
  return {
    raw: out,
    totalKB: total,
    availableKB: available,
    usedKB: used,
    usedPct: total ? (used / total) * 100 : null,
    swapTotalKB: out.SwapTotal || 0,
    swapFreeKB: out.SwapFree || 0,
    swapUsedKB: (out.SwapTotal || 0) - (out.SwapFree || 0)
  };
}

function cpuSnapshot() {
  return os.cpus().map(cpu => {
    const t = cpu.times;
    return { idle: t.idle, total: t.user + t.nice + t.sys + t.idle + t.irq };
  });
}

let previousCpu = cpuSnapshot();
function cpuUsage() {
  const current = cpuSnapshot();
  const cores = [];
  let totalUsed = 0;
  for (let i = 0; i < current.length; i++) {
    const idle = current[i].idle - previousCpu[i].idle;
    const total = current[i].total - previousCpu[i].total;
    const usedPct = total > 0 ? (1 - idle / total) * 100 : 0;
    cores.push(usedPct);
    totalUsed += usedPct;
  }
  previousCpu = current;
  return {
    model: os.cpus()[0]?.model || 'Unknown',
    cores,
    averagePct: cores.length ? totalUsed / cores.length : 0,
    loadAvg: os.loadavg(),
    uptimeSec: os.uptime()
  };
}

function parseProcNetDev() {
  const text = readText('/proc/net/dev') || '';
  return text.split('\n').slice(2).filter(Boolean).map(line => {
    const [namePart, rest] = line.split(':');
    const iface = namePart.trim();
    const cols = rest.trim().split(/\s+/).map(Number);
    return {
      iface,
      rxBytes: cols[0], rxPackets: cols[1], rxErrs: cols[2], rxDrop: cols[3],
      txBytes: cols[8], txPackets: cols[9], txErrs: cols[10], txDrop: cols[11]
    };
  });
}

let previousNet = parseProcNetDev();
let previousNetTs = Date.now();
function netStats() {
  const now = Date.now();
  const current = parseProcNetDev();
  const seconds = Math.max((now - previousNetTs) / 1000, 1);
  const byPrev = Object.fromEntries(previousNet.map(i => [i.iface, i]));
  const enriched = current.map(i => {
    const p = byPrev[i.iface];
    return {
      ...i,
      rxBps: p ? (i.rxBytes - p.rxBytes) / seconds : 0,
      txBps: p ? (i.txBytes - p.txBytes) / seconds : 0,
      rxPps: p ? (i.rxPackets - p.rxPackets) / seconds : 0,
      txPps: p ? (i.txPackets - p.txPackets) / seconds : 0
    };
  });
  previousNet = current;
  previousNetTs = now;
  return enriched;
}

function diskStats() {
  const df = run('df -kP');
  const lsblk = run('lsblk -b -J -o NAME,SIZE,TYPE,MOUNTPOINT,FSTYPE,MODEL');
  return {
    df: df ? df.split('\n').slice(1).map(line => {
      const parts = line.trim().split(/\s+/);
      return {
        filesystem: parts[0],
        sizeKB: Number(parts[1]),
        usedKB: Number(parts[2]),
        availKB: Number(parts[3]),
        usePct: parts[4],
        mountpoint: parts.slice(5).join(' ')
      };
    }) : [],
    blockDevices: lsblk ? JSON.parse(lsblk).blockdevices : []
  };
}

function ioStats() {
  const text = readText('/proc/diskstats') || '';
  return text.split('\n').filter(Boolean).map(line => {
    const p = line.trim().split(/\s+/);
    return {
      name: p[2], readsCompleted: Number(p[3]), readsMerged: Number(p[4]), sectorsRead: Number(p[5]), readTimeMs: Number(p[6]),
      writesCompleted: Number(p[7]), writesMerged: Number(p[8]), sectorsWritten: Number(p[9]), writeTimeMs: Number(p[10]),
      ioInProgress: Number(p[11]), ioTimeMs: Number(p[12])
    };
  }).filter(d => !d.name.startsWith('loop'));
}

function thermalStats() {
  try {
    return fs.readdirSync('/sys/class/thermal').filter(n => n.startsWith('thermal_zone')).map(name => {
      const dir = path.join('/sys/class/thermal', name);
      const temp = readText(path.join(dir, 'temp'));
      const type = readText(path.join(dir, 'type'));
      return { zone: name, type: type ? type.trim() : 'unknown', tempC: temp ? Number(temp.trim()) / 1000 : null };
    });
  } catch {
    return [];
  }
}

function parseListeningLine(line) {
  const parts = line.trim().split(/\s+/);
  const proto = parts[0];
  const local = parts[4] || '';
  const process = parts.slice(6).join(' ');
  const portMatch = local.match(/:([^:]+)$/);
  const port = portMatch ? Number(portMatch[1]) : null;
  return { proto, local, port, process, raw: line };
}

function networkInfo() {
  const addr = run('ip -j address');
  const route = run('ip -j route');
  const links = run('ip -j -details link');
  const ss = run('ss -tulpn');
  const routesText = run('ip route');
  const routingProcs = run("ps -eo comm,args --sort=comm | egrep 'ospf|bgp|bird|frr|zebra|ospfd|bgpd|babel|ripd|isisd|lldpd' || true");
  const protocols = [];
  const lower = `${routesText}\n${routingProcs}`.toLowerCase();
  if (lower.includes('ospf')) protocols.push('OSPF');
  if (lower.includes('bgp') || lower.includes('bgpd')) protocols.push('BGP');
  if (lower.includes('isis')) protocols.push('IS-IS');
  if (lower.includes('rip')) protocols.push('RIP');
  if (lower.includes('babel')) protocols.push('Babel');
  if (!protocols.length) protocols.push('Static / kernel routing only detected');

  const listening = ss ? ss.split('\n').slice(1).filter(Boolean).slice(0, 100) : [];
  return {
    addresses: addr ? JSON.parse(addr) : [],
    routes: route ? JSON.parse(route) : [],
    links: links ? JSON.parse(links) : [],
    listening,
    listeningParsed: listening.map(parseListeningLine),
    routingProtocols: protocols,
    routingEvidence: routingProcs || routesText
  };
}

function packetHealth(net) {
  const totals = net.reduce((acc, i) => {
    acc.rxPackets += i.rxPackets; acc.txPackets += i.txPackets; acc.rxErrs += i.rxErrs; acc.txErrs += i.txErrs; acc.rxDrop += i.rxDrop; acc.txDrop += i.txDrop; return acc;
  }, { rxPackets: 0, txPackets: 0, rxErrs: 0, txErrs: 0, rxDrop: 0, txDrop: 0 });
  return {
    ...totals,
    rxErrorPct: totals.rxPackets ? (totals.rxErrs / totals.rxPackets) * 100 : 0,
    txErrorPct: totals.txPackets ? (totals.txErrs / totals.txPackets) * 100 : 0,
    rxDropPct: totals.rxPackets ? (totals.rxDrop / totals.rxPackets) * 100 : 0,
    txDropPct: totals.txPackets ? (totals.txDrop / totals.txPackets) * 100 : 0
  };
}

function topProcesses() {
  const text = run('ps -eo pid,ppid,comm,%cpu,%mem,etimes,args --sort=-%cpu | head -25');
  const lines = text.split('\n').slice(1).filter(Boolean);
  return lines.map(line => {
    const parts = line.trim().split(/\s+/);
    return {
      pid: Number(parts[0]),
      ppid: Number(parts[1]),
      command: parts[2],
      cpuPct: Number(parts[3]),
      memPct: Number(parts[4]),
      elapsedSec: Number(parts[5]),
      args: parts.slice(6).join(' ')
    };
  });
}

function dockerStats() {
  const ps = run("docker ps --format '{{json .}}' 2>/dev/null || true");
  const stats = run("docker stats --no-stream --format '{{json .}}' 2>/dev/null || true");
  return {
    containers: ps.split('\n').filter(Boolean).map(line => JSON.parse(line)),
    live: stats.split('\n').filter(Boolean).map(line => JSON.parse(line))
  };
}

function publicNet() {
  const ipinfo = run('curl -s https://ipinfo.io/json || true');
  try { return ipinfo ? JSON.parse(ipinfo) : {}; } catch { return {}; }
}

function openclawStatus() {
  const text = run('openclaw status');
  return { text };
}

let history = readJson(HISTORY_FILE, []);
let knownPorts = new Set();
if (history.length && history[history.length - 1].openPorts) {
  knownPorts = new Set(history[history.length - 1].openPorts);
}

function sampleForHistory(stats) {
  const totalThroughput = stats.interfaces.reduce((a, i) => a + i.rxBps + i.txBps, 0);
  const totalPps = stats.interfaces.reduce((a, i) => a + i.rxPps + i.txPps, 0);
  return {
    timestamp: stats.timestamp,
    cpuPct: stats.cpu.averagePct,
    memPct: stats.memory.usedPct,
    totalThroughputBps: totalThroughput,
    totalPps,
    rxErrs: stats.packets.rxErrs,
    txErrs: stats.packets.txErrs,
    rxDrop: stats.packets.rxDrop,
    txDrop: stats.packets.txDrop,
    openPorts: stats.network.listeningParsed.map(p => p.port).filter(Number.isFinite)
  };
}

function updateHistory(stats) {
  history.push(sampleForHistory(stats));
  history = history.slice(-240);
  writeJson(HISTORY_FILE, history);
  return history;
}

function buildAlerts(stats, rules) {
  const alerts = [];
  if (stats.cpu.averagePct >= rules.cpuWarnPct) alerts.push({ severity: 'warn', type: 'cpu', message: `CPU high: ${stats.cpu.averagePct.toFixed(1)}%` });
  if (stats.memory.usedPct >= rules.memWarnPct) alerts.push({ severity: 'warn', type: 'memory', message: `Memory high: ${stats.memory.usedPct.toFixed(1)}%` });

  for (const d of stats.disk.df) {
    const pct = Number(String(d.usePct).replace('%', ''));
    if (pct >= rules.diskWarnPct) alerts.push({ severity: 'warn', type: 'disk', message: `Disk usage high on ${d.mountpoint}: ${d.usePct}` });
  }

  for (const t of stats.thermal) {
    if (t.tempC != null && t.tempC >= rules.tempWarnC) alerts.push({ severity: 'warn', type: 'thermal', message: `${t.zone} temperature high: ${t.tempC.toFixed(1)}°C` });
  }

  if (stats.packets.rxErrs >= rules.rxErrorWarn) alerts.push({ severity: 'warn', type: 'net', message: `RX packet errors observed: ${stats.packets.rxErrs}` });
  if (stats.packets.txErrs >= rules.txErrorWarn) alerts.push({ severity: 'warn', type: 'net', message: `TX packet errors observed: ${stats.packets.txErrs}` });
  if (stats.packets.rxDrop >= rules.rxDropWarn) alerts.push({ severity: 'warn', type: 'net', message: `RX packet drops elevated: ${stats.packets.rxDrop}` });
  if (stats.packets.txDrop >= rules.txDropWarn) alerts.push({ severity: 'warn', type: 'net', message: `TX packet drops elevated: ${stats.packets.txDrop}` });

  const totalThroughputMBps = stats.interfaces.reduce((a, i) => a + i.rxBps + i.txBps, 0) / (1024 * 1024);
  const totalPps = stats.interfaces.reduce((a, i) => a + i.rxPps + i.txPps, 0);
  if (totalThroughputMBps >= rules.throughputSpikeMBps) alerts.push({ severity: 'warn', type: 'spike', message: `Network throughput spike: ${totalThroughputMBps.toFixed(2)} MB/s` });
  if (totalPps >= rules.packetSpikePps) alerts.push({ severity: 'warn', type: 'spike', message: `Packet rate spike: ${totalPps.toFixed(0)} pps` });

  const currentPorts = new Set(stats.network.listeningParsed.map(p => p.port).filter(Number.isFinite));
  const newPorts = [...currentPorts].filter(p => !knownPorts.has(p) && !rules.ignorePorts.includes(p));
  for (const p of newPorts) alerts.push({ severity: 'critical', type: 'port', message: `New listening port detected: ${p}` });
  knownPorts = currentPorts;

  const suspicious = stats.processes.filter(p => p.cpuPct > 80 || p.memPct > 40).filter(p => !rules.ignoreProcesses.includes(p.command));
  for (const p of suspicious.slice(0, 3)) alerts.push({ severity: 'warn', type: 'process', message: `Hot process: ${p.command} pid ${p.pid} cpu ${p.cpuPct}% mem ${p.memPct}%` });

  return alerts;
}

function collect() {
  const cpu = cpuUsage();
  const memory = parseMeminfo();
  const interfaces = netStats();
  const network = networkInfo();
  const stats = {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    cpu,
    memory,
    disk: diskStats(),
    io: ioStats(),
    thermal: thermalStats(),
    network,
    packets: packetHealth(interfaces),
    interfaces,
    processes: topProcesses(),
    docker: dockerStats(),
    publicNet: publicNet(),
    openclaw: openclawStatus()
  };
  const rules = readJson(ALERT_RULES_FILE, defaultRules);
  const hist = updateHistory(stats);
  stats.history = hist;
  stats.alertRules = rules;
  stats.alerts = buildAlerts(stats, rules);
  return stats;
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/stats') {
    const body = JSON.stringify(collect(), null, 2);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }
  if (req.url === '/api/rules') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readJson(ALERT_RULES_FILE, defaultRules), null, 2));
    return;
  }
  if (req.url === '/api/rules' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const incoming = JSON.parse(body || '{}');
      const merged = { ...defaultRules, ...incoming };
      writeJson(ALERT_RULES_FILE, merged);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(merged, null, 2));
    });
    return;
  }

  let filePath = req.url === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, req.url.split('?')[0]);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const type = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Dashboard running on http://0.0.0.0:${PORT}`));

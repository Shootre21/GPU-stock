const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 4123;
const PUBLIC_DIR = path.join(__dirname, 'public');

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function run(command) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

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
  const cpus = os.cpus();
  const totals = cpus.map(cpu => {
    const t = cpu.times;
    const total = t.user + t.nice + t.sys + t.idle + t.irq;
    return { idle: t.idle, total };
  });
  return totals;
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
  const lines = text.split('\n').slice(2).filter(Boolean);
  return lines.map(line => {
    const [namePart, rest] = line.split(':');
    const iface = namePart.trim();
    const cols = rest.trim().split(/\s+/).map(Number);
    return {
      iface,
      rxBytes: cols[0],
      rxPackets: cols[1],
      rxErrs: cols[2],
      rxDrop: cols[3],
      txBytes: cols[8],
      txPackets: cols[9],
      txErrs: cols[10],
      txDrop: cols[11]
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
    const rxBps = p ? (i.rxBytes - p.rxBytes) / seconds : 0;
    const txBps = p ? (i.txBytes - p.txBytes) / seconds : 0;
    const rxPps = p ? (i.rxPackets - p.rxPackets) / seconds : 0;
    const txPps = p ? (i.txPackets - p.txPackets) / seconds : 0;
    return { ...i, rxBps, txBps, rxPps, txPps };
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
      name: p[2],
      readsCompleted: Number(p[3]),
      readsMerged: Number(p[4]),
      sectorsRead: Number(p[5]),
      readTimeMs: Number(p[6]),
      writesCompleted: Number(p[7]),
      writesMerged: Number(p[8]),
      sectorsWritten: Number(p[9]),
      writeTimeMs: Number(p[10]),
      ioInProgress: Number(p[11]),
      ioTimeMs: Number(p[12])
    };
  }).filter(d => !d.name.startsWith('loop'));
}

function thermalStats() {
  const base = '/sys/class/thermal';
  try {
    const entries = fs.readdirSync(base).filter(n => n.startsWith('thermal_zone'));
    return entries.map(name => {
      const dir = path.join(base, name);
      const temp = readText(path.join(dir, 'temp'));
      const type = readText(path.join(dir, 'type'));
      return {
        zone: name,
        type: type ? type.trim() : 'unknown',
        tempC: temp ? Number(temp.trim()) / 1000 : null
      };
    });
  } catch {
    return [];
  }
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

  return {
    addresses: addr ? JSON.parse(addr) : [],
    routes: route ? JSON.parse(route) : [],
    links: links ? JSON.parse(links) : [],
    listening: ss ? ss.split('\n').slice(1).filter(Boolean).slice(0, 50) : [],
    routingProtocols: protocols,
    routingEvidence: routingProcs || routesText
  };
}

function packetHealth(net) {
  const totals = net.reduce((acc, i) => {
    acc.rxPackets += i.rxPackets;
    acc.txPackets += i.txPackets;
    acc.rxErrs += i.rxErrs;
    acc.txErrs += i.txErrs;
    acc.rxDrop += i.rxDrop;
    acc.txDrop += i.txDrop;
    return acc;
  }, { rxPackets: 0, txPackets: 0, rxErrs: 0, txErrs: 0, rxDrop: 0, txDrop: 0 });

  return {
    ...totals,
    rxErrorPct: totals.rxPackets ? (totals.rxErrs / totals.rxPackets) * 100 : 0,
    txErrorPct: totals.txPackets ? (totals.txErrs / totals.txPackets) * 100 : 0,
    rxDropPct: totals.rxPackets ? (totals.rxDrop / totals.rxPackets) * 100 : 0,
    txDropPct: totals.txPackets ? (totals.txDrop / totals.txPackets) * 100 : 0
  };
}

function collect() {
  const cpu = cpuUsage();
  const memory = parseMeminfo();
  const net = netStats();
  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    cpu,
    memory,
    disk: diskStats(),
    io: ioStats(),
    thermal: thermalStats(),
    network: networkInfo(),
    packets: packetHealth(net),
    interfaces: net
  };
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/stats') {
    const body = JSON.stringify(collect(), null, 2);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(body);
    return;
  }

  let filePath = req.url === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, req.url);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const type = ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : 'text/html';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Dashboard running on http://127.0.0.1:${PORT}`);
});

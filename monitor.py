# Requirements: fastapi uvicorn psutil gputil
# Note: GPUtil may fail on some Python 3.12 environments due to distutils removal; GPU metrics degrade to N/A.

import asyncio
import os
import platform
import socket
import time
from collections import deque
from datetime import datetime
from typing import Any, Dict, Optional

import psutil
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse

try:
    import GPUtil  # type: ignore
except Exception:
    GPUtil = None


PORT = 8765
POLL_INTERVAL = 2
HISTORY_POINTS = 30  # 60 seconds at 2-second polling
ALERT_LIMIT = 50
NETWORK_SPIKE_THRESHOLD_MBPS = 10
NETWORK_SPIKE_THRESHOLD_BPS = NETWORK_SPIKE_THRESHOLD_MBPS * 1024 * 1024

app = FastAPI(title="System Monitor Dashboard")

# Rolling histories kept server-side for the frontend.
cpu_history = deque(maxlen=HISTORY_POINTS)
ram_history = deque(maxlen=HISTORY_POINTS)
network_history = deque(maxlen=HISTORY_POINTS)
per_core_history = deque(maxlen=HISTORY_POINTS)
network_speed_samples = deque(maxlen=10)
alerts = deque(maxlen=ALERT_LIMIT)

# Previous counters for speed calculations.
prev_net_counters: Optional[Dict[str, Any]] = None
prev_disk_counters: Optional[Any] = None
prev_sample_time: Optional[float] = None
last_metrics: Dict[str, Any] = {}


def bytes_to_human(value: Optional[float]) -> str:
    """Convert bytes to a compact human-readable string."""
    if value is None:
        return "N/A"
    units = ["B", "KB", "MB", "GB", "TB", "PB"]
    size = float(value)
    for unit in units:
        if abs(size) < 1024.0 or unit == units[-1]:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"



def add_alert(metric: str, value: str, severity: str, details: str = "") -> None:
    """Append an alert unless it duplicates the most recent one."""
    entry = {
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "metric": metric,
        "value": value,
        "severity": severity,
        "details": details,
    }
    if alerts:
        latest = alerts[0]
        if (
            latest["metric"] == entry["metric"]
            and latest["value"] == entry["value"]
            and latest["severity"] == entry["severity"]
        ):
            return
    alerts.appendleft(entry)


def get_cpu_temperatures() -> Optional[float]:
    """Read the best available CPU temperature sensor if present."""
    try:
        temps = psutil.sensors_temperatures()
        if not temps:
            return None
        preferred_keys = ["coretemp", "k10temp", "cpu_thermal", "acpitz"]
        candidates = []
        for key in preferred_keys + list(temps.keys()):
            if key in temps:
                for sensor in temps[key]:
                    if sensor.current is not None:
                        candidates.append(sensor.current)
                if candidates:
                    return round(sum(candidates) / len(candidates), 1)
        for entries in temps.values():
            for sensor in entries:
                if sensor.current is not None:
                    candidates.append(sensor.current)
        if candidates:
            return round(sum(candidates) / len(candidates), 1)
    except Exception:
        return None
    return None


def get_gpu_info() -> Dict[str, Any]:
    """Collect GPU metrics if GPUtil is available and a GPU exists."""
    if GPUtil is None:
        return {
            "available": False,
            "name": "N/A",
            "usage_percent": None,
            "memory_used_mb": None,
            "memory_total_mb": None,
            "temperature": None,
            "reason": "GPUtil not installed",
        }

    try:
        gpus = GPUtil.getGPUs()
        if not gpus:
            return {
                "available": False,
                "name": "N/A",
                "usage_percent": None,
                "memory_used_mb": None,
                "memory_total_mb": None,
                "temperature": None,
                "reason": "No GPU detected",
            }
        gpu = gpus[0]
        return {
            "available": True,
            "name": getattr(gpu, "name", "GPU 0"),
            "usage_percent": round(float(getattr(gpu, "load", 0.0)) * 100, 1),
            "memory_used_mb": round(float(getattr(gpu, "memoryUsed", 0.0)), 1),
            "memory_total_mb": round(float(getattr(gpu, "memoryTotal", 0.0)), 1),
            "temperature": round(float(getattr(gpu, "temperature", 0.0)), 1)
            if getattr(gpu, "temperature", None) is not None
            else None,
            "reason": "",
        }
    except Exception as exc:
        return {
            "available": False,
            "name": "N/A",
            "usage_percent": None,
            "memory_used_mb": None,
            "memory_total_mb": None,
            "temperature": None,
            "reason": f"GPU read failed: {exc}",
        }


def collect_disk_info(elapsed: float) -> Dict[str, Any]:
    """Collect partition usage plus aggregate disk throughput."""
    global prev_disk_counters

    partitions_data = []
    highest_usage = 0.0
    try:
        partitions = psutil.disk_partitions(all=False)
        seen_mounts = set()
        for part in partitions:
            if part.mountpoint in seen_mounts:
                continue
            seen_mounts.add(part.mountpoint)
            try:
                usage = psutil.disk_usage(part.mountpoint)
                highest_usage = max(highest_usage, usage.percent)
                partitions_data.append(
                    {
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total": usage.total,
                        "used": usage.used,
                        "free": usage.free,
                        "percent": round(usage.percent, 1),
                    }
                )
                if usage.percent > 90:
                    add_alert("Disk", f"{usage.percent:.1f}%", "critical", f"{part.mountpoint} nearly full")
            except PermissionError:
                partitions_data.append(
                    {
                        "device": part.device,
                        "mountpoint": part.mountpoint,
                        "fstype": part.fstype,
                        "total": None,
                        "used": None,
                        "free": None,
                        "percent": None,
                    }
                )
    except Exception:
        partitions_data = []

    read_speed = None
    write_speed = None
    io_counters = None
    try:
        io_counters = psutil.disk_io_counters()
        if io_counters and prev_disk_counters and elapsed > 0:
            read_speed = (io_counters.read_bytes - prev_disk_counters.read_bytes) / elapsed
            write_speed = (io_counters.write_bytes - prev_disk_counters.write_bytes) / elapsed
        prev_disk_counters = io_counters
    except Exception:
        pass

    return {
        "partitions": partitions_data,
        "highest_usage_percent": round(highest_usage, 1) if partitions_data else None,
        "io": {
            "read_bytes_per_sec": round(read_speed, 1) if read_speed is not None else None,
            "write_bytes_per_sec": round(write_speed, 1) if write_speed is not None else None,
            "read_bytes": getattr(io_counters, "read_bytes", None),
            "write_bytes": getattr(io_counters, "write_bytes", None),
        },
    }


def collect_network_info(elapsed: float) -> Dict[str, Any]:
    """Collect per-interface network counters and current speeds."""
    global prev_net_counters

    interfaces = []
    total_upload_bps = 0.0
    total_download_bps = 0.0
    counters = psutil.net_io_counters(pernic=True)

    for name, counter in counters.items():
        prev = prev_net_counters.get(name) if prev_net_counters else None
        upload_bps = None
        download_bps = None
        if prev and elapsed > 0:
            upload_bps = (counter.bytes_sent - prev.bytes_sent) / elapsed
            download_bps = (counter.bytes_recv - prev.bytes_recv) / elapsed
            total_upload_bps += max(upload_bps, 0)
            total_download_bps += max(download_bps, 0)
        interfaces.append(
            {
                "name": name,
                "bytes_sent": counter.bytes_sent,
                "bytes_recv": counter.bytes_recv,
                "packets_sent": counter.packets_sent,
                "packets_recv": counter.packets_recv,
                "errin": counter.errin,
                "errout": counter.errout,
                "dropin": getattr(counter, "dropin", 0),
                "dropout": getattr(counter, "dropout", 0),
                "upload_bps": round(upload_bps, 1) if upload_bps is not None else None,
                "download_bps": round(download_bps, 1) if download_bps is not None else None,
            }
        )

    prev_net_counters = counters

    total_throughput = total_upload_bps + total_download_bps
    rolling_average = sum(network_speed_samples) / len(network_speed_samples) if network_speed_samples else 0.0
    spike = False
    if total_throughput > 0:
        if rolling_average > 0 and total_throughput > rolling_average * 3:
            spike = True
        if total_throughput > NETWORK_SPIKE_THRESHOLD_BPS:
            spike = True
    network_speed_samples.append(total_throughput)

    if spike:
        add_alert(
            "Network spike",
            f"{bytes_to_human(total_throughput)}/s",
            "warning" if total_throughput <= NETWORK_SPIKE_THRESHOLD_BPS * 2 else "critical",
            "Throughput exceeded rolling average or configured threshold",
        )

    return {
        "interfaces": interfaces,
        "total_upload_bps": round(total_upload_bps, 1),
        "total_download_bps": round(total_download_bps, 1),
        "total_throughput_bps": round(total_throughput, 1),
        "rolling_avg_bps": round(rolling_average, 1),
        "spike": spike,
        "spike_threshold_bps": NETWORK_SPIKE_THRESHOLD_BPS,
    }


def collect_os_info() -> Dict[str, Any]:
    """Collect basic operating system metadata."""
    boot_time = psutil.boot_time()
    uptime_seconds = int(time.time() - boot_time)
    try:
        users = [u.name for u in psutil.users()]
    except Exception:
        users = []
    return {
        "os": platform.system(),
        "os_version": platform.version(),
        "platform": platform.platform(),
        "kernel": platform.release(),
        "hostname": socket.gethostname(),
        "uptime_seconds": uptime_seconds,
        "boot_time": datetime.fromtimestamp(boot_time).strftime("%Y-%m-%d %H:%M:%S"),
        "users": users,
    }


def collect_metrics() -> Dict[str, Any]:
    """Collect a full metrics snapshot for the dashboard."""
    global prev_sample_time

    now = time.time()
    elapsed = now - prev_sample_time if prev_sample_time is not None else POLL_INTERVAL
    prev_sample_time = now

    cpu_total = psutil.cpu_percent(interval=None)
    cpu_per_core = psutil.cpu_percent(interval=None, percpu=True)
    freq = psutil.cpu_freq()
    cpu_temp = get_cpu_temperatures()
    load_avg = os.getloadavg() if hasattr(os, "getloadavg") else None

    if cpu_total > 85:
        add_alert("CPU", f"{cpu_total:.1f}%", "critical", "CPU usage above 85%")

    virtual_mem = psutil.virtual_memory()
    swap_mem = psutil.swap_memory()
    if virtual_mem.percent > 85:
        add_alert("RAM", f"{virtual_mem.percent:.1f}%", "critical", "RAM usage above 85%")

    cpu_history.append(round(cpu_total, 1))
    ram_history.append(round(virtual_mem.percent, 1))
    per_core_history.append([round(v, 1) for v in cpu_per_core])

    network = collect_network_info(elapsed)
    network_history.append(
        {
            "upload_bps": network["total_upload_bps"],
            "download_bps": network["total_download_bps"],
            "throughput_bps": network["total_throughput_bps"],
            "timestamp": datetime.now().strftime("%H:%M:%S"),
        }
    )

    disk = collect_disk_info(elapsed)
    gpu = get_gpu_info()
    os_info = collect_os_info()

    snapshot = {
        "timestamp": datetime.now().isoformat(),
        "cpu": {
            "total_percent": round(cpu_total, 1),
            "per_core_percent": [round(v, 1) for v in cpu_per_core],
            "frequency_current_mhz": round(freq.current, 1) if freq else None,
            "frequency_min_mhz": round(freq.min, 1) if freq else None,
            "frequency_max_mhz": round(freq.max, 1) if freq else None,
            "temperature_c": cpu_temp,
            "load_avg": list(load_avg) if load_avg else None,
        },
        "gpu": gpu,
        "ram": {
            "total": virtual_mem.total,
            "available": virtual_mem.available,
            "used": virtual_mem.used,
            "free": virtual_mem.free,
            "percent": round(virtual_mem.percent, 1),
            "swap_total": swap_mem.total,
            "swap_used": swap_mem.used,
            "swap_free": swap_mem.free,
            "swap_percent": round(swap_mem.percent, 1),
        },
        "disk": disk,
        "network": network,
        "os": os_info,
        "history": {
            "cpu": list(cpu_history),
            "ram": list(ram_history),
            "network": list(network_history),
            "per_core": list(per_core_history),
        },
        "alerts": list(alerts),
        "thresholds": {
            "cpu_percent": 85,
            "ram_percent": 85,
            "disk_percent": 90,
            "network_spike_bps": NETWORK_SPIKE_THRESHOLD_BPS,
        },
    }
    return snapshot


@app.on_event("startup")
async def startup_event() -> None:
    """Prime counters and start background metric collection."""
    global prev_net_counters, prev_disk_counters, prev_sample_time, last_metrics
    prev_net_counters = psutil.net_io_counters(pernic=True)
    prev_disk_counters = psutil.disk_io_counters()
    prev_sample_time = time.time()
    psutil.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None, percpu=True)
    last_metrics = collect_metrics()
    asyncio.create_task(background_collector())


async def background_collector() -> None:
    """Refresh cached metrics continuously for the API and UI."""
    global last_metrics
    while True:
        try:
            last_metrics = collect_metrics()
        except Exception as exc:
            add_alert("Collector", str(exc), "warning", "Background collector error")
        await asyncio.sleep(POLL_INTERVAL)


@app.get("/api/metrics")
def api_metrics() -> JSONResponse:
    """Return the latest cached metrics snapshot as JSON."""
    return JSONResponse(last_metrics or collect_metrics())


@app.get("/", response_class=HTMLResponse)
def index() -> HTMLResponse:
    """Serve the single-page monitoring dashboard."""
    html = r'''
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>System Monitor Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg: #0b1220;
      --panel: #131c2e;
      --panel-2: #182338;
      --text: #e5eefc;
      --muted: #9db0ce;
      --border: #25314a;
      --green: #29c36a;
      --amber: #f5b942;
      --red: #f05d5e;
      --blue: #57a6ff;
      --cyan: #3ed8d4;
      --shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #09101c 0%, #0d1524 100%);
      color: var(--text);
    }
    .container {
      padding: 18px;
      max-width: 1600px;
      margin: 0 auto;
    }
    .topbar {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .panel, .metric-card {
      background: rgba(19, 28, 46, 0.96);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: var(--shadow);
    }
    .panel {
      padding: 16px;
    }
    .metric-card {
      padding: 16px;
      min-height: 110px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .title {
      color: var(--muted);
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .big {
      font-size: 2rem;
      font-weight: 700;
      margin: 8px 0;
    }
    .subtle {
      color: var(--muted);
      font-size: 0.92rem;
    }
    .grid-4 {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .grid-charts {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .grid-row3 {
      display: grid;
      grid-template-columns: 1.2fr 2fr 1.2fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .panel h3 {
      margin: 0 0 12px 0;
      font-size: 1rem;
    }
    .status {
      font-weight: 700;
    }
    .normal { color: var(--green); }
    .warning { color: var(--amber); }
    .critical { color: var(--red); }
    .na { color: var(--muted); }
    .kvs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px 12px;
    }
    .kv {
      background: var(--panel-2);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
    }
    .kv .label {
      font-size: 0.8rem;
      color: var(--muted);
    }
    .kv .value {
      margin-top: 4px;
      font-weight: 600;
      word-break: break-word;
    }
    .table-wrap {
      overflow: auto;
      max-height: 390px;
      border-radius: 12px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }
    th, td {
      text-align: left;
      padding: 10px;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    th {
      position: sticky;
      top: 0;
      background: #12203a;
      z-index: 1;
    }
    .alerts {
      max-height: 320px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .alert {
      display: grid;
      grid-template-columns: 180px 120px 120px 120px 1fr;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--panel-2);
      border: 1px solid var(--border);
      font-size: 0.92rem;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge.normal { background: rgba(41, 195, 106, 0.18); }
    .badge.warning { background: rgba(245, 185, 66, 0.18); }
    .badge.critical { background: rgba(240, 93, 94, 0.18); }
    .toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      gap: 12px;
    }
    .toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--muted);
      font-size: 0.9rem;
    }
    canvas {
      width: 100% !important;
      height: 280px !important;
    }
    @media (max-width: 1200px) {
      .topbar, .grid-4, .grid-charts, .grid-row3 {
        grid-template-columns: 1fr 1fr;
      }
    }
    @media (max-width: 760px) {
      .topbar, .grid-4, .grid-charts, .grid-row3 {
        grid-template-columns: 1fr;
      }
      .alert {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="topbar">
      <div class="panel">
        <div class="title">Hostname</div>
        <div class="big" id="hostname">—</div>
        <div class="subtle" id="platform">—</div>
      </div>
      <div class="panel">
        <div class="title">Operating System</div>
        <div class="big" id="os-name">—</div>
        <div class="subtle" id="kernel">—</div>
      </div>
      <div class="panel">
        <div class="title">Uptime</div>
        <div class="big" id="uptime">—</div>
        <div class="subtle" id="users">—</div>
      </div>
      <div class="panel">
        <div class="title">Live Clock</div>
        <div class="big" id="clock">—</div>
        <div class="subtle" id="last-updated">Waiting for first sample…</div>
      </div>
    </div>

    <div class="grid-4">
      <div class="metric-card">
        <div class="title">CPU Total</div>
        <div class="big" id="cpu-total">—</div>
        <div class="subtle" id="cpu-extra">—</div>
      </div>
      <div class="metric-card">
        <div class="title">RAM Usage</div>
        <div class="big" id="ram-total">—</div>
        <div class="subtle" id="ram-extra">—</div>
      </div>
      <div class="metric-card">
        <div class="title">Disk Usage</div>
        <div class="big" id="disk-total">—</div>
        <div class="subtle" id="disk-extra">—</div>
      </div>
      <div class="metric-card">
        <div class="title">Network Throughput</div>
        <div class="big" id="net-total">—</div>
        <div class="subtle" id="net-extra">—</div>
      </div>
    </div>

    <div class="grid-charts">
      <div class="panel">
        <div class="toolbar">
          <h3>CPU History</h3>
          <label class="toggle"><input type="checkbox" id="per-core-toggle" /> Show per-core</label>
        </div>
        <canvas id="cpuChart"></canvas>
      </div>
      <div class="panel">
        <h3>RAM History</h3>
        <canvas id="ramChart"></canvas>
      </div>
      <div class="panel">
        <h3>Network History</h3>
        <canvas id="netChart"></canvas>
      </div>
    </div>

    <div class="grid-row3">
      <div class="panel">
        <h3>GPU</h3>
        <div class="kvs" id="gpu-panel"></div>
      </div>
      <div class="panel">
        <h3>Disk Partitions</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>Mount</th>
                <th>FS</th>
                <th>Total</th>
                <th>Used</th>
                <th>Free</th>
                <th>Use %</th>
              </tr>
            </thead>
            <tbody id="disk-table"></tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h3>OS Info</h3>
        <div class="kvs" id="os-panel"></div>
      </div>
    </div>

    <div class="panel">
      <h3>Alerts</h3>
      <div class="alerts" id="alerts"></div>
    </div>
  </div>

  <script>
    const labels = Array.from({ length: 30 }, (_, i) => `${(29 - i) * 2}s` ).reverse();
    const commonOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { labels: { color: '#d6e2f5' } }
      },
      scales: {
        x: {
          ticks: { color: '#8ea3c3', maxTicksLimit: 8 },
          grid: { color: 'rgba(255,255,255,0.04)' }
        },
        y: {
          ticks: { color: '#8ea3c3' },
          grid: { color: 'rgba(255,255,255,0.06)' },
          beginAtZero: true
        }
      }
    };

    const cpuChart = new Chart(document.getElementById('cpuChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'CPU %',
          data: [],
          borderColor: '#57a6ff',
          backgroundColor: 'rgba(87, 166, 255, 0.18)',
          fill: true,
          tension: 0.25,
          pointRadius: 0
        }]
      },
      options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, suggestedMax: 100 } } }
    });

    const ramChart = new Chart(document.getElementById('ramChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'RAM %',
          data: [],
          borderColor: '#3ed8d4',
          backgroundColor: 'rgba(62, 216, 212, 0.18)',
          fill: true,
          tension: 0.25,
          pointRadius: 0
        }]
      },
      options: { ...commonOptions, scales: { ...commonOptions.scales, y: { ...commonOptions.scales.y, suggestedMax: 100 } } }
    });

    const netChart = new Chart(document.getElementById('netChart'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Download MB/s',
            data: [],
            borderColor: '#29c36a',
            backgroundColor: 'rgba(41, 195, 106, 0.15)',
            fill: false,
            tension: 0.25,
            pointRadius: 0
          },
          {
            label: 'Upload MB/s',
            data: [],
            borderColor: '#f5b942',
            backgroundColor: 'rgba(245, 185, 66, 0.15)',
            fill: false,
            tension: 0.25,
            pointRadius: 0
          }
        ]
      },
      options: commonOptions
    });

    function bytesToHuman(bytes) {
      if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return 'N/A';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let value = Number(bytes);
      let idx = 0;
      while (value >= 1024 && idx < units.length - 1) {
        value /= 1024;
        idx++;
      }
      return `${value.toFixed(1)} ${units[idx]}`;
    }

    function formatPercent(value) {
      return value === null || value === undefined ? 'N/A' : `${Number(value).toFixed(1)}%`;
    }

    function classForValue(value, warn = 70, critical = 85) {
      if (value === null || value === undefined) return 'na';
      if (value >= critical) return 'critical';
      if (value >= warn) return 'warning';
      return 'normal';
    }

    function formatUptime(seconds) {
      if (seconds === null || seconds === undefined) return 'N/A';
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${days}d ${hours}h ${mins}m`;
    }

    function kv(label, value, cls = '') {
      return `<div class="kv"><div class="label">${label}</div><div class="value ${cls}">${value}</div></div>`;
    }

    function renderAlerts(items) {
      const root = document.getElementById('alerts');
      if (!items || !items.length) {
        root.innerHTML = '<div class="subtle">No active alerts in memory.</div>';
        return;
      }
      root.innerHTML = items.map(item => `
        <div class="alert">
          <div>${item.timestamp}</div>
          <div><strong>${item.metric}</strong></div>
          <div>${item.value}</div>
          <div><span class="badge ${item.severity}">${item.severity}</span></div>
          <div>${item.details || ''}</div>
        </div>
      `).join('');
    }

    function renderDiskTable(partitions) {
      const root = document.getElementById('disk-table');
      if (!partitions || !partitions.length) {
        root.innerHTML = '<tr><td colspan="7">No partition data available.</td></tr>';
        return;
      }
      root.innerHTML = partitions.map(part => `
        <tr>
          <td>${part.device || 'N/A'}</td>
          <td>${part.mountpoint || 'N/A'}</td>
          <td>${part.fstype || 'N/A'}</td>
          <td>${bytesToHuman(part.total)}</td>
          <td>${bytesToHuman(part.used)}</td>
          <td>${bytesToHuman(part.free)}</td>
          <td class="${classForValue(part.percent, 75, 90)}">${formatPercent(part.percent)}</td>
        </tr>
      `).join('');
    }

    function updateCpuChart(history, perCoreHistory, showPerCore) {
      if (showPerCore && perCoreHistory && perCoreHistory.length) {
        const coreCount = perCoreHistory[perCoreHistory.length - 1].length;
        const colors = ['#57a6ff', '#29c36a', '#f5b942', '#f05d5e', '#b388ff', '#3ed8d4', '#ff7ab6', '#9ccc65'];
        cpuChart.data.datasets = Array.from({ length: coreCount }, (_, idx) => ({
          label: `Core ${idx}`,
          data: perCoreHistory.map(sample => sample[idx] ?? null),
          borderColor: colors[idx % colors.length],
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.2,
          pointRadius: 0
        }));
      } else {
        cpuChart.data.datasets = [{
          label: 'CPU %',
          data: history || [],
          borderColor: '#57a6ff',
          backgroundColor: 'rgba(87, 166, 255, 0.18)',
          fill: true,
          tension: 0.25,
          pointRadius: 0
        }];
      }
      cpuChart.update();
    }

    async function refresh() {
      try {
        const response = await fetch('/api/metrics');
        const data = await response.json();

        document.getElementById('hostname').textContent = data.os.hostname || 'N/A';
        document.getElementById('platform').textContent = data.os.platform || 'N/A';
        document.getElementById('os-name').textContent = data.os.os || 'N/A';
        document.getElementById('kernel').textContent = `Kernel ${data.os.kernel || 'N/A'}`;
        document.getElementById('uptime').textContent = formatUptime(data.os.uptime_seconds);
        document.getElementById('users').textContent = `Users: ${(data.os.users || []).join(', ') || 'None'}`;
        document.getElementById('last-updated').textContent = `Updated ${new Date(data.timestamp).toLocaleTimeString()}`;

        const cpuCls = classForValue(data.cpu.total_percent);
        document.getElementById('cpu-total').className = `big ${cpuCls}`;
        document.getElementById('cpu-total').textContent = formatPercent(data.cpu.total_percent);
        document.getElementById('cpu-extra').textContent = `Freq ${data.cpu.frequency_current_mhz ? data.cpu.frequency_current_mhz.toFixed(0) + ' MHz' : 'N/A'} • Temp ${data.cpu.temperature_c ?? 'N/A'}°C`;

        const ramCls = classForValue(data.ram.percent);
        document.getElementById('ram-total').className = `big ${ramCls}`;
        document.getElementById('ram-total').textContent = formatPercent(data.ram.percent);
        document.getElementById('ram-extra').textContent = `${bytesToHuman(data.ram.used)} / ${bytesToHuman(data.ram.total)} • Swap ${formatPercent(data.ram.swap_percent)}`;

        const diskCls = classForValue(data.disk.highest_usage_percent, 75, 90);
        document.getElementById('disk-total').className = `big ${diskCls}`;
        document.getElementById('disk-total').textContent = formatPercent(data.disk.highest_usage_percent);
        document.getElementById('disk-extra').textContent = `Read ${bytesToHuman(data.disk.io.read_bytes_per_sec)}/s • Write ${bytesToHuman(data.disk.io.write_bytes_per_sec)}/s`;

        const netBps = data.network.total_throughput_bps || 0;
        const netCls = data.network.spike ? 'critical' : classForValue((netBps / (1024 * 1024)) * 10, 70, 100);
        document.getElementById('net-total').className = `big ${netCls}`;
        document.getElementById('net-total').textContent = `${bytesToHuman(netBps)}/s`;
        document.getElementById('net-extra').textContent = `↓ ${bytesToHuman(data.network.total_download_bps)}/s • ↑ ${bytesToHuman(data.network.total_upload_bps)}/s` + (data.network.spike ? ' • SPIKE' : '');

        const gpu = data.gpu || {};
        document.getElementById('gpu-panel').innerHTML = [
          kv('Name', gpu.available ? gpu.name : 'N/A'),
          kv('Usage', formatPercent(gpu.usage_percent), classForValue(gpu.usage_percent)),
          kv('VRAM Used', gpu.memory_used_mb !== null && gpu.memory_used_mb !== undefined ? `${gpu.memory_used_mb.toFixed(1)} MB` : 'N/A'),
          kv('VRAM Total', gpu.memory_total_mb !== null && gpu.memory_total_mb !== undefined ? `${gpu.memory_total_mb.toFixed(1)} MB` : 'N/A'),
          kv('Temperature', gpu.temperature !== null && gpu.temperature !== undefined ? `${gpu.temperature.toFixed(1)} °C` : 'N/A', classForValue(gpu.temperature, 70, 85)),
          kv('Status', gpu.available ? 'Detected' : (gpu.reason || 'Unavailable'), gpu.available ? 'normal' : 'na')
        ].join('');

        document.getElementById('os-panel').innerHTML = [
          kv('OS Version', data.os.os_version || 'N/A'),
          kv('Boot Time', data.os.boot_time || 'N/A'),
          kv('Load Avg', data.cpu.load_avg ? data.cpu.load_avg.map(v => Number(v).toFixed(2)).join(' / ') : 'N/A'),
          kv('Users', (data.os.users || []).join(', ') || 'None'),
          kv('Net Spike Threshold', `${bytesToHuman(data.thresholds.network_spike_bps)}/s`),
          kv('Interfaces', String((data.network.interfaces || []).length))
        ].join('');

        renderDiskTable(data.disk.partitions || []);
        renderAlerts(data.alerts || []);

        ramChart.data.datasets[0].data = data.history.ram || [];
        ramChart.update();

        netChart.data.datasets[0].data = (data.history.network || []).map(item => ((item.download_bps || 0) / (1024 * 1024)).toFixed(2));
        netChart.data.datasets[1].data = (data.history.network || []).map(item => ((item.upload_bps || 0) / (1024 * 1024)).toFixed(2));
        netChart.update();

        const showPerCore = document.getElementById('per-core-toggle').checked;
        updateCpuChart(data.history.cpu || [], data.history.per_core || [], showPerCore);
      } catch (error) {
        document.getElementById('last-updated').textContent = `Refresh failed: ${error}`;
      }
    }

    document.getElementById('per-core-toggle').addEventListener('change', refresh);

    setInterval(() => {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString();
    }, 1000);

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>
'''
    return HTMLResponse(content=html)


if __name__ == "__main__":
    import uvicorn

    print(f"System Monitor Dashboard running at http://127.0.0.1:{PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)

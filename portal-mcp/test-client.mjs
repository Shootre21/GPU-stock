import { spawn } from 'node:child_process';

function send(proc, msg) {
  proc.stdin.write(JSON.stringify(msg) + '\n');
}

const proc = spawn('node', ['server.mjs'], {
  cwd: new URL('.', import.meta.url).pathname,
  stdio: ['pipe', 'pipe', 'pipe']
});

proc.stderr.on('data', chunk => {
  process.stderr.write(`[mcp-stderr] ${chunk}`);
});

proc.stdout.on('data', chunk => {
  process.stdout.write(`[mcp] ${chunk}`);
});

proc.on('exit', code => {
  console.log(`\n[mcp-exit] code=${code}`);
});

setTimeout(() => {
  send(proc, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'portal-mcp-test-client', version: '0.1.0' }
    }
  });
}, 100);

setTimeout(() => {
  send(proc, { jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
}, 300);

setTimeout(() => {
  send(proc, { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
}, 500);

setTimeout(() => {
  send(proc, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'portal.get_worker_state', arguments: {} } });
}, 800);

setTimeout(() => {
  send(proc, { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'portal.list_jobs', arguments: {} } });
}, 1100);

setTimeout(() => {
  send(proc, { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'portal.get_audit_log', arguments: {} } });
}, 1400);

setTimeout(() => {
  proc.kill('SIGTERM');
}, 3000);

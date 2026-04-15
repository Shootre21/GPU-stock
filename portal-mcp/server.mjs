import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const PORTAL_BASE = process.env.PORTAL_BASE || 'http://127.0.0.1:4217';

async function requestPortal(path, { method = 'GET', body } = {}) {
  const res = await fetch(new URL(path, PORTAL_BASE), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
  if (!res.ok) throw new Error(typeof parsed === 'string' ? parsed : JSON.stringify(parsed));
  return parsed;
}

function jsonContent(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

const server = new Server({ name: 'portal-mcp', version: '0.1.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'portal.list_sites', description: 'List portal sites', inputSchema: { type: 'object', properties: {} } },
    { name: 'portal.list_jobs', description: 'List portal jobs', inputSchema: { type: 'object', properties: {} } },
    { name: 'portal.create_job', description: 'Create a portal job', inputSchema: { type: 'object', properties: { platform: { type: 'string' }, kind: { type: 'string' }, text: { type: 'string' }, priority: { type: 'string' } }, required: ['platform', 'kind', 'text'] } },
    { name: 'portal.get_worker_state', description: 'Get worker state', inputSchema: { type: 'object', properties: {} } },
    { name: 'portal.retry_job', description: 'Retry a failed/cancelled job', inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } },
    { name: 'portal.cancel_job', description: 'Cancel a queued/claimed job', inputSchema: { type: 'object', properties: { jobId: { type: 'string' } }, required: ['jobId'] } },
    { name: 'portal.get_audit_log', description: 'Get portal audit log', inputSchema: { type: 'object', properties: {} } },
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;
  switch (name) {
    case 'portal.list_sites':
      return jsonContent(await requestPortal('/api/sites'));
    case 'portal.list_jobs':
      return jsonContent(await requestPortal('/api/jobs'));
    case 'portal.create_job':
      return jsonContent(await requestPortal('/api/jobs', { method: 'POST', body: { platform: args.platform, kind: args.kind, text: args.text, priority: args.priority || 'normal' } }));
    case 'portal.get_worker_state':
      return jsonContent(await requestPortal('/api/worker'));
    case 'portal.retry_job':
      return jsonContent(await requestPortal(`/api/jobs/${args.jobId}/retry`, { method: 'POST', body: {} }));
    case 'portal.cancel_job':
      return jsonContent(await requestPortal(`/api/jobs/${args.jobId}/cancel`, { method: 'POST', body: {} }));
    case 'portal.get_audit_log':
      return jsonContent(await requestPortal('/api/audit'));
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);

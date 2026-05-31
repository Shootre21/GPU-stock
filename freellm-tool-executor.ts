import { db } from '@/lib/db';
import type { ToolDefinition } from '@/lib/providers/base';

export interface ExecutedToolResult {
  name: string;
  arguments: string;
  result: string;
}

export async function getActiveToolDefinitions(): Promise<ToolDefinition[]> {
  const tools = await db.tool.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: safeJsonParse(tool.schema, {
        type: 'object',
        properties: {},
      }),
    },
  }));
}

export async function executeToolByName(name: string, rawArguments: string): Promise<ExecutedToolResult> {
  const args = safeJsonParse<Record<string, unknown>>(rawArguments, {});

  if (name === 'web_search') {
    const query = String(args.query || '').trim();
    const count = Number(args.count || 5);
    if (!query) {
      return {
        name,
        arguments: rawArguments,
        result: JSON.stringify({ error: 'Missing required argument: query' }),
      };
    }

    const result = await runDuckDuckGoSearch(query, count);
    return {
      name,
      arguments: rawArguments,
      result: JSON.stringify(result, null, 2),
    };
  }

  return {
    name,
    arguments: rawArguments,
    result: JSON.stringify({ error: `Tool executor not implemented for ${name}` }),
  };
}

async function runDuckDuckGoSearch(query: string, count: number) {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (FreeLLM Hub tool executor)',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    return { error: `Search failed with status ${res.status}` };
  }

  const html = await res.text();
  const matches = [...html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g)];
  const results = matches.slice(0, Math.max(1, Math.min(count, 10))).map((m) => ({
    title: decodeHtml(stripTags(m[2] || '')),
    url: decodeHtml(m[1] || ''),
  }));

  return { query, results };
}

function safeJsonParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, '');
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

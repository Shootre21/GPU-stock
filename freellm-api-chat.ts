import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getProvider } from '@/lib/providers';
import type { LLMMessage, ToolCall, ToolDefinition, StreamEvent } from '@/lib/providers/base';
import { executeToolByName, getActiveToolDefinitions } from '@/lib/tool-executor';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { modelId, providerType, messages, systemPrompt } = body;

    if (!modelId || !providerType || !messages) {
      return NextResponse.json(
        { error: 'modelId, providerType, and messages are required' },
        { status: 400 }
      );
    }

    const providerConfig = await db.provider.findFirst({
      where: { type: providerType, isActive: true },
    });

    let apiKey: string | null = null;
    let baseUrl: string | undefined;

    if (providerConfig) {
      apiKey = providerConfig.apiKey || providerConfig.oauthToken || null;
      baseUrl = providerConfig.baseUrl || undefined;
    }

    if (providerType === 'zai') {
      apiKey = null;
    }

    let providerInstance;
    try {
      providerInstance = getProvider(providerType);
    } catch {
      return NextResponse.json(
        { error: `Unknown provider: ${providerType}` },
        { status: 400 }
      );
    }

    const finalMessages: LLMMessage[] = [];
    if (systemPrompt) {
      finalMessages.push({ role: 'system', content: systemPrompt });
    }
    finalMessages.push(...messages);

    const tools = await getActiveToolDefinitions();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        function sendEvent(event: StreamEvent) {
          const data = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        try {
          const firstPassMessages = [...finalMessages];
          const toolCalls: ToolCall[] = [];
          let contentSent = false;

          const gen = providerInstance.chatStream(
            firstPassMessages,
            modelId,
            apiKey,
            tools.length > 0 ? tools : undefined,
            baseUrl
          );

          for await (const event of gen) {
            if (event.type === 'tool_call') {
              toolCalls.push(event.toolCall);
              sendEvent(event);
            } else {
              if (event.type === 'content_delta') contentSent = true;
              sendEvent(event);
            }
          }

          if (toolCalls.length > 0) {
            const assistantToolCallMessage: LLMMessage = {
              role: 'assistant',
              content: '',
              toolCalls,
            };

            const toolResultMessages: LLMMessage[] = [];

            for (const tc of toolCalls) {
              const executed = await executeToolByName(tc.function.name, tc.function.arguments || '{}');
              toolResultMessages.push({
                role: 'tool',
                content: JSON.stringify({
                  name: executed.name,
                  args: executed.arguments,
                  result: executed.result,
                }),
                toolCallId: tc.id,
              });
            }

            const secondPassMessages = [
              ...firstPassMessages,
              assistantToolCallMessage,
              ...toolResultMessages,
            ];

            const secondGen = providerInstance.chatStream(
              secondPassMessages,
              modelId,
              apiKey,
              tools.length > 0 ? tools : undefined,
              baseUrl
            );

            for await (const event of secondGen) {
              sendEvent(event);
            }
          } else if (!contentSent) {
            sendEvent({ type: 'done' });
          }
        } catch (err) {
          sendEvent({ type: 'error', error: `Stream error: ${err}` });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    );
  }
}

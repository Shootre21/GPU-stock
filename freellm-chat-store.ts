import { create } from 'zustand';

export interface Conversation {
  id: string;
  title: string;
  modelId: string;
  systemPrompt: string;
  createdAt: string;
  updatedAt: string;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  modelId?: string | null;
  toolCalls?: string | null;
  toolCallId?: string | null;
  isStreaming: boolean;
  createdAt: string;
}

interface ChatStore {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  selectedModel: { provider: string; modelId: string; name: string } | null;
  isStreaming: boolean;
  messages: Message[];
  abortController: AbortController | null;

  // Computed
  activeConversation: () => Conversation | undefined;

  // Actions
  fetchConversations: () => Promise<void>;
  createConversation: (modelId?: string) => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  setSelectedModel: (model: { provider: string; modelId: string; name: string }) => void;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  selectedModel: { provider: 'zai', modelId: 'glm-4-flash', name: 'GLM-4 Flash' },
  isStreaming: false,
  messages: [],
  abortController: null,

  activeConversation: () => {
    const state = get();
    return state.conversations.find((c) => c.id === state.activeConversationId);
  },

  fetchConversations: async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      set({ conversations: data.conversations });
    } catch (error) {
      console.error('Failed to fetch conversations:', error);
    }
  },

  createConversation: async (modelId?: string) => {
    const state = get();
    const mid = modelId || state.selectedModel?.modelId || 'glm-4-flash';

    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: mid }),
    });

    const data = await res.json();
    const newConversation: Conversation = data.conversation;

    set((s) => ({
      conversations: [newConversation, ...s.conversations],
      activeConversationId: newConversation.id,
      messages: [],
    }));

    return newConversation.id;
  },

  selectConversation: async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      const conversation = data.conversation;

      set({
        activeConversationId: id,
        messages: conversation.messages || [],
      });

      // Also update the conversation in the list
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, ...conversation } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  },

  deleteConversation: async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });

      set((s) => {
        const filtered = s.conversations.filter((c) => c.id !== id);
        const newActiveId =
          s.activeConversationId === id
            ? filtered.length > 0
              ? filtered[0].id
              : null
            : s.activeConversationId;

        return {
          conversations: filtered,
          activeConversationId: newActiveId,
          messages: newActiveId === s.activeConversationId ? s.messages : [],
        };
      });
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  },

  updateConversationTitle: async (id: string, title: string) => {
    try {
      await fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, title } : c
        ),
      }));
    } catch (error) {
      console.error('Failed to update conversation title:', error);
    }
  },

  setSelectedModel: (model) => {
    set({ selectedModel: model });
  },

  sendMessage: async (content: string) => {
    const state = get();
    let conversationId = state.activeConversationId;

    // Create a new conversation if none is active
    if (!conversationId) {
      conversationId = await get().createConversation();
    }

    if (!conversationId) return;

    const model = state.selectedModel;
    if (!model) return;

    // Add user message optimistically
    const userMessage: Message = {
      id: `temp-user-${Date.now()}`,
      conversationId,
      role: 'user',
      content,
      isStreaming: false,
      createdAt: new Date().toISOString(),
    };

    // Add assistant message placeholder
    const assistantMessage: Message = {
      id: `temp-assistant-${Date.now()}`,
      conversationId,
      role: 'assistant',
      content: '',
      modelId: model.modelId,
      isStreaming: true,
      createdAt: new Date().toISOString(),
    };

    set((s) => ({
      messages: [...s.messages, userMessage, assistantMessage],
      isStreaming: true,
    }));

    // Save user message to DB
    await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'user', content }),
    });

    // Prepare messages for API
    const apiMessages = state.messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
        toolCallId: m.toolCallId || undefined,
        toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      }));

    apiMessages.push({ role: 'user' as const, content });

    // Get system prompt from conversation
    const conversation = state.conversations.find((c) => c.id === conversationId);
    const systemPrompt = conversation?.systemPrompt;

    // Stream response
    const abortController = new AbortController();
    set({ abortController });

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: model.modelId,
          providerType: model.provider,
          messages: apiMessages,
          systemPrompt,
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Chat request failed');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';
      const toolMessagesToPersist: Array<{ content: string; toolCallId?: string }> = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));

            if (event.type === 'content_delta') {
              fullContent += event.content;
              set((s) => ({
                messages: s.messages.map((m) =>
                  m.id === assistantMessage.id
                    ? { ...m, content: fullContent }
                    : m
                ),
              }));
            }

            if (event.type === 'tool_call' && event.toolCall) {
              const toolPayload = JSON.stringify({
                name: event.toolCall.function?.name || 'tool',
                args: event.toolCall.function?.arguments || '{}',
                result: '',
              });

              toolMessagesToPersist.push({
                content: toolPayload,
                toolCallId: event.toolCall.id || undefined,
              });

              set((s) => ({
                messages: [
                  ...s.messages,
                  {
                    id: `temp-tool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    conversationId,
                    role: 'tool',
                    content: toolPayload,
                    toolCallId: event.toolCall.id || null,
                    isStreaming: false,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }));
            }
          } catch {
            // Skip malformed events
          }
        }
      }

      for (const toolMsg of toolMessagesToPersist) {
        await fetch(`/api/conversations/${conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'tool',
            content: toolMsg.content,
            toolCallId: toolMsg.toolCallId,
          }),
        });
      }

      // Save assistant message to DB
      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: fullContent,
          modelId: model.modelId,
        }),
      });

      // Update conversation in list
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === conversationId ? { ...c, updatedAt: new Date().toISOString() } : c
        ),
      }));

      // Auto-title: if first exchange, use user message as title
      if (conversation && conversation.title === 'New Chat') {
        const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
        get().updateConversationTitle(conversationId, title);
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Stream error:', err);
        set((s) => ({
          messages: s.messages.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `Error: ${(err as Error).message}`, isStreaming: false }
              : m
          ),
        }));
      }
    } finally {
      set({ isStreaming: false, abortController: null });
      // Mark message as not streaming
      set((s) => ({
        messages: s.messages.map((m) =>
          m.id === assistantMessage.id ? { ...m, isStreaming: false } : m
        ),
      }));
    }
  },

  stopStreaming: () => {
    const controller = get().abortController;
    if (controller) {
      controller.abort();
      set({ isStreaming: false, abortController: null });
    }
  },

  clearMessages: () => {
    set({ messages: [] });
  },
}));

import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { DeepSeekProvider } from './deepseek';
import { GoogleProvider } from './google';
import { VeniceProvider } from './venice';
import { KimiProvider } from './kimi';
import { ZAIProvider } from './zai';
import { OllamaProvider } from './ollama';
import type { BaseProvider } from './base';

export const providers: Record<string, BaseProvider> = {
  openai: new OpenAIProvider(),
  anthropic: new AnthropicProvider(),
  deepseek: new DeepSeekProvider(),
  google: new GoogleProvider(),
  venice: new VeniceProvider(),
  kimi: new KimiProvider(),
  zai: new ZAIProvider(),
  ollama: new OllamaProvider(),
};

export function getProvider(type: string): BaseProvider {
  const provider = providers[type];
  if (!provider) throw new Error(`Unknown provider: ${type}`);
  return provider;
}

export const defaultModels = [
  // OpenAI free models
  { provider: 'openai', modelId: 'gpt-4o-mini', name: 'GPT-4o Mini', free: true, supportsTools: true },
  { provider: 'openai', modelId: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', free: true, supportsTools: true },
  { provider: 'openai', modelId: 'o3-mini', name: 'o3-mini', free: true, supportsTools: true },
  { provider: 'openai', modelId: 'o4-mini', name: 'o4-mini', free: true, supportsTools: true },
  // Anthropic free models
  { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', free: true, supportsTools: true },
  { provider: 'anthropic', modelId: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', free: true, supportsTools: true },
  // DeepSeek
  { provider: 'deepseek', modelId: 'deepseek-chat', name: 'DeepSeek V3', free: true, supportsTools: true },
  { provider: 'deepseek', modelId: 'deepseek-reasoner', name: 'DeepSeek R1', free: true, supportsTools: false },
  // Google
  { provider: 'google', modelId: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', free: true, supportsTools: true },
  { provider: 'google', modelId: 'gemini-2.5-flash-preview-05-20', name: 'Gemini 2.5 Flash', free: true, supportsTools: true },
  // Venice
  { provider: 'venice', modelId: 'venice-3.5', name: 'Venice 3.5', free: true, supportsTools: true },
  { provider: 'venice', modelId: 'llama-4-scout', name: 'LLaMA 4 Scout', free: true, supportsTools: true },
  // Kimi
  { provider: 'kimi', modelId: 'moonshot-v1-8k', name: 'Moonshot V1 8K', free: true, supportsTools: true },
  { provider: 'kimi', modelId: 'moonshot-v1-32k', name: 'Moonshot V1 32K', free: true, supportsTools: true },
  // Z.ai GLM
  { provider: 'zai', modelId: 'glm-4-flash', name: 'GLM-4 Flash', free: true, supportsTools: false },
  { provider: 'zai', modelId: 'glm-4-plus', name: 'GLM-4 Plus', free: true, supportsTools: false },
  { provider: 'zai', modelId: 'glm-z1-flash', name: 'GLM-Z1 Flash', free: true, supportsTools: false },
  // Local Ollama models
  { provider: 'ollama', modelId: 'qwen-repaired-universal:latest', name: 'Qwen Repaired Universal', free: true, supportsTools: true },
  { provider: 'ollama', modelId: 'qwen-repaired-gemma4:latest', name: 'Qwen Repaired Gemma4', free: true, supportsTools: true },
  { provider: 'ollama', modelId: 'gemma4:latest', name: 'Gemma4 Local', free: true, supportsTools: true },
];

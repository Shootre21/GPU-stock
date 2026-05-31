'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Brain,
  Zap,
  Globe,
  Shield,
  Moon,
  Check,
  Loader2,
  ExternalLink,
  Unplug,
  LogIn,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useProviderStore, type ProviderConfig } from '@/store/provider-store';
import { getOAuthConfig } from '@/lib/oauth-config';

const providerIcons: Record<string, React.ElementType> = {
  zai: Bot,
  ollama: Server,
  openai: Sparkles,
  anthropic: Brain,
  deepseek: Zap,
  google: Globe,
  venice: Shield,
  kimi: Moon,
};

const providerColors: Record<string, string> = {
  zai: 'text-emerald-400',
  ollama: 'text-violet-400',
  openai: 'text-green-400',
  anthropic: 'text-orange-400',
  deepseek: 'text-blue-400',
  google: 'text-red-400',
  venice: 'text-purple-400',
  kimi: 'text-cyan-400',
};

const providerBgs: Record<string, string> = {
  zai: 'bg-emerald-500/10',
  ollama: 'bg-violet-500/10',
  openai: 'bg-green-500/10',
  anthropic: 'bg-orange-500/10',
  deepseek: 'bg-blue-500/10',
  google: 'bg-red-500/10',
  venice: 'bg-purple-500/10',
  kimi: 'bg-cyan-500/10',
};

const providerBorders: Record<string, string> = {
  zai: 'border-emerald-500/20',
  ollama: 'border-violet-500/20',
  openai: 'border-green-500/20',
  anthropic: 'border-orange-500/20',
  deepseek: 'border-blue-500/20',
  google: 'border-red-500/20',
  venice: 'border-purple-500/20',
  kimi: 'border-cyan-500/20',
};

const providerDescriptions: Record<string, string> = {
  zai: 'Built-in models from Z.ai — no configuration needed.',
  ollama: 'Local Ollama models running on this machine via http://127.0.0.1:11434.',
  openai: 'GPT-4o, GPT-4o Mini, o3-mini, o4-mini from OpenAI.',
  anthropic: 'Claude Sonnet 4, Claude 3.5 Haiku from Anthropic.',
  deepseek: 'DeepSeek V3, DeepSeek R1 — powerful open-source models.',
  google: 'Gemini 2.0 Flash, Gemini 2.5 Flash from Google.',
  venice: 'Privacy-focused LLMs — Venice 3.5, LLaMA 4 Scout.',
  kimi: 'Moonshot V1 8K/32K/128K from Kimi/Moonshot AI.',
};

interface ProviderCardProps {
  provider: ProviderConfig;
}

export default function ProviderCard({ provider }: ProviderCardProps) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const { fetchProviders } = useProviderStore();
  const popupRef = useRef<Window | null>(null);

  const Icon = providerIcons[provider.type] || Bot;
  const color = providerColors[provider.type] || 'text-emerald-400';
  const bg = providerBgs[provider.type] || 'bg-emerald-500/10';
  const border = providerBorders[provider.type] || 'border-emerald-500/20';
  const oauthConfig = getOAuthConfig(provider.type);

  const isBuiltIn = provider.type === 'zai' || provider.type === 'ollama';
  const isConnected = provider.type === 'ollama' ? true : !!(provider.oauthToken || provider.apiKey);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === 'oauth-token' && event.data.provider === provider.type) {
        handleTokenReceived(event.data.token);
      }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [provider.type]);

  const handleTokenReceived = useCallback(async (token: string) => {
    setStatus('connecting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.type, token }),
      });

      if (!res.ok) {
        throw new Error('Failed to store token');
      }

      await fetchProviders();
      setStatus('connected');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Connection failed');
      setTimeout(() => {
        setStatus('idle');
        setErrorMessage('');
      }, 4000);
    }
  }, [provider.type, fetchProviders]);

  const handleConnect = useCallback(() => {
    const width = 520;
    const height = 620;
    const left = (screen.width - width) / 2;
    const top = (screen.height - height) / 2;

    const connectUrl = `/api/oauth/connect?provider=${provider.type}`;
    const popup = window.open(
      connectUrl,
      `oauth_${provider.type}`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      setStatus('error');
      setErrorMessage('Popup blocked — allow popups for this site');
      setTimeout(() => {
        setStatus('idle');
        setErrorMessage('');
      }, 4000);
      return;
    }

    popupRef.current = popup;
    setStatus('connecting');

    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        popupRef.current = null;
        setStatus((prev) => (prev === 'connecting' ? 'idle' : prev));
      }
    }, 500);

    setTimeout(() => clearInterval(checkClosed), 10 * 60 * 1000);
  }, [provider.type]);

  const handleDisconnect = useCallback(async () => {
    try {
      await fetch(`/api/oauth/token?provider=${provider.type}`, { method: 'DELETE' });
      await fetchProviders();
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  }, [provider.type, fetchProviders]);

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-all',
        bg,
        border,
        isConnected && !isBuiltIn && 'ring-1 ring-emerald-500/20'
      )}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={cn(
            'w-10 h-10 rounded-lg flex items-center justify-center shrink-0',
            bg,
            `border ${border}`
          )}
        >
          <Icon className={cn('w-5 h-5', color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{provider.name}</h3>
            {isBuiltIn ? (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border-0">
                Built-in / Local
              </Badge>
            ) : isConnected ? (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border-0">
                <Check className="w-2.5 h-2.5 mr-0.5" />
                Connected
              </Badge>
            ) : (
              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-zinc-500/20 text-zinc-400 border-0">
                Not Connected
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {providerDescriptions[provider.type] || 'AI model provider'}
          </p>
        </div>
      </div>

      {isBuiltIn ? (
        <div className="flex items-center gap-2 bg-emerald-500/5 rounded-lg px-3 py-2.5 border border-emerald-500/10">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-xs text-emerald-400">
            {provider.type === 'ollama' ? 'Ready when local Ollama is running' : 'Ready to use — no sign-in required'}
          </span>
        </div>
      ) : (
        <div className="space-y-3">
          {status === 'connecting' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-500/5 rounded-lg px-3 py-2 border border-blue-500/10">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
              Waiting for browser sign-in...
            </div>
          )}
          {status === 'connected' && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/5 rounded-lg px-3 py-2 border border-emerald-500/10">
              <Check className="w-3.5 h-3.5" />
              Token saved successfully!
            </div>
          )}
          {status === 'error' && errorMessage && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 rounded-lg px-3 py-2 border border-red-500/10">
              {errorMessage}
            </div>
          )}

          <div className="flex items-center gap-2">
            {!isConnected ? (
              <Button
                size="sm"
                onClick={handleConnect}
                disabled={status === 'connecting'}
                className={cn(
                  'h-8 text-xs text-white gap-1.5',
                  `bg-[${oauthConfig.color}] hover:opacity-90`
                )}
                style={{ backgroundColor: oauthConfig.color + '22', color: oauthConfig.color, borderColor: oauthConfig.color + '40', borderWidth: 1 }}
              >
                {status === 'connecting' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LogIn className="w-3.5 h-3.5" />
                )}
                Sign in / Paste Token
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDisconnect}
                className="h-8 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300 gap-1.5"
              >
                <Unplug className="w-3.5 h-3.5" />
                Disconnect
              </Button>
            )}

            <a
              href={oauthConfig.tokenHelpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              {provider.name} →
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

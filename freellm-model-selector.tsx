'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Bot,
  Sparkles,
  Brain,
  Zap,
  Globe,
  Shield,
  Moon,
  Search,
  Check,
  ChevronDown,
  Server,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useProviderStore, type ModelInfo } from '@/store/provider-store';

interface ProviderGroup {
  provider: string;
  name: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  isBuiltIn: boolean;
  models: ModelInfo[];
}

const providerMeta: Record<string, { name: string; icon: React.ElementType; color: string; bgColor: string; borderColor: string; isBuiltIn: boolean }> = {
  zai: { name: 'Z.ai', icon: Bot, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30', isBuiltIn: true },
  ollama: { name: 'Ollama', icon: Server, color: 'text-violet-400', bgColor: 'bg-violet-500/10', borderColor: 'border-violet-500/30', isBuiltIn: true },
  openai: { name: 'OpenAI', icon: Sparkles, color: 'text-green-400', bgColor: 'bg-green-500/10', borderColor: 'border-green-500/30', isBuiltIn: false },
  anthropic: { name: 'Anthropic', icon: Brain, color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/30', isBuiltIn: false },
  deepseek: { name: 'DeepSeek', icon: Zap, color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30', isBuiltIn: false },
  google: { name: 'Google', icon: Globe, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30', isBuiltIn: false },
  venice: { name: 'Venice', icon: Shield, color: 'text-purple-400', bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/30', isBuiltIn: false },
  kimi: { name: 'Kimi', icon: Moon, color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/30', isBuiltIn: false },
};

export default function ModelSelector() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const { selectedModel, setSelectedModel } = useChatStore();
  const { availableModels, fetchModels, providers } = useProviderStore();

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const providerGroups = useMemo(() => {
    const groups: ProviderGroup[] = [];
    const metaKeys = Object.keys(providerMeta);

    for (const key of metaKeys) {
      const meta = providerMeta[key];
      const models = availableModels.filter(
        (m) => m.provider === key && m.name.toLowerCase().includes(search.toLowerCase())
      );
      if (models.length > 0 || key === 'zai' || key === 'ollama') {
        groups.push({
          provider: key,
          ...meta,
          models:
            (key === 'zai' || key === 'ollama') && models.length === 0
              ? []
              : models,
        });
      }
    }

    return groups;
  }, [availableModels, search]);

  const selectedMeta = selectedModel ? providerMeta[selectedModel.provider] : providerMeta.zai;
  const SelectedIcon = selectedMeta?.icon || Bot;

  const getProviderStatus = (providerType: string) => {
    const provider = providers.find((p) => p.type === providerType);
    if (providerType === 'zai' || providerType === 'ollama') return 'built-in';
    if (provider?.oauthToken || provider?.apiKey) return 'connected';
    return 'disconnected';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 gap-2 text-sm font-normal bg-transparent hover:bg-accent/50 border-border/50"
        >
          <SelectedIcon className={cn('w-4 h-4', selectedMeta?.color)} />
          <span className="max-w-[200px] truncate">
            {selectedModel?.name || 'Select Model'}
          </span>
          {(selectedModel?.provider === 'zai' || selectedModel?.provider === 'ollama') && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/20 text-emerald-400 border-0">
              Local/Built-in
            </Badge>
          )}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[22rem] p-0 bg-popover border-border/50"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="p-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 bg-transparent border-border/50"
            />
          </div>
        </div>

        <ScrollArea className="max-h-[460px] pr-1">
          <div className="px-2 pb-2">
            {providerGroups.map((group) => {
              const status = getProviderStatus(group.provider);
              const GroupIcon = group.icon;

              return (
                <div key={group.provider} className="mb-2">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <GroupIcon className={cn('w-3.5 h-3.5', group.color)} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {group.name}
                    </span>
                    {status === 'built-in' && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-3.5 bg-emerald-500/20 text-emerald-400 border-0">
                        Local/Built-in
                      </Badge>
                    )}
                    {status === 'connected' && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-3.5 bg-emerald-500/20 text-emerald-400 border-0">
                        Connected
                      </Badge>
                    )}
                    {status === 'disconnected' && (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-3.5 bg-amber-500/20 text-amber-400 border-0">
                        Sign in
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-0.5">
                    {group.models.map((model) => {
                      const isSelected = selectedModel?.modelId === model.modelId && selectedModel?.provider === model.provider;

                      return (
                        <button
                          key={`${model.provider}-${model.modelId}`}
                          onClick={() => {
                            setSelectedModel({
                              provider: model.provider,
                              modelId: model.modelId,
                              name: model.name,
                            });
                            setOpen(false);
                            setSearch('');
                          }}
                          className={cn(
                            'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                            isSelected
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'text-foreground/80 hover:bg-accent/50'
                          )}
                        >
                          <div className="flex-1 min-w-0 text-left">
                            <div className="font-medium text-sm truncate">{model.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {group.name} · {model.modelId}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {model.free && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/10 text-emerald-400 border-0">
                                Free
                              </Badge>
                            )}
                            {model.supportsTools && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4 bg-blue-500/10 text-blue-400 border-0">
                                Tools
                              </Badge>
                            )}
                            {isSelected && (
                              <Check className="w-4 h-4 text-emerald-400" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

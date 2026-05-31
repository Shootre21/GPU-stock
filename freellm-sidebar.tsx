'use client';

import { useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  MessageSquare,
  Trash2,
  Settings,
  X,
  Bot,
  Sparkles,
  Brain,
  Zap,
  Globe,
  Shield,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import { useProviderStore } from '@/store/provider-store';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
}

const providerIcons: Record<string, React.ElementType> = {
  zai: Bot,
  openai: Sparkles,
  anthropic: Brain,
  deepseek: Zap,
  google: Globe,
  venice: Shield,
  kimi: Moon,
};

const providerColors: Record<string, string> = {
  zai: 'text-emerald-400',
  openai: 'text-green-400',
  anthropic: 'text-orange-400',
  deepseek: 'text-blue-400',
  google: 'text-red-400',
  venice: 'text-purple-400',
  kimi: 'text-cyan-400',
};

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export default function Sidebar({ open, onClose, onOpenSettings }: SidebarProps) {
  const {
    conversations,
    activeConversationId,
    fetchConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    selectedModel,
  } = useChatStore();
  const { providers, fetchProviders } = useProviderStore();

  useEffect(() => {
    fetchConversations();
    fetchProviders();
  }, [fetchConversations, fetchProviders]);

  const handleNewChat = useCallback(async () => {
    await createConversation();
    onClose();
  }, [createConversation, onClose]);

  const handleSelectConversation = useCallback(
    async (id: string) => {
      await selectConversation(id);
      onClose();
    },
    [selectConversation, onClose]
  );

  const handleDeleteConversation = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteConversation(id);
    },
    [deleteConversation]
  );

  const activeConversations = conversations.filter((c) => c.id === activeConversationId);

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-72 bg-sidebar border-r border-sidebar-border flex flex-col',
          'md:relative md:z-auto md:translate-x-0',
          'sidebar-transition',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Bot className="w-5 h-5 text-emerald-400" />
            </div>
            <h1 className="text-lg font-bold tracking-tight">FreeLLM Hub</h1>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 pb-2">
          <Button
            onClick={handleNewChat}
            className="w-full justify-start gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>

        {/* Conversation List */}
        <ScrollArea className="flex-1 px-3 py-2">
          <div className="space-y-1">
            <AnimatePresence mode="popLayout">
              {conversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                const Icon = providerIcons[conv.modelId?.split('-')[0]?.toLowerCase() || 'zai'] || MessageSquare;
                const iconColor = providerColors[conv.modelId?.split('-')[0]?.toLowerCase() || 'zai'] || 'text-emerald-400';

                return (
                  <motion.div
                    key={conv.id}
                    layout
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -200 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectConversation(conv.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSelectConversation(conv.id); }}
                      className={cn(
                        'w-full text-left rounded-lg px-3 py-2.5 group relative transition-colors cursor-pointer',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'hover:bg-accent/50 text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', isActive ? iconColor : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm truncate block">
                              {conv.title || 'New Chat'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground truncate block">
                              {formatRelativeDate(conv.updatedAt)}
                            </span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity hover:bg-destructive/20 hover:text-destructive"
                          onClick={(e) => handleDeleteConversation(e, conv.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {conversations.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No conversations yet
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Bottom Section */}
        <div className="p-3 border-t border-sidebar-border">
          {/* Provider Status */}
          <div className="flex items-center gap-1.5 mb-3 px-1">
            <span className="text-xs text-muted-foreground mr-1">Providers:</span>
            {providers.slice(0, 7).map((p) => {
              const ProvIcon = providerIcons[p.type] || Bot;
              const pColor = providerColors[p.type] || 'text-muted-foreground';
              const isConnected = p.type === 'zai' || !!(p.oauthToken || p.apiKey);
              return (
                <div
                  key={p.id}
                  className={cn(
                    'w-5 h-5 rounded-full flex items-center justify-center',
                    isConnected ? 'bg-emerald-500/20' : 'bg-muted'
                  )}
                  title={`${p.name}: ${isConnected ? 'Connected' : 'Sign in'}`}
                >
                  <ProvIcon className={cn('w-3 h-3', isConnected ? pColor : 'text-muted-foreground')} />
                </div>
              );
            })}
          </div>

          {/* Current Model */}
          {selectedModel && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <Badge variant="outline" className="text-xs font-normal">
                <ProviderIcon
                  providerType={selectedModel.provider}
                  className="w-3 h-3 mr-1"
                />
                {selectedModel.name}
              </Badge>
            </div>
          )}

          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
            onClick={onOpenSettings}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>
        </div>
      </aside>
    </>
  );
}

function ProviderIcon({ providerType, className }: { providerType: string; className?: string }) {
  const Comp = providerIcons[providerType] || Bot;
  return <Comp className={className} />;
}

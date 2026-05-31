'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Sparkles,
  Brain,
  Zap,
  Globe,
  Shield,
  Moon,
  User,
  Copy,
  Check,
  Wrench,
  ChevronDown,
  ChevronUp,
  Square,
  Terminal,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatStore, type Message } from '@/store/chat-store';

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

const providerBgs: Record<string, string> = {
  zai: 'bg-emerald-500/10 border-emerald-500/20',
  openai: 'bg-green-500/10 border-green-500/20',
  anthropic: 'bg-orange-500/10 border-orange-500/20',
  deepseek: 'bg-blue-500/10 border-blue-500/20',
  google: 'bg-red-500/10 border-red-500/20',
  venice: 'bg-purple-500/10 border-purple-500/20',
  kimi: 'bg-cyan-500/10 border-cyan-500/20',
};

function CodeBlock({ language, children }: { language: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="rounded-lg overflow-hidden border border-border/50 my-2 group relative">
      {/* Code header */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-border/50">
        <span className="text-xs text-muted-foreground font-mono">{language || 'code'}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '0.8125rem',
          lineHeight: '1.6',
        }}
        showLineNumbers={children.split('\n').length > 3}
        lineNumberStyle={{ color: 'oklch(0.5 0 0)', minWidth: '2.5em' }}
      >
        {children.trim()}
      </SyntaxHighlighter>
    </div>
  );
}

function ToolCallMessage({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  let toolData: { name?: string; args?: string; result?: string } = {};
  try {
    toolData = typeof content === 'string' && content.startsWith('{')
      ? JSON.parse(content)
      : { name: 'Tool', args: content, result: '' };
  } catch {
    toolData = { name: 'Tool', args: content, result: '' };
  }

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-accent/30 transition-colors"
      >
        <Wrench className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium">{toolData.name || 'Tool Call'}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {expanded ? <ChevronUp className="w-3.5 h-3.5 inline" /> : <ChevronDown className="w-3.5 h-3.5 inline" />}
        </span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-2">
              {toolData.args && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Arguments:</div>
                  <pre className="text-xs bg-zinc-900/50 rounded p-2 overflow-x-auto font-mono">
                    {typeof toolData.args === 'string' ? toolData.args : JSON.stringify(toolData.args, null, 2)}
                  </pre>
                </div>
              )}
              {toolData.result && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Result:</div>
                  <pre className="text-xs bg-emerald-500/5 border border-emerald-500/10 rounded p-2 overflow-x-auto font-mono">
                    {toolData.result}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="flex gap-1">
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        <span className="typing-dot w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      </div>
    </div>
  );
}

function MessageBubble({ message, index }: { message: Message; index: number }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool';
  const isAssistant = message.role === 'assistant';

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="flex justify-center py-2"
      >
        <span className="text-xs text-muted-foreground bg-muted/50 px-3 py-1 rounded-full">
          {message.content}
        </span>
      </motion.div>
    );
  }

  if (isTool) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="flex justify-center py-1"
      >
        <div className="max-w-2xl w-full px-4">
          <ToolCallMessage content={message.content} />
        </div>
      </motion.div>
    );
  }

  const providerType = message.modelId?.split('-')[0]?.toLowerCase() || 'zai';
  const Icon = isUser ? User : (providerIcons[providerType] || Bot);
  const iconColor = isUser ? 'text-foreground' : (providerColors[providerType] || 'text-emerald-400');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
      className={cn(
        'flex gap-3 px-4 py-3',
        isUser && 'justify-end'
      )}
    >
      {/* Assistant avatar */}
      {!isUser && (
        <div className={cn(
          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          providerBgs[providerType] || 'bg-emerald-500/10 border border-emerald-500/20'
        )}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
      )}

      {/* Message content */}
      <div className={cn(
        'max-w-[75%] lg:max-w-[65%]',
        isUser && 'order-first'
      )}>
        {/* Provider badge for assistant */}
        {isAssistant && message.modelId && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn('text-xs font-medium', iconColor)}>
              {providerType === 'zai' ? 'Z.ai' : providerType.charAt(0).toUpperCase() + providerType.slice(1)}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{message.modelId}</span>
          </div>
        )}

        <div className={cn(
          'rounded-2xl px-4 py-2.5',
          isUser
            ? 'bg-emerald-600 text-white'
            : 'bg-card border border-border/50'
        )}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{message.content}</p>
          ) : (
            <div className="markdown-content text-sm text-foreground/90">
              {message.content ? (
                <>
                  <ReactMarkdown
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const isInline = !match && !String(children).includes('\n');

                        if (isInline) {
                          return (
                            <code
                              className={cn('bg-muted px-1.5 py-0.5 rounded text-xs font-mono', className)}
                              {...props}
                            >
                              {children}
                            </code>
                          );
                        }

                        return (
                          <CodeBlock language={match ? match[1] : ''}>
                            {String(children).replace(/\n$/, '')}
                          </CodeBlock>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                  {message.isStreaming && <span className="streaming-cursor" />}
                </>
              ) : message.isStreaming ? (
                <StreamingIndicator />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-zinc-700 flex items-center justify-center shrink-0 mt-0.5">
          <User className="w-4 h-4 text-zinc-300" />
        </div>
      )}
    </motion.div>
  );
}

export default function MessageList() {
  const { messages, isStreaming, stopStreaming, activeConversationId } = useChatStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, messages.length > 0 ? messages[messages.length - 1].content : '']);

  return (
    <div className="flex-1 overflow-y-auto" ref={scrollRef}>
      <div className="max-w-4xl mx-auto py-4">
        <AnimatePresence mode="popLayout">
          {messages.map((message, index) => (
            <MessageBubble key={message.id} message={message} index={index} />
          ))}
        </AnimatePresence>

        {/* Stop button during streaming */}
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center py-4"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={stopStreaming}
              className="gap-2 border-border/50 text-muted-foreground hover:text-foreground hover:border-foreground/20"
            >
              <Square className="w-3.5 h-3.5" />
              Stop generating
            </Button>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

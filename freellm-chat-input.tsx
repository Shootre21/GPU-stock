'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Square, Paperclip, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';

export default function ChatInput() {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage, isStreaming, selectedModel } = useChatStore();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const maxHeight = 200;
    textarea.style.height = Math.min(textarea.scrollHeight, maxHeight) + 'px';
  }, [input]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage(trimmed);
    setInput('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const isDisabled = isStreaming || !selectedModel;

  const placeholderText = !selectedModel
    ? 'Select a model to start chatting...'
    : isStreaming
      ? 'Generating response...'
      : 'Message FreeLLM Hub...';

  return (
    <div className="border-t border-border/50 bg-background/80 backdrop-blur-sm px-4 py-3">
      <div className="max-w-4xl mx-auto">
        <div className={cn(
          'relative flex items-end gap-2 rounded-2xl border border-border/50 bg-card px-4 py-3 transition-colors',
          'focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/20',
          isDisabled && 'opacity-60'
        )}>
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={isDisabled}
            className={cn(
              'flex-1 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed',
              'focus-visible:ring-0 focus-visible:ring-offset-0',
              'placeholder:text-muted-foreground/60',
              'min-h-[24px] max-h-[200px]'
            )}
            rows={1}
          />

          <div className="flex items-center gap-1 shrink-0 ml-2">
            {isStreaming ? (
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button
                  size="icon"
                  onClick={useChatStore.getState().stopStreaming}
                  className="h-8 w-8 rounded-lg bg-destructive/80 hover:bg-destructive text-white"
                >
                  <Square className="w-4 h-4" />
                </Button>
              </motion.div>
            ) : (
              <motion.div whileTap={{ scale: 0.9 }}>
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim() || isDisabled}
                  className={cn(
                    'h-8 w-8 rounded-lg',
                    input.trim() && selectedModel
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center mt-2">
          <span className="text-[11px] text-muted-foreground/50">
            FreeLLM Hub can make mistakes. Consider checking important information.
          </span>
        </div>
      </div>
    </div>
  );
}

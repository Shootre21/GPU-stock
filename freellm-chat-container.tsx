'use client';

import { motion } from 'framer-motion';
import {
  Bot,
  Sparkles,
  Brain,
  Zap,
  Globe,
  Shield,
  Moon,
  MessageSquare,
  Code,
  Lightbulb,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/store/chat-store';
import ModelSelector from './model-selector';
import MessageList from './message-list';
import ChatInput from './chat-input';

const suggestionCards = [
  {
    icon: Sparkles,
    title: 'Ask GPT-4o Mini',
    prompt: 'Explain quantum computing in simple terms',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    provider: 'openai',
    modelId: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
  },
  {
    icon: Brain,
    title: 'Chat with Claude',
    prompt: 'Write a creative short story about AI and humanity',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    provider: 'anthropic',
    modelId: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
  },
  {
    icon: Zap,
    title: 'Try DeepSeek',
    prompt: 'Help me write a Python function to sort a list',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
    provider: 'deepseek',
    modelId: 'deepseek-chat',
    name: 'DeepSeek Chat',
  },
  {
    icon: Globe,
    title: 'Ask Google Gemini',
    prompt: 'What are the latest trends in machine learning?',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    provider: 'google',
    modelId: 'gemini-pro',
    name: 'Gemini Pro',
  },
  {
    icon: Shield,
    title: 'Chat with Venice',
    prompt: 'Explain blockchain technology and its applications',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    provider: 'venice',
    modelId: 'venice-llama',
    name: 'Venice LLaMA',
  },
  {
    icon: Moon,
    title: 'Ask Kimi',
    prompt: 'Translate the following text to Japanese and explain the cultural nuances',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    provider: 'kimi',
    modelId: 'moonshot-v1-8k',
    name: 'Moonshot v1',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

function WelcomeScreen() {
  const { sendMessage, setSelectedModel, createConversation } = useChatStore();

  const handleSuggestionClick = async (card: typeof suggestionCards[0]) => {
    setSelectedModel({
      provider: card.provider,
      modelId: card.modelId,
      name: card.name,
    });
    // Small delay to let model selection update
    setTimeout(() => {
      sendMessage(card.prompt);
    }, 100);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6"
          >
            <Bot className="w-8 h-8 text-emerald-400" />
          </motion.div>

          <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight">
            FreeLLM Hub
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Your Private Multi-LLM Chat
          </p>
          <p className="text-sm text-muted-foreground/60 mt-2">
            Chat with GPT, Claude, DeepSeek, Gemini, and more — all in one place.
          </p>
        </motion.div>

        {/* Quick Start Suggestions */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        >
          {suggestionCards.map((card) => {
            const Icon = card.icon;
            return (
              <motion.button
                key={card.provider}
                variants={itemVariants}
                onClick={() => handleSuggestionClick(card)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                  'hover:scale-[1.02] hover:shadow-lg hover:shadow-black/10',
                  'active:scale-[0.98]',
                  card.bg,
                  card.border
                )}
              >
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', card.bg, `border ${card.border}`)}>
                  <Icon className={cn('w-4.5 h-4.5', card.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-0.5">{card.title}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{card.prompt}</div>
                </div>
              </motion.button>
            );
          })}
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
          className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted-foreground/50"
        >
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Multi-model conversations
          </div>
          <div className="flex items-center gap-1.5">
            <Code className="w-3.5 h-3.5" />
            Code highlighting
          </div>
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            Tool calling support
          </div>
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" />
            Markdown rendering
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function ChatContainer() {
  const { messages, activeConversationId } = useChatStore();
  const showWelcome = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <ModelSelector />
      </div>

      {/* Chat Area */}
      {showWelcome ? (
        <WelcomeScreen />
      ) : (
        <MessageList />
      )}

      {/* Input */}
      <ChatInput />
    </div>
  );
}

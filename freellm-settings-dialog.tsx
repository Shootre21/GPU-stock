'use client';

import { useCallback, useState, useEffect } from 'react';
import {
  Bot,
  Sparkles,
  Brain,
  Zap,
  Globe,
  Shield,
  Moon,
  Wrench,
  GraduationCap,
  Settings2,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useProviderStore, type ProviderConfig } from '@/store/provider-store';
import ProviderCard from './provider-card';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const { providers, fetchProviders, fetchModels } = useProviderStore();

  useEffect(() => {
    if (open) {
      fetchProviders();
      fetchModels();
    }
  }, [open, fetchProviders, fetchModels]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:w-[520px] p-0 bg-background border-border/50">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-400" />
            Settings
          </SheetTitle>
        </SheetHeader>

        <Tabs defaultValue="providers" className="px-6 pb-6">
          <TabsList className="w-full bg-muted/50 mb-4">
            <TabsTrigger value="providers" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <Wrench className="w-3.5 h-3.5" />
              Providers
            </TabsTrigger>
            <TabsTrigger value="tools" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <Wrench className="w-3.5 h-3.5" />
              Tools
            </TabsTrigger>
            <TabsTrigger value="skills" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <GraduationCap className="w-3.5 h-3.5" />
              Skills
            </TabsTrigger>
            <TabsTrigger value="general" className="flex-1 gap-1.5 text-xs sm:text-sm">
              <Settings2 className="w-3.5 h-3.5" />
              General
            </TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="mt-0">
            <ScrollArea className="max-h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-3">
                <p className="text-xs text-muted-foreground mb-1 leading-relaxed">
                  Use the browser helper to sign in to each provider, then paste the API key or token into the popup. Tokens are stored locally in this app after you confirm them.
                </p>
                {providers.map((provider) => (
                  <ProviderCard key={provider.id} provider={provider} />
                ))}

                {providers.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    <Wrench className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Loading providers...
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="tools" className="mt-0">
            <div className="py-8 text-center text-muted-foreground text-sm">
              <Wrench className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium mb-1">Tools</p>
              <p className="text-xs">
                Tool management coming soon. Tools like web search, code execution, and file reading will be configurable here.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="skills" className="mt-0">
            <div className="py-8 text-center text-muted-foreground text-sm">
              <GraduationCap className="w-8 h-8 mx-auto mb-3 opacity-40" />
              <p className="font-medium mb-1">Skills</p>
              <p className="text-xs">
                Skill management coming soon. Define custom skills with system prompts and associated tools.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="general" className="mt-0">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">About FreeLLM Hub</h3>
                <div className="bg-muted/30 rounded-lg p-4 border border-border/30">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    FreeLLM Hub is your private multi-LLM chat interface. Use the browser helper to open each provider's sign-in or API-key page, then paste the resulting API key or token into the popup. Z.ai models are built-in and available without any sign-in.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Keyboard Shortcuts</h3>
                <div className="bg-muted/30 rounded-lg p-4 border border-border/30 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Send message</span>
                    <kbd className="bg-muted px-2 py-0.5 rounded text-xs font-mono">Enter</kbd>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">New line</span>
                    <kbd className="bg-muted px-2 py-0.5 rounded text-xs font-mono">Shift + Enter</kbd>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Stop generating</span>
                    <span className="text-xs text-muted-foreground">Click stop button</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-3">Data & Privacy</h3>
                <div className="bg-muted/30 rounded-lg p-4 border border-border/30">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    All conversations and auth tokens are stored locally on this device. Provider credentials are pasted into the helper popup and then saved locally by this app. They are only sent to the configured AI providers for chat requests.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

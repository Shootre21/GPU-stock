'use client';

import { useEffect, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Sidebar from '@/components/chat/sidebar';
import ChatContainer from '@/components/chat/chat-container';
import SettingsDialog from '@/components/settings/settings-dialog';

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-border/50 bg-background/80 backdrop-blur-sm">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <span className="font-semibold text-sm">FreeLLM Hub</span>
        </div>

        {/* Chat Container */}
        <div className="flex-1 overflow-hidden">
          <ChatContainer />
        </div>
      </div>

      {/* Settings Dialog */}
      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

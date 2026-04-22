'use client';

import AppNavigation from '@/components/AppNavigation';
import ModelHealthBanner from '@/components/ModelHealthBanner';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '@/components/ThemeProvider';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const { resolved } = useTheme();

  return (
    <div className="flex min-h-screen">
      <AppNavigation collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 p-5 overflow-auto scrollbar-thin">
        <ModelHealthBanner />
        {children}
      </main>
      <Toaster
        theme={resolved}
        position="bottom-right"
        richColors
        closeButton
      />
    </div>
  );
}

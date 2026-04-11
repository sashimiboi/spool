'use client';

import AppNavigation from '@/components/AppNavigation';
import { useState } from 'react';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <AppNavigation collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 p-6">{children}</main>
    </div>
  );
}

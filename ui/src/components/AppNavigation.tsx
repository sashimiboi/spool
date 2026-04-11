'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, List, Search, BarChart3, Link2,
  ChevronLeft, ChevronRight, MessageCircle, Settings,
} from 'lucide-react';

interface NavItem {
  url: string;
  label: string;
  icon: React.ElementType;
  match: (p: string) => boolean;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { url: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dashboard' || p === '/' },
      { url: '/sessions', label: 'Sessions', icon: List, match: (p) => p.startsWith('/sessions') },
      { url: '/search', label: 'Search', icon: Search, match: (p) => p.startsWith('/search') },
    ],
  },
  {
    title: 'Insights',
    items: [
      { url: '/analytics', label: 'Analytics', icon: BarChart3, match: (p) => p.startsWith('/analytics') },
      { url: '/chat', label: 'Chat', icon: MessageCircle, match: (p) => p.startsWith('/chat') },
    ],
  },
  {
    title: 'Settings',
    items: [
      { url: '/connections', label: 'Connections', icon: Link2, match: (p) => p.startsWith('/connections') },
      { url: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') },
    ],
  },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppNavigation({ collapsed, onToggle }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav
      className="sticky top-0 h-screen flex flex-col bg-white border-r border-border shrink-0 transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 56 : 220 }}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-2.5 p-4', collapsed && 'justify-center px-3')}>
        {!collapsed && (
          <span className="text-[17px] font-bold text-foreground tracking-tight flex-1 whitespace-nowrap">
            Spool
          </span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Sections */}
      <div className={cn('flex-1 flex flex-col overflow-auto', collapsed ? 'px-1' : 'px-2')}>
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.title} className={sIdx > 0 ? 'mt-3' : ''}>
            {!collapsed && (
              <div className="px-3 pt-1.5 pb-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                {section.title}
              </div>
            )}
            {collapsed && sIdx > 0 && <div className="mx-2 my-1 border-t border-border" />}
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <button
                    key={item.url}
                    onClick={() => router.push(item.url)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'w-full flex items-center gap-2.5 rounded-lg text-[13px] transition-colors',
                      collapsed ? 'justify-center p-2.5' : 'px-3 py-2',
                      active
                        ? 'bg-muted text-foreground font-semibold'
                        : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={cn('border-t border-border', collapsed ? 'p-2' : 'px-4 py-3')}>
        {!collapsed && (
          <span className="text-[11px] text-muted-foreground">spooling.ai v0.1.0</span>
        )}
      </div>
    </nav>
  );
}

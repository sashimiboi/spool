'use client';

import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import {
  LayoutDashboard, List, Search, BarChart3, Link2,
  ChevronLeft, ChevronRight, MessageCircle, Settings,
  Sun, Moon, Monitor,
} from 'lucide-react';

function SpoolLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 147 147" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M87.4235 69.6C87.4235 61.6 79.4235 55.6 71.4235 57.6C61.4235 59.6 57.4235 69.6 61.4235 77.6C67.4235 89.6 88.4235 94.1 98.4235 86.1C116.424 75.1 108.251 47.6 98.4235 40.1C79.4235 25.6 53.4235 33.6 43.4235 47.6C31.4235 63.6 33.4235 93.6 51.4235 105.6C71.4235 119.6 105.424 115.6 119.424 95.6C133.424 73.6 131.424 37.6 109.424 21.6C87.4235 5.6 45.4235 9.6 27.4235 33.6C9.42353 59.6 9.92354 99.1 35.9235 119.1C51.4235 129.1 73.4235 131.1 81.4235 131.1" stroke="currentColor" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M99.9235 126.6H93.9235C93.0951 126.6 92.4235 127.272 92.4235 128.1V134.1C92.4235 134.928 93.0951 135.6 93.9235 135.6H99.9235C100.752 135.6 101.424 134.928 101.424 134.1V128.1C101.424 127.272 100.752 126.6 99.9235 126.6Z" fill="currentColor"/>
      <path d="M114.924 126.6H108.924C108.095 126.6 107.424 127.272 107.424 128.1V134.1C107.424 134.928 108.095 135.6 108.924 135.6H114.924C115.752 135.6 116.424 134.928 116.424 134.1V128.1C116.424 127.272 115.752 126.6 114.924 126.6Z" fill="currentColor"/>
      <path d="M129.924 126.6H123.924C123.095 126.6 122.424 127.272 122.424 128.1V134.1C122.424 134.928 123.095 135.6 123.924 135.6H129.924C130.752 135.6 131.424 134.928 131.424 134.1V128.1C131.424 127.272 130.752 126.6 129.924 126.6Z" fill="currentColor"/>
    </svg>
  );
}

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
  const { theme, setTheme, resolved } = useTheme();

  const cycleTheme = () => {
    const order: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];
    const idx = order.indexOf(theme);
    setTheme(order[(idx + 1) % order.length]);
  };

  const ThemeIcon = theme === 'system' ? Monitor : theme === 'dark' ? Moon : Sun;

  return (
    <nav
      className="sticky top-0 h-screen flex flex-col bg-sidebar border-r border-border shrink-0 transition-all duration-200 overflow-hidden"
      style={{ width: collapsed ? 52 : 208 }}
    >
      {/* Header */}
      <div className={cn('flex items-center h-12', collapsed ? 'justify-center px-2' : 'px-3')}>
        {!collapsed ? (
          <div className="flex items-center gap-2 flex-1 pl-1">
            <SpoolLogo className="h-5 w-5 text-foreground" />
            <span className="text-[13px] font-semibold text-foreground tracking-tight">
              Spool
            </span>
          </div>
        ) : (
          <SpoolLogo className="h-5 w-5 text-foreground" />
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded text-sidebar-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Sections */}
      <div className={cn('flex-1 flex flex-col overflow-auto scrollbar-thin', collapsed ? 'px-1.5' : 'px-2')}>
        {NAV_SECTIONS.map((section, sIdx) => (
          <div key={section.title} className={sIdx > 0 ? 'mt-4' : ''}>
            {!collapsed && (
              <div className="px-2 pb-1 text-[11px] font-medium text-sidebar-foreground uppercase tracking-wider">
                {section.title}
              </div>
            )}
            {collapsed && sIdx > 0 && <div className="mx-2 my-2 border-t border-border" />}
            <div className="flex flex-col gap-px">
              {section.items.map((item) => {
                const active = item.match(pathname);
                const Icon = item.icon;
                return (
                  <button
                    key={item.url}
                    onClick={() => router.push(item.url)}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-md text-[13px] transition-colors',
                      collapsed ? 'justify-center p-2' : 'px-2 py-1.5',
                      active
                        ? 'bg-accent text-sidebar-active font-medium'
                        : 'text-sidebar-foreground hover:bg-accent/60 hover:text-foreground'
                    )}
                  >
                    <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-primary' : '')} />
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className={cn('border-t border-border', collapsed ? 'p-1.5' : 'px-3 py-2')}>
        <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between')}>
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme}`}
            className="p-1.5 rounded text-sidebar-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <ThemeIcon className="h-3.5 w-3.5" />
          </button>
          {!collapsed && (
            <span className="text-[11px] text-sidebar-foreground">v0.1.0</span>
          )}
        </div>
      </div>
    </nav>
  );
}

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Copy, Check, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule, type ColDef } from 'ag-grid-community';
import { useTheme } from '@/components/ThemeProvider';
import { getGridTheme } from '@/lib/agGridTheme';
import { fetchApi, formatCost, formatDate, cleanProject } from '@/lib/api';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Session {
  id: string;
  provider_id: string;
  project: string;
  title: string;
  started_at: string;
  message_count: number;
  tool_call_count: number;
  estimated_cost_usd: number;
  git_branch: string;
  cwd: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex CLI',
  'copilot': 'Copilot',
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
  'kiro': 'Kiro',
  'antigravity': 'Antigravity',
};

interface SessionDetail {
  session: Session & { estimated_input_tokens: number; estimated_output_tokens: number };
  messages: Array<{ role: string; content: string; timestamp: string; tools_used: string; estimated_tokens: number }>;
  tool_summary: Array<{ tool_name: string; uses: number }>;
}

type DateRange = 'all' | '24h' | '7d' | '30d';

const DATE_RANGES: Array<{ key: DateRange; label: string; ms: number | null }> = [
  { key: 'all', label: 'All time', ms: null },
  { key: '24h', label: '24h', ms: 24 * 60 * 60 * 1000 },
  { key: '7d', label: '7 days', ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30d', label: '30 days', ms: 30 * 24 * 60 * 60 * 1000 },
];

export default function SessionsPage() {
  const { resolved } = useTheme();
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [copied, setCopied] = useState(false);

  const [search, setSearch] = useState('');
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>('all');

  const copyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const fetchSessions = useCallback(async () => {
    try {
      setSessions(await fetchApi('/api/sessions?limit=100'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const openSession = useCallback(async (id: string) => {
    try { setSelected(await fetchApi(`/api/session/${id}`)); }
    catch (e) { console.error(e); }
  }, []);

  const gridTheme = useMemo(() => getGridTheme(resolved), [resolved]);

  const availableProviders = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => s.provider_id && set.add(s.provider_id));
    return Array.from(set);
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cutoff = DATE_RANGES.find(r => r.key === dateRange)?.ms;
    const since = cutoff ? Date.now() - cutoff : null;
    return sessions.filter(s => {
      if (providerFilter && s.provider_id !== providerFilter) return false;
      if (since && s.started_at && new Date(s.started_at).getTime() < since) return false;
      if (q) {
        const hay = `${s.title || ''} ${s.project || ''} ${s.git_branch || ''} ${s.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sessions, search, providerFilter, dateRange]);

  const hasActiveFilters = search !== '' || providerFilter !== null || dateRange !== 'all';
  const clearFilters = () => { setSearch(''); setProviderFilter(null); setDateRange('all'); };

  const columnDefs = useMemo<ColDef<Session>[]>(() => [
    {
      field: 'title',
      headerName: 'Session',
      sortable: true,
      filter: 'agTextColumnFilter',
      flex: 2,
      minWidth: 240,
      valueFormatter: (p) => (p.value || 'Untitled').slice(0, 80),
      tooltipValueGetter: (p) => p.value || 'Untitled',
    },
    {
      field: 'provider_id',
      headerName: 'Provider',
      sortable: true,
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 110,
      valueFormatter: (p) => PROVIDER_LABELS[p.value as string] || p.value,
    },
    {
      field: 'project',
      headerName: 'Project',
      sortable: true,
      filter: 'agTextColumnFilter',
      flex: 1.3,
      minWidth: 140,
      valueFormatter: (p) => cleanProject(p.value || ''),
    },
    {
      field: 'git_branch',
      headerName: 'Branch',
      sortable: true,
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 110,
      valueFormatter: (p) => p.value || '—',
    },
    {
      field: 'started_at',
      headerName: 'Started',
      sortable: true,
      filter: 'agDateColumnFilter',
      flex: 1,
      minWidth: 130,
      sort: 'desc',
      valueFormatter: (p) => p.value ? formatDate(p.value) : '',
      filterValueGetter: (p) => p.data?.started_at ? new Date(p.data.started_at) : null,
    },
    {
      field: 'message_count',
      headerName: 'Msgs',
      sortable: true,
      filter: 'agNumberColumnFilter',
      type: 'rightAligned',
      flex: 0.6,
      minWidth: 80,
    },
    {
      field: 'tool_call_count',
      headerName: 'Tools',
      sortable: true,
      filter: 'agNumberColumnFilter',
      type: 'rightAligned',
      flex: 0.6,
      minWidth: 80,
    },
    {
      field: 'estimated_cost_usd',
      headerName: 'Cost',
      sortable: true,
      filter: 'agNumberColumnFilter',
      type: 'rightAligned',
      flex: 0.7,
      minWidth: 90,
      valueFormatter: (p) => formatCost(p.value || 0),
    },
  ], []);

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
    </div>;
  }

  if (selected) {
    const sess = selected.session;
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>

        <div>
          <h1 className="text-base font-semibold truncate">{(sess.title || 'Session').slice(0, 80)}</h1>
          <button
            onClick={() => copyId(sess.id)}
            className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground font-mono bg-secondary px-1.5 py-0.5 rounded hover:bg-accent transition-colors"
            title="Copy session ID"
          >
            {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            {sess.id}
          </button>
        </div>

        <div className="flex flex-wrap gap-5 text-[13px] py-3 px-4 rounded-lg bg-card border">
          {[
            ['Project', cleanProject(sess.project || '')],
            ['Branch', sess.git_branch || 'n/a'],
            ['Started', formatDate(sess.started_at)],
            ['Messages', sess.message_count],
            ['Tools', sess.tool_call_count],
            ['Cost', formatCost(sess.estimated_cost_usd || 0)],
          ].map(([label, val]) => (
            <div key={label as string}>
              <div className="text-[11px] text-muted-foreground mb-0.5">{label}</div>
              <div className="font-medium">{val}</div>
            </div>
          ))}
        </div>

        {selected.tool_summary.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.tool_summary.map(t => (
              <Badge key={t.tool_name} variant="secondary">{t.tool_name}: {t.uses}</Badge>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Conversation ({selected.messages.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {selected.messages.slice(0, 50).map((m, i) => (
              <div key={i} className={`p-3 rounded-md border-l-2 ${
                m.role === 'user'
                  ? 'bg-primary/5 border-l-primary'
                  : 'bg-secondary/50 border-l-border'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-semibold uppercase tracking-wider ${m.role === 'user' ? 'text-primary' : 'text-muted-foreground'}`}>
                    {m.role}
                  </span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : ''}
                  </span>
                </div>
                <div className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap max-h-[200px] overflow-auto scrollbar-thin">
                  {(m.content || '').slice(0, 500)}
                  {(m.content || '').length > 500 && <span className="text-muted-foreground"> ...truncated</span>}
                </div>
              </div>
            ))}
            {selected.messages.length > 50 && (
              <p className="text-[11px] text-muted-foreground text-center pt-2">
                Showing first 50 of {selected.messages.length} messages
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Sessions</h1>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {filteredSessions.length} of {sessions.length}
        </span>
      </div>

      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <div
            className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center"
            style={{ zIndex: 10 }}
          >
            <Search size={16} strokeWidth={2.25} style={{ color: 'hsl(var(--muted-foreground))' }} />
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, project, branch, id..."
            className="pl-9 h-9 text-[13px]"
          />
        </div>

        {availableProviders.length > 1 && (
          <div className="flex items-center rounded-md border bg-card p-0.5 text-[12px]">
            <button
              onClick={() => setProviderFilter(null)}
              className={cn(
                'px-2.5 py-1 rounded transition-colors',
                providerFilter === null
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              All
            </button>
            {availableProviders.map(p => (
              <button
                key={p}
                onClick={() => setProviderFilter(providerFilter === p ? null : p)}
                className={cn(
                  'px-2.5 py-1 rounded transition-colors',
                  providerFilter === p
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {PROVIDER_LABELS[p] || p}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center rounded-md border bg-card p-0.5 text-[12px]">
          {DATE_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setDateRange(r.key)}
              className={cn(
                'px-2.5 py-1 rounded transition-colors',
                dateRange === r.key
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-[12px] text-muted-foreground">
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div style={{ height: 'calc(100vh - 220px)', minHeight: 480, width: '100%' }}>
        <AgGridReact<Session>
          theme={gridTheme}
          columnDefs={columnDefs}
          rowData={filteredSessions}
          headerHeight={36}
          rowHeight={34}
          suppressMovableColumns
          defaultColDef={{
            flex: 1,
            minWidth: 80,
            resizable: true,
            suppressHeaderMenuButton: true,
            suppressHeaderFilterButton: false,
          }}
          onRowClicked={(e) => e.data && openSession(e.data.id)}
          rowClass="cursor-pointer"
          overlayNoRowsTemplate='<span style="color: hsl(var(--muted-foreground))">No sessions match your filters.</span>'
        />
      </div>
    </div>
  );
}

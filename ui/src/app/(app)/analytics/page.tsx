'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgCharts } from 'ag-charts-react';
import { ModuleRegistry as ChartsModuleRegistry, AllCommunityModule as ChartsAllCommunityModule } from 'ag-charts-community';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry as GridModuleRegistry, AllCommunityModule as GridAllCommunityModule, type ColDef } from 'ag-grid-community';
import { useTheme } from '@/components/ThemeProvider';
import { fetchApi, formatNumber, formatCost, cleanProject } from '@/lib/api';

ChartsModuleRegistry.registerModules([ChartsAllCommunityModule]);
GridModuleRegistry.registerModules([GridAllCommunityModule]);

interface DailyStats {
  day: string; sessions: number; messages: number;
  tool_calls: number; total_tokens: number; cost: number;
}
interface Overview {
  summary: Record<string, number>;
  projects: Array<{ project: string; sessions: number; messages: number; cost: number }>;
  top_tools: Array<{ tool_name: string; uses: number }>;
}
interface ToolInfo {
  tool_name: string; uses: number; sessions: number;
}
interface ProviderStats {
  provider_id: string;
  sessions: number;
  messages: number;
  tool_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  first_session: string;
  last_session: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  'codex': 'Codex CLI',
  'copilot': 'Copilot',
  'cursor': 'Cursor',
  'windsurf': 'Windsurf',
};

const PROVIDER_COLORS: Record<string, string> = {
  'claude-code': '#d97706',
  'codex': '#10b981',
  'copilot': '#6366f1',
  'cursor': '#06b6d4',
  'windsurf': '#ec4899',
};

export default function AnalyticsPage() {
  const { resolved } = useTheme();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [providers, setProviders] = useState<ProviderStats[]>([]);
  const [days, setDays] = useState(30);
  const [providerFilter, setProviderFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const provParam = providerFilter !== 'all' ? `&provider=${providerFilter}` : '';
      const provQ = providerFilter !== 'all' ? `?provider=${providerFilter}` : '';
      const [ov, dl, tl] = await Promise.all([
        fetchApi(`/api/overview${provQ}`),
        fetchApi(`/api/daily?days=${days}${provParam}`),
        fetchApi(`/api/tools?limit=20${provParam}`),
      ]);
      setOverview(ov); setDaily(dl); setTools(tl);
      try { setProviders(await fetchApi('/api/stats/providers')); } catch {}
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [days, providerFilter]);

  useEffect(() => { load(); }, [load]);

  const isDark = resolved === 'dark';
  const gridTheme = isDark ? 'ag-theme-alpine-dark' : 'ag-theme-alpine';
  const textColor = isDark ? '#6b6b80' : '#8b8b9e';
  const gridColor = isDark ? '#2a2a3c' : '#f0f0f2';
  const primaryFill = isDark ? '#8b7cf6' : '#7c5cfc';
  const mutedFill = isDark ? '#3f3f50' : '#d4d4d8';

  // --- ag-grid: Daily Breakdown ---
  const dailyColDefs = useMemo<ColDef[]>(() => [
    {
      field: 'day', headerName: 'Date', sortable: true, filter: true,
      valueFormatter: (p: any) => p.value ? new Date(p.value).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '',
      flex: 1.5, minWidth: 140,
    },
    { field: 'sessions', headerName: 'Sessions', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 90 },
    { field: 'messages', headerName: 'Messages', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 90 },
    { field: 'tool_calls', headerName: 'Tools', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 80 },
    {
      field: 'total_tokens', headerName: 'Tokens', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 100,
      valueFormatter: (p: any) => formatNumber(p.value || 0),
    },
    {
      field: 'cost', headerName: 'Cost', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 80,
      valueFormatter: (p: any) => formatCost(p.value || 0),
    },
  ], []);

  // --- ag-grid: Provider Breakdown ---
  const providerColDefs = useMemo<ColDef[]>(() => {
    const totalSessions = providers.reduce((sum, p) => sum + p.sessions, 0);
    return [
      {
        field: 'provider_id', headerName: 'Provider', sortable: true, filter: true, flex: 1.5, minWidth: 140,
        valueFormatter: (p: any) => PROVIDER_LABELS[p.value] || p.value,
        cellRenderer: (p: any) => {
          const color = PROVIDER_COLORS[p.value] || '#8b8b9e';
          const label = PROVIDER_LABELS[p.value] || p.value;
          return `<div style="display:flex;align-items:center;gap:6px"><div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>${label}</div>`;
        },
      },
      { field: 'sessions', headerName: 'Sessions', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 90 },
      {
        field: 'messages', headerName: 'Messages', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 100,
        valueFormatter: (p: any) => formatNumber(p.value || 0),
      },
      {
        headerName: 'Tokens', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 100,
        valueGetter: (p: any) => (p.data?.input_tokens || 0) + (p.data?.output_tokens || 0),
        valueFormatter: (p: any) => formatNumber(p.value || 0),
      },
      {
        field: 'cost', headerName: 'Cost', sortable: true, filter: 'agNumberColumnFilter', type: 'rightAligned', flex: 1, minWidth: 80,
        valueFormatter: (p: any) => formatCost(p.value || 0),
      },
      {
        headerName: 'Share', sortable: true, type: 'rightAligned', flex: 1, minWidth: 80,
        valueGetter: (p: any) => totalSessions > 0 ? (p.data?.sessions / totalSessions) * 100 : 0,
        valueFormatter: (p: any) => `${(p.value || 0).toFixed(1)}%`,
      },
    ];
  }, [providers]);

  const providerRowData = useMemo(() => providers, [providers]);

  if (loading || !overview) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" /></div>;
  }

  const s = overview.summary;

  const baseOpts = { background: { fill: 'transparent' }, padding: { top: 8, right: 10, bottom: 0, left: 0 } };

  const activityChart: any = {
    data: daily.map(d => ({
      day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      messages: d.messages, toolCalls: d.tool_calls,
    })),
    series: [
      { type: 'bar', xKey: 'day', yKey: 'messages', yName: 'Messages', fill: primaryFill, cornerRadius: 3 },
      { type: 'bar', xKey: 'day', yKey: 'toolCalls', yName: 'Tool Calls', fill: mutedFill, cornerRadius: 3 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 10, color: textColor }, gridLine: { style: [{ stroke: gridColor }] } },
    ],
    legend: { position: 'bottom', item: { label: { fontSize: 10, color: textColor } } },
    ...baseOpts,
  };

  const costChart: any = {
    data: daily.map(d => ({
      day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      cost: Number((d.cost || 0).toFixed(2)),
    })),
    series: [
      { type: 'area', xKey: 'day', yKey: 'cost', yName: 'Cost ($)', fill: '#10b981', fillOpacity: 0.12, stroke: '#10b981', strokeWidth: 2 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 10, color: textColor, formatter: (p: any) => `$${p.value}` }, gridLine: { style: [{ stroke: gridColor }] } },
    ],
    legend: { enabled: false }, ...baseOpts,
  };

  const tokenChart: any = {
    data: daily.map(d => ({
      day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      tokens: d.total_tokens,
    })),
    series: [
      { type: 'area', xKey: 'day', yKey: 'tokens', yName: 'Tokens', fill: primaryFill, fillOpacity: 0.1, stroke: primaryFill, strokeWidth: 2 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 10, color: textColor }, gridLine: { style: [{ stroke: gridColor }] } },
    ],
    legend: { enabled: false }, ...baseOpts,
  };

  const projectChart: any = {
    data: overview.projects.slice(0, 8).map(p => ({
      project: cleanProject(p.project), messages: p.messages,
    })),
    series: [
      { type: 'bar', xKey: 'project', yKey: 'messages', yName: 'Messages', fill: primaryFill, cornerRadius: 3 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: -30 } },
      { type: 'number', position: 'left', label: { fontSize: 10, color: textColor }, gridLine: { style: [{ stroke: gridColor }] } },
    ],
    legend: { enabled: false }, ...baseOpts,
  };

  const toolChartData = tools.slice(0, 10).map(t => ({ tool: t.tool_name, uses: t.uses }));

  const toolPieChart: any = {
    data: toolChartData,
    series: [{
      type: 'pie', angleKey: 'uses', legendItemKey: 'tool', innerRadiusRatio: 0.5,
      fills: [primaryFill, '#6b6b80', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1', '#84cc16', '#14b8a6'],
      strokeWidth: 0,
    }],
    legend: { position: 'right', item: { label: { fontSize: 10, color: textColor } } }, ...baseOpts,
  };

  const toolBarChart: any = {
    data: toolChartData,
    series: [
      { type: 'bar', direction: 'horizontal', xKey: 'tool', yKey: 'uses', yName: 'Uses', fill: primaryFill, cornerRadius: 3 },
    ],
    axes: [
      { type: 'category', position: 'left', label: { fontSize: 10, color: textColor } },
      { type: 'number', position: 'bottom', label: { fontSize: 10, color: textColor }, gridLine: { style: [{ stroke: gridColor }] } },
    ],
    legend: { enabled: false }, ...baseOpts,
  };

  const providerPieChart: any = providers.length > 1 ? {
    data: providers.map(p => ({
      provider: PROVIDER_LABELS[p.provider_id] || p.provider_id,
      sessions: p.sessions,
    })),
    series: [{
      type: 'pie', angleKey: 'sessions', legendItemKey: 'provider', innerRadiusRatio: 0.55,
      fills: providers.map(p => PROVIDER_COLORS[p.provider_id] || '#8b8b9e'),
      strokeWidth: 0,
    }],
    legend: { position: 'bottom', item: { label: { fontSize: 11, color: textColor } } },
    ...baseOpts,
  } : null;

  const activeLabel = providerFilter === 'all' ? 'All Providers' : (PROVIDER_LABELS[providerFilter] || providerFilter);
  const dailyGridHeight = Math.min(daily.length, 15) * 34 + 46;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <div className="flex items-center gap-2">
          {providers.length > 1 && (
            <Tabs value={providerFilter} onValueChange={(v) => { setProviderFilter(v); setLoading(true); }}>
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                {providers.map((p) => (
                  <TabsTrigger key={p.provider_id} value={p.provider_id}>
                    {PROVIDER_LABELS[p.provider_id] || p.provider_id}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          <Tabs value={String(days)} onValueChange={(v) => { setDays(Number(v)); setLoading(true); }}>
            <TabsList>
              <TabsTrigger value="7">7d</TabsTrigger>
              <TabsTrigger value="14">14d</TabsTrigger>
              <TabsTrigger value="30">30d</TabsTrigger>
              <TabsTrigger value="90">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Sessions', value: formatNumber(s.total_sessions || 0) },
          { label: 'Messages', value: formatNumber(s.total_messages || 0) },
          { label: 'Tokens', value: formatNumber((s.total_input_tokens || 0) + (s.total_output_tokens || 0)) },
          { label: 'Cost', value: formatCost(s.total_cost_usd || 0) },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="pt-3 pb-3 px-3">
              <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{c.label}</div>
              <div className="text-xl font-semibold mt-0.5">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Provider Breakdown */}
      {providers.length > 1 && providerPieChart && (
        <div className="grid md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Sessions by Provider</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[240px] w-full overflow-hidden">
                <AgCharts options={{ ...providerPieChart, width: undefined, height: 240 }} />
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Provider Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={gridTheme} style={{ height: providers.length * 34 + 46, width: '100%' }}>
                <AgGridReact
                  columnDefs={providerColDefs}
                  rowData={providerRowData}
                  domLayout="normal"
                  headerHeight={36}
                  rowHeight={34}
                  suppressMovableColumns
                  defaultColDef={{ flex: 1, minWidth: 80, resizable: true }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Messages & Tool Calls</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px] w-full overflow-hidden">
              <AgCharts options={{ ...activityChart, width: undefined, height: 260 }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Estimated Cost</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px] w-full overflow-hidden">
              <AgCharts options={{ ...costChart, width: undefined, height: 260 }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Token Usage</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px] w-full overflow-hidden">
              <AgCharts options={{ ...tokenChart, width: undefined, height: 260 }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Messages by Project</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[260px] w-full overflow-hidden">
              <AgCharts options={{ ...projectChart, width: undefined, height: 260 }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Tool Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px] w-full overflow-hidden">
              <AgCharts options={{ ...toolPieChart, width: undefined, height: 280 }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Tool Usage (Top 10)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px] w-full overflow-hidden">
              <AgCharts options={{ ...toolBarChart, width: undefined, height: 280 }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Breakdown - ag-grid */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Daily Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className={gridTheme} style={{ height: dailyGridHeight, width: '100%' }}>
            <AgGridReact
              columnDefs={dailyColDefs}
              rowData={daily}
              domLayout="normal"
              headerHeight={36}
              rowHeight={34}
              pagination={daily.length > 15}
              paginationPageSize={15}
              paginationPageSizeSelector={[15, 30, 50]}
              suppressMovableColumns
              defaultColDef={{ flex: 1, minWidth: 80, resizable: true, sortable: true }}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

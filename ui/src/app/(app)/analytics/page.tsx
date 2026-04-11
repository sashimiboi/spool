'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AgCharts } from 'ag-charts-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-charts-community';
import { useTheme } from '@/components/ThemeProvider';
import { fetchApi, formatNumber, formatCost, cleanProject } from '@/lib/api';

ModuleRegistry.registerModules([AllCommunityModule]);

interface DailyStats {
  day: string; sessions: number; messages: number;
  tool_calls: number; total_tokens: number; cost: number;
}
interface Overview {
  summary: Record<string, number>;
  projects: Array<{ project: string; sessions: number; messages: number; cost: number }>;
  top_tools: Array<{ tool_name: string; uses: number }>;
  recent_sessions: Array<{
    id: string; project: string; title: string;
    started_at: string; message_count: number; estimated_cost_usd: number;
  }>;
}
interface ToolInfo {
  tool_name: string; uses: number; sessions: number;
}

export default function AnalyticsPage() {
  const { resolved } = useTheme();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    try {
      const [ov, dl, tl] = await Promise.all([
        fetchApi('/api/overview'),
        fetchApi(`/api/daily?days=${days}`),
        fetchApi('/api/tools?limit=20'),
      ]);
      setOverview(ov); setDaily(dl); setTools(tl);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (loading || !overview) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" /></div>;
  }

  const isDark = resolved === 'dark';
  const textColor = isDark ? '#6b6b80' : '#8b8b9e';
  const gridColor = isDark ? '#2a2a3c' : '#f0f0f2';
  const primaryFill = isDark ? '#8b7cf6' : '#7c5cfc';
  const mutedFill = isDark ? '#3f3f50' : '#d4d4d8';

  const s = overview.summary;

  const dailyChartData = daily.map(d => ({
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    messages: d.messages,
    toolCalls: d.tool_calls,
  }));

  const costChartData = daily.map(d => ({
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    cost: Number(d.cost.toFixed(2)),
  }));

  const tokenChartData = daily.map(d => ({
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tokens: d.total_tokens,
  }));

  const projectChartData = overview.projects.slice(0, 8).map(p => ({
    project: cleanProject(p.project),
    messages: p.messages,
  }));

  const toolChartData = tools.slice(0, 10).map(t => ({
    tool: t.tool_name, uses: t.uses,
  }));

  const baseAxes = (rot = -45) => [
    { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: rot } },
    { type: 'number', position: 'left', label: { fontSize: 10, color: textColor }, gridLine: { style: [{ stroke: gridColor }] } },
  ] as any;

  const baseLegend = { position: 'bottom' as const, item: { label: { fontSize: 10, color: textColor } } };
  const baseOpts = { background: { fill: 'transparent' }, padding: { top: 8, right: 8, bottom: 0, left: 0 } };

  const activityChart: any = {
    data: dailyChartData,
    series: [
      { type: 'bar', xKey: 'day', yKey: 'messages', yName: 'Messages', fill: primaryFill, cornerRadius: 3 },
      { type: 'bar', xKey: 'day', yKey: 'toolCalls', yName: 'Tool Calls', fill: mutedFill, cornerRadius: 3 },
    ],
    axes: baseAxes(), legend: baseLegend, ...baseOpts,
  };

  const costChart: any = {
    data: costChartData,
    series: [
      { type: 'area', xKey: 'day', yKey: 'cost', yName: 'Cost ($)', fill: '#10b981', fillOpacity: 0.12, stroke: '#10b981', strokeWidth: 2 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 10, color: textColor, formatter: (p: any) => `$${p.value}` }, gridLine: { style: [{ stroke: gridColor }] } },
    ] as any,
    legend: { enabled: false }, ...baseOpts,
  };

  const tokenChart: any = {
    data: tokenChartData,
    series: [
      { type: 'area', xKey: 'day', yKey: 'tokens', yName: 'Tokens', fill: primaryFill, fillOpacity: 0.1, stroke: primaryFill, strokeWidth: 2 },
    ],
    axes: baseAxes(), legend: { enabled: false }, ...baseOpts,
  };

  const projectChart: any = {
    data: projectChartData,
    series: [
      { type: 'bar', xKey: 'project', yKey: 'messages', yName: 'Messages', fill: primaryFill, cornerRadius: 3 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: textColor, rotation: -30 } },
      { type: 'number', position: 'left', label: { fontSize: 10, color: textColor }, gridLine: { style: [{ stroke: gridColor }] } },
    ] as any,
    legend: { enabled: false }, ...baseOpts,
  };

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
    ] as any,
    legend: { enabled: false }, ...baseOpts,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <Tabs value={String(days)} onValueChange={(v) => { setDays(Number(v)); setLoading(true); }}>
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="14">14d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
          </TabsList>
        </Tabs>
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

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Messages & Tool Calls</CardTitle></CardHeader>
          <CardContent><div className="h-[240px]"><AgCharts options={activityChart} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Estimated Cost</CardTitle></CardHeader>
          <CardContent><div className="h-[240px]"><AgCharts options={costChart} /></div></CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Token Usage</CardTitle></CardHeader>
          <CardContent><div className="h-[240px]"><AgCharts options={tokenChart} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Messages by Project</CardTitle></CardHeader>
          <CardContent><div className="h-[240px]"><AgCharts options={projectChart} /></div></CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Tool Distribution</CardTitle></CardHeader>
          <CardContent><div className="h-[280px]"><AgCharts options={toolPieChart} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Tool Usage (Top 10)</CardTitle></CardHeader>
          <CardContent><div className="h-[280px]"><AgCharts options={toolBarChart} /></div></CardContent>
        </Card>
      </div>

      {/* Daily table */}
      <Card>
        <CardHeader><CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Daily Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto scrollbar-thin">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Sessions</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Messages</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tools</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Tokens</th>
                  <th className="text-right py-2 px-3 text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Cost</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr key={d.day} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                    <td className="py-1.5 px-3">{new Date(d.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{d.sessions}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-medium">{d.messages}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{d.tool_calls}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{formatNumber(d.total_tokens)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums font-mono text-muted-foreground">{formatCost(d.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

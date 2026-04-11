'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { AgCharts } from 'ag-charts-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-charts-community';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ChartOptions = any;
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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const s = overview.summary;

  // Chart data transforms
  const dailyChartData = daily.map(d => ({
    day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    messages: d.messages,
    toolCalls: d.tool_calls,
    sessions: d.sessions,
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
    cost: Number((p.cost || 0).toFixed(2)),
  }));

  const toolChartData = tools.slice(0, 10).map(t => ({
    tool: t.tool_name,
    uses: t.uses,
    sessions: t.sessions,
  }));

  const activityChart: ChartOptions = {
    data: dailyChartData,
    series: [
      { type: 'bar', xKey: 'day', yKey: 'messages', yName: 'Messages', fill: '#2563eb', cornerRadius: 4 },
      { type: 'bar', xKey: 'day', yKey: 'toolCalls', yName: 'Tool Calls', fill: '#d1d5db', cornerRadius: 4 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: '#9ca3af', rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 11, color: '#9ca3af' }, gridLine: { style: [{ stroke: '#f0f0f0' }] } },
    ],
    legend: { position: 'bottom', item: { label: { fontSize: 11, color: '#6b7280' } } },
    background: { fill: 'transparent' },
    padding: { top: 10, right: 10, bottom: 0, left: 0 },
  };

  const costChart: ChartOptions = {
    data: costChartData,
    series: [
      { type: 'area', xKey: 'day', yKey: 'cost', yName: 'Cost ($)', fill: '#10b981', fillOpacity: 0.15, stroke: '#10b981', strokeWidth: 2 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: '#9ca3af', rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 11, color: '#9ca3af', formatter: (p: any) => `$${p.value}` }, gridLine: { style: [{ stroke: '#f0f0f0' }] } },
    ],
    legend: { enabled: false },
    background: { fill: 'transparent' },
    padding: { top: 10, right: 10, bottom: 0, left: 0 },
  };

  const tokenChart: ChartOptions = {
    data: tokenChartData,
    series: [
      { type: 'area', xKey: 'day', yKey: 'tokens', yName: 'Tokens', fill: '#8b5cf6', fillOpacity: 0.12, stroke: '#8b5cf6', strokeWidth: 2 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: '#9ca3af', rotation: -45 } },
      { type: 'number', position: 'left', label: { fontSize: 11, color: '#9ca3af' }, gridLine: { style: [{ stroke: '#f0f0f0' }] } },
    ],
    legend: { enabled: false },
    background: { fill: 'transparent' },
    padding: { top: 10, right: 10, bottom: 0, left: 0 },
  };

  const projectChart: ChartOptions = {
    data: projectChartData,
    series: [
      { type: 'bar', xKey: 'project', yKey: 'messages', yName: 'Messages', fill: '#2563eb', cornerRadius: 4 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 10, color: '#9ca3af', rotation: -30 } },
      { type: 'number', position: 'left', label: { fontSize: 11, color: '#9ca3af' }, gridLine: { style: [{ stroke: '#f0f0f0' }] } },
    ],
    legend: { enabled: false },
    background: { fill: 'transparent' },
    padding: { top: 10, right: 10, bottom: 0, left: 0 },
  };

  const toolPieChart: ChartOptions = {
    data: toolChartData,
    series: [{
      type: 'pie',
      angleKey: 'uses',
      legendItemKey: 'tool',
      innerRadiusRatio: 0.5,
      fills: ['#2563eb', '#9CA3AF', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#6366f1', '#84cc16'],
      strokeWidth: 0,
    }],
    legend: { position: 'right', item: { label: { fontSize: 11, color: '#6b7280' } } },
    background: { fill: 'transparent' },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  const toolBarChart: ChartOptions = {
    data: toolChartData,
    series: [
      { type: 'bar', direction: 'horizontal', xKey: 'tool', yKey: 'uses', yName: 'Uses', fill: '#2563eb', cornerRadius: 4 },
    ],
    axes: [
      { type: 'category', position: 'left', label: { fontSize: 11, color: '#6b7280' } },
      { type: 'number', position: 'bottom', label: { fontSize: 11, color: '#9ca3af' }, gridLine: { style: [{ stroke: '#f0f0f0' }] } },
    ],
    legend: { enabled: false },
    background: { fill: 'transparent' },
    padding: { top: 10, right: 10, bottom: 0, left: 0 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <Tabs value={String(days)} onValueChange={(v) => { setDays(Number(v)); setLoading(true); }}>
          <TabsList>
            <TabsTrigger value="7">7d</TabsTrigger>
            <TabsTrigger value="14">14d</TabsTrigger>
            <TabsTrigger value="30">30d</TabsTrigger>
            <TabsTrigger value="90">90d</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Sessions', value: formatNumber(s.total_sessions || 0) },
          { label: 'Total Messages', value: formatNumber(s.total_messages || 0) },
          { label: 'Est. Tokens', value: formatNumber((s.total_input_tokens || 0) + (s.total_output_tokens || 0)) },
          { label: 'Est. Cost', value: formatCost(s.total_cost_usd || 0) },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{c.label}</div>
              <div className="text-2xl font-bold mt-1">{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity + Cost charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base text-foreground">Messages & Tool Calls</CardTitle></CardHeader>
          <CardContent><div className="h-[260px]"><AgCharts options={activityChart} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base text-foreground">Estimated Cost</CardTitle></CardHeader>
          <CardContent><div className="h-[260px]"><AgCharts options={costChart} /></div></CardContent>
        </Card>
      </div>

      {/* Tokens + Projects */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base text-foreground">Token Usage</CardTitle></CardHeader>
          <CardContent><div className="h-[260px]"><AgCharts options={tokenChart} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base text-foreground">Messages by Project</CardTitle></CardHeader>
          <CardContent><div className="h-[260px]"><AgCharts options={projectChart} /></div></CardContent>
        </Card>
      </div>

      {/* Tool usage: pie + bar */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base text-foreground">Tool Distribution</CardTitle></CardHeader>
          <CardContent><div className="h-[300px]"><AgCharts options={toolPieChart} /></div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base text-foreground">Tool Usage (Top 10)</CardTitle></CardHeader>
          <CardContent><div className="h-[300px]"><AgCharts options={toolBarChart} /></div></CardContent>
        </Card>
      </div>

      {/* Session heatmap-style table */}
      <Card>
        <CardHeader><CardTitle className="text-base text-foreground">Daily Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Date</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Sessions</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Messages</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Tool Calls</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Tokens</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Cost</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d, i) => (
                  <tr key={d.day} className={`border-b last:border-0 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                    <td className="py-2 px-3">{new Date(d.day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td className="py-2 px-3 text-right">{d.sessions}</td>
                    <td className="py-2 px-3 text-right font-medium">{d.messages}</td>
                    <td className="py-2 px-3 text-right">{d.tool_calls}</td>
                    <td className="py-2 px-3 text-right">{formatNumber(d.total_tokens)}</td>
                    <td className="py-2 px-3 text-right text-emerald-600 font-medium">{formatCost(d.cost)}</td>
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

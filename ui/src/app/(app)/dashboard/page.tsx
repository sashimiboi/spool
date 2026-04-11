'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AgCharts } from 'ag-charts-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-charts-community';
import type { AgChartOptions } from 'ag-charts-community';
import { useRouter } from 'next/navigation';
import { fetchApi, formatNumber, formatCost, formatDate, cleanProject } from '@/lib/api';
import {
  MessageSquare, Wrench, Coins, FolderOpen, Hash, Activity,
} from 'lucide-react';

ModuleRegistry.registerModules([AllCommunityModule]);

interface Overview {
  summary: {
    total_sessions: number;
    total_messages: number;
    total_tool_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost_usd: number;
  };
  projects: Array<{ project: string; sessions: number; messages: number; cost: number }>;
  top_tools: Array<{ tool_name: string; uses: number }>;
  recent_sessions: Array<{
    id: string; project: string; title: string;
    started_at: string; message_count: number; estimated_cost_usd: number;
  }>;
}

interface DailyStats {
  day: string;
  sessions: number;
  messages: number;
  tool_calls: number;
  total_tokens: number;
  cost: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DailyStats[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [ov, dl] = await Promise.all([
        fetchApi('/api/overview'),
        fetchApi('/api/daily?days=14'),
      ]);
      setOverview(ov);
      setDaily(dl);
    } catch (e) {
      console.error('Failed to load dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !overview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const s = overview.summary;
  const totalTokens = (s.total_input_tokens || 0) + (s.total_output_tokens || 0);

  const statCards = [
    { label: 'Sessions', value: s.total_sessions, icon: Activity },
    { label: 'Messages', value: s.total_messages, icon: MessageSquare },
    { label: 'Tool Calls', value: s.total_tool_calls, icon: Wrench },
    { label: 'Est. Tokens', value: totalTokens, icon: Hash },
    { label: 'Est. Cost', value: formatCost(s.total_cost_usd || 0), icon: Coins, raw: true },
    { label: 'Projects', value: overview.projects.length, icon: FolderOpen },
  ];

  const chartOptions: AgChartOptions = {
    data: daily.map(d => ({
      day: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      messages: d.messages,
      toolCalls: d.tool_calls,
    })),
    series: [
      { type: 'bar', xKey: 'day', yKey: 'messages', yName: 'Messages', fill: '#2563eb', cornerRadius: 4 },
      { type: 'bar', xKey: 'day', yKey: 'toolCalls', yName: 'Tool Calls', fill: '#d1d5db', cornerRadius: 4 },
    ],
    axes: [
      { type: 'category', position: 'bottom', label: { fontSize: 11, color: '#9ca3af' } },
      { type: 'number', position: 'left', label: { fontSize: 11, color: '#9ca3af' }, gridLine: { style: [{ stroke: '#f0f0f0' }] } },
    ],
    legend: { position: 'bottom', item: { label: { fontSize: 11, color: '#6b7280' } } },
    background: { fill: 'transparent' },
    padding: { top: 10, right: 10, bottom: 0, left: 0 },
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle>{card.label}</CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {card.raw ? card.value : formatNumber(card.value as number)}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Daily activity chart */}
      {daily.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Daily Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <AgCharts options={chartOptions} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Two column: Projects + Tools */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Projects</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.projects.slice(0, 8).map((p) => (
              <div key={p.project} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <div className="text-sm font-medium">{cleanProject(p.project)}</div>
                  <div className="text-xs text-muted-foreground">{p.sessions} sessions, {p.messages} msgs</div>
                </div>
                <Badge variant="info">{formatCost(p.cost || 0)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Top Tools */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Top Tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.top_tools.slice(0, 8).map((t) => {
              const maxUses = overview.top_tools[0]?.uses || 1;
              return (
                <div key={t.tool_name} className="flex items-center gap-3">
                  <span className="text-sm font-mono w-20 shrink-0">{t.tool_name}</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(t.uses / maxUses) * 100}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">{formatNumber(t.uses)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base text-foreground">Recent Sessions</CardTitle>
            <button onClick={() => router.push('/sessions')} className="text-xs text-primary font-medium hover:underline">
              View all
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {overview.recent_sessions.slice(0, 8).map((r) => (
              <div
                key={r.id}
                onClick={() => router.push(`/sessions?id=${r.id}`)}
                className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{(r.title || 'Untitled').slice(0, 60)}</div>
                  <div className="text-xs text-muted-foreground flex gap-2">
                    <span>{cleanProject(r.project || '')}</span>
                    <span>{formatDate(r.started_at)}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 ml-4">
                  <Badge variant="secondary">{r.message_count} msgs</Badge>
                  <Badge variant="info">{formatCost(r.estimated_cost_usd || 0)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

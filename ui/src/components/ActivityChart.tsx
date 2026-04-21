'use client';

import { useMemo, useState } from 'react';
import { AgCharts } from 'ag-charts-react';
import { useTheme } from '@/components/ThemeProvider';
import { Card, CardContent } from '@/components/ui/card';
import { baseChartOptions, categoryAxis, getChartTokens } from '@/lib/agChartTheme';

type Mode = 'messages' | 'toolCalls' | 'tokens' | 'cost';

interface DailyPoint {
  day: string;
  messages: number;
  tool_calls: number;
  total_tokens: number;
  cost: number;
}

interface ActivityChartProps {
  data: DailyPoint[];
  days: number;
  onDaysChange: (days: number) => void;
  height?: number;
}

const RANGES: Array<{ value: number; label: string }> = [
  { value: 7, label: '7d' },
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

const MODES: Array<{ value: Mode; label: string }> = [
  { value: 'messages', label: 'Messages' },
  { value: 'toolCalls', label: 'Tools' },
  { value: 'tokens', label: 'Tokens' },
  { value: 'cost', label: 'Cost' },
];

export default function ActivityChart({ data, days, onDaysChange, height = 320 }: ActivityChartProps) {
  const { resolved } = useTheme();
  const [mode, setMode] = useState<Mode>('messages');

  const t = getChartTokens(resolved);
  const base = baseChartOptions(resolved);
  // Cost gets a distinct green to visually separate from volume metrics;
  // every other mode uses the canonical hero color.
  const stroke = mode === 'cost' ? '#10b981' : t.hero;
  const fill = stroke;

  const chartData = useMemo(
    () =>
      data.map((d) => ({
        day: new Date(d.day).getTime(),
        label: new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        value:
          mode === 'messages'
            ? Number(d.messages) || 0
            : mode === 'toolCalls'
              ? Number(d.tool_calls) || 0
              : mode === 'tokens'
                ? Number(d.total_tokens) || 0
                : Number(d.cost) || 0,
      })),
    [data, mode],
  );

  const stats = useMemo(() => {
    if (chartData.length === 0) return { total: 0, avg: 0, peak: 0 };
    const vals = chartData.map((d) => d.value);
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / vals.length;
    const peak = Math.max(...vals);
    return { total, avg, peak };
  }, [chartData]);

  const formatValue = (v: number): string => {
    if (mode === 'cost') return `$${v.toFixed(2)}`;
    if (mode === 'tokens' && v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
    return Math.round(v).toLocaleString();
  };

  const options: any = {
    ...base,
    data: chartData,
    series: [
      {
        type: 'line',
        xKey: 'day',
        yKey: 'value',
        yName: MODES.find((m) => m.value === mode)?.label ?? '',
        stroke,
        strokeWidth: 2.25,
        marker: {
          enabled: true,
          shape: 'circle',
          size: 5,
          fill: stroke,
          stroke: t.markerStroke,
          strokeWidth: 1.5,
        },
        interpolation: { type: 'smooth' },
        tooltip: {
          renderer: (params: any) => ({
            title: params.datum.label,
            content: formatValue(params.datum.value),
          }),
        },
      },
      {
        type: 'area',
        xKey: 'day',
        yKey: 'value',
        fill,
        fillOpacity: 0.08,
        stroke: 'transparent',
        interpolation: { type: 'smooth' },
        showInLegend: false,
        tooltip: { enabled: false },
      },
    ],
    axes: [
      {
        ...categoryAxis(resolved),
        type: 'time',
        label: {
          fontSize: 10,
          color: t.text,
          format: '%b %d',
        },
      },
      {
        type: 'number',
        position: 'left',
        label: { fontSize: 10, color: t.text, formatter: (p: any) => formatValue(p.value) },
        tick: { stroke: 'transparent' },
        line: { stroke: 'transparent' },
        gridLine: { style: [{ stroke: t.grid, lineDash: [2, 4] }] },
      },
    ],
    legend: { enabled: false },
  };

  return (
    <Card>
      <CardContent className="pt-3 pb-3 px-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: stroke }}
              />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                Activity
              </span>
            </div>
            <div className="flex items-baseline gap-3 mt-1 tabular-nums">
              <span className="text-2xl font-semibold">{formatValue(stats.total)}</span>
              <span className="text-[11px] text-muted-foreground">
                total · avg {formatValue(stats.avg)} · peak {formatValue(stats.peak)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={
                    'text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors ' +
                    (mode === m.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-border mx-0.5" />

            <div className="flex items-center gap-0.5 rounded-lg bg-secondary/60 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => onDaysChange(r.value)}
                  className={
                    'text-[11px] font-semibold px-2.5 py-1 rounded-md transition-colors tabular-nums ' +
                    (days === r.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground')
                  }
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ height, width: '100%' }} className="overflow-hidden">
          <AgCharts options={{ ...options, width: undefined, height }} />
        </div>
      </CardContent>
    </Card>
  );
}

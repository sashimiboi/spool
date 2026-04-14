'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CheckCircle2, XCircle, AlertCircle, Play, ClipboardList, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchApi, postApi, formatDate } from '@/lib/api';

interface Rubric {
  id: string;
  name: string;
  description: string;
  kind: string;          // function | llm_judge
  target_kind: string;   // trace | span
  config: Record<string, unknown>;
}

interface EvalRow {
  id: number;
  rubric_id: string;
  rubric_name: string;
  trace_id: string | null;
  span_id: string | null;
  score: number | string | null;
  passed: boolean | null;
  label: string | null;
  rationale: string | null;
  run_at: string;
}

type Window = 'all' | '24h' | '7d' | '30d';
const WINDOWS: Array<{ key: Window; label: string; days: number | null }> = [
  { key: 'all', label: 'All time', days: null },
  { key: '24h', label: '24h', days: 1 },
  { key: '7d',  label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
];

function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-muted-foreground';
  if (score >= 0.9) return 'text-emerald-500';
  if (score >= 0.7) return 'text-amber-500';
  return 'text-destructive';
}

function StatusIcon({ passed }: { passed: boolean | null }) {
  if (passed === true) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />;
  if (passed === false) return <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />;
  return <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
}

export default function EvalsPage() {
  const [loading, setLoading] = useState(true);
  const [rubrics, setRubrics] = useState<Rubric[]>([]);
  const [evals, setEvals] = useState<EvalRow[]>([]);
  const [rubricFilter, setRubricFilter] = useState<string | null>(null);
  const [runningBulk, setRunningBulk] = useState<string | null>(null);
  const [bulkWindow, setBulkWindow] = useState<Window>('7d');
  const [lastRun, setLastRun] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [rbs, evs] = await Promise.all([
        fetchApi('/api/evals/rubrics'),
        fetchApi('/api/evals?limit=200'),
      ]);
      setRubrics(rbs);
      setEvals(evs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const runBulk = async (rubricId: string) => {
    setRunningBulk(rubricId);
    setLastRun(null);
    try {
      const w = WINDOWS.find(x => x.key === bulkWindow);
      const body: Record<string, unknown> = { rubric_id: rubricId };
      if (w?.days) body.days = w.days;
      const result = await postApi('/api/evals/run', body);
      setLastRun(`${rubricId}: scored ${result.scored}/${result.traces} traces`);
      await loadAll();
    } catch (e) {
      console.error(e);
      setLastRun(`${rubricId}: error`);
    } finally {
      setRunningBulk(null);
    }
  };

  // Aggregate: per-rubric stats (runs, avg score, pass rate)
  const rubricStats = rubrics.map(r => {
    const runs = evals.filter(e => e.rubric_id === r.id);
    const scored = runs.filter(e => e.score !== null).map(e => Number(e.score));
    const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;
    const passed = runs.filter(e => e.passed === true).length;
    const failed = runs.filter(e => e.passed === false).length;
    const passRate = passed + failed > 0 ? passed / (passed + failed) : null;
    const latest = runs[0] || null;
    return { rubric: r, runs: runs.length, avg, passRate, passed, failed, latest };
  });

  const filteredEvals = rubricFilter ? evals.filter(e => e.rubric_id === rubricFilter) : evals;

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
    </div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Evals
        </h1>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {rubrics.length} rubrics · {evals.length} runs
        </span>
      </div>

      {/* Overview grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {rubricStats.map(({ rubric, runs, avg, passRate, passed, failed, latest }) => (
          <Card key={rubric.id} className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="text-sm truncate">{rubric.name}</CardTitle>
                  <p className="text-[11px] text-muted-foreground truncate">{rubric.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="outline">{rubric.kind}</Badge>
                  <Badge variant="outline">{rubric.target_kind}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div>
                  <div className="text-[11px] text-muted-foreground">Runs</div>
                  <div className="tabular-nums font-medium">{runs}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Avg score</div>
                  <div className={cn('tabular-nums font-medium', scoreColor(avg))}>
                    {avg !== null ? avg.toFixed(2) : '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Pass rate</div>
                  <div className={cn('tabular-nums font-medium',
                    passRate === null ? 'text-muted-foreground'
                    : passRate >= 0.9 ? 'text-emerald-500'
                    : passRate >= 0.7 ? 'text-amber-500'
                    : 'text-destructive')}>
                    {passRate !== null ? `${Math.round(passRate * 100)}%` : '—'}
                  </div>
                </div>
              </div>

              {(passed > 0 || failed > 0) && (
                <div className="flex gap-1 text-[11px]">
                  {passed > 0 && <Badge variant="secondary">{passed} passed</Badge>}
                  {failed > 0 && <Badge variant="destructive">{failed} failed</Badge>}
                </div>
              )}

              {latest && (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Last run {formatDate(latest.run_at)}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={runningBulk === rubric.id}
                  onClick={() => runBulk(rubric.id)}
                  className="flex-1"
                >
                  <Play className="h-3 w-3 mr-1" />
                  {runningBulk === rubric.id ? 'Running...' : `Run on ${bulkWindow === 'all' ? 'all' : bulkWindow}`}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setRubricFilter(rubricFilter === rubric.id ? null : rubric.id)}
                >
                  {rubricFilter === rubric.id ? 'Clear' : 'Filter'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Window selector + last-run status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-md border bg-card p-0.5 text-[12px]">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => setBulkWindow(w.key)}
              className={cn(
                'px-2.5 py-1 rounded transition-colors',
                bulkWindow === w.key
                  ? 'bg-accent text-foreground font-medium'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {w.label}
            </button>
          ))}
        </div>
        {lastRun && (
          <span className="text-[12px] text-muted-foreground">{lastRun}</span>
        )}
      </div>

      {/* Recent runs table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between gap-2">
            <span>Recent runs {rubricFilter && `· ${rubricFilter}`}</span>
            <span className="text-[11px] text-muted-foreground font-normal tabular-nums">
              {filteredEvals.length} results
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-[60vh] overflow-auto scrollbar-thin">
            {filteredEvals.length === 0 ? (
              <p className="p-6 text-[12px] text-muted-foreground text-center">
                No eval runs yet. Pick a rubric above and click <strong>Run</strong>.
              </p>
            ) : (
              filteredEvals.map(e => (
                <a
                  key={e.id}
                  href={e.trace_id ? `/traces?trace=${e.trace_id}` : '#'}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/50 cursor-pointer"
                >
                  <StatusIcon passed={e.passed} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-medium truncate">
                      {e.rubric_name || e.rubric_id}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate font-mono">
                      {e.trace_id || e.span_id}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] tabular-nums shrink-0">
                    {e.score !== null && (
                      <span className={cn('font-medium', scoreColor(Number(e.score)))}>
                        {Number(e.score).toFixed(2)}
                      </span>
                    )}
                    {e.label && <Badge variant="outline">{e.label}</Badge>}
                    <span className="text-muted-foreground">{formatDate(e.run_at)}</span>
                  </div>
                </a>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

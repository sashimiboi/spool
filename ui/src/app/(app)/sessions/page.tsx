'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { fetchApi, formatNumber, formatCost, formatDate, cleanProject } from '@/lib/api';

interface Session {
  id: string;
  project: string;
  title: string;
  started_at: string;
  message_count: number;
  tool_call_count: number;
  estimated_cost_usd: number;
  git_branch: string;
  cwd: string;
}

interface SessionDetail {
  session: Session & { estimated_input_tokens: number; estimated_output_tokens: number };
  messages: Array<{ role: string; content: string; timestamp: string; tools_used: string; estimated_tokens: number }>;
  tool_summary: Array<{ tool_name: string; uses: number }>;
}

export default function SessionsPage() {
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<SessionDetail | null>(null);
  const [filter, setFilter] = useState('');
  const [copied, setCopied] = useState(false);

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

  const openSession = async (id: string) => {
    try { setSelected(await fetchApi(`/api/session/${id}`)); }
    catch (e) { console.error(e); }
  };

  const filtered = sessions.filter((s) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (s.title || '').toLowerCase().includes(q)
      || (s.project || '').toLowerCase().includes(q)
      || (s.git_branch || '').toLowerCase().includes(q);
  });

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
      <h1 className="text-lg font-semibold tracking-tight">Sessions</h1>

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by project, title, or branch..."
      />

      <div className="rounded-lg border bg-card overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_60px_60px_60px] gap-3 px-4 py-2 border-b text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          <span>Session</span><span>Project</span><span>Msgs</span><span>Tools</span><span>Cost</span>
        </div>
        {filtered.map((s) => (
          <div
            key={s.id}
            onClick={() => openSession(s.id)}
            className="grid grid-cols-[2fr_1fr_60px_60px_60px] gap-3 px-4 py-2 border-b last:border-0 cursor-pointer hover:bg-accent/50 transition-colors"
          >
            <div>
              <div className="text-[13px] font-medium truncate">{(s.title || 'Untitled').slice(0, 60)}</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span className="font-mono text-[10px]">{s.id.slice(0, 8)}</span>
                <span>{formatDate(s.started_at)}</span>
                {s.git_branch && <span className="text-muted-foreground/60">{s.git_branch}</span>}
              </div>
            </div>
            <span className="text-[13px] text-muted-foreground truncate self-center">{cleanProject(s.project || '')}</span>
            <span className="text-[13px] self-center tabular-nums">{s.message_count}</span>
            <span className="text-[13px] self-center tabular-nums">{s.tool_call_count}</span>
            <span className="text-[13px] text-muted-foreground self-center font-mono">{formatCost(s.estimated_cost_usd || 0)}</span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-[13px]">No sessions match your filter.</div>
        )}
      </div>
    </div>
  );
}

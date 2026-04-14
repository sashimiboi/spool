'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Bot, Wrench, Sparkles, Box, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

export interface Span {
  id: string;
  trace_id: string;
  parent_id: string | null;
  kind: 'session' | 'agent' | 'tool' | 'llm_call' | 'eval' | 'step';
  name: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_ms: number | null;
  depth: number;
  sequence: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number | string;
  model: string | null;
  tool_name: string | null;
  tool_input: unknown;
  tool_output: string | null;
  tool_is_error: boolean | null;
  agent_type: string | null;
  agent_prompt: string | null;
  vendor: string | null;
  category: string | null;
  attrs: Record<string, unknown>;
}

export const VENDOR_COLORS: Record<string, string> = {
  linear:     'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  github:     'bg-zinc-500/15 text-zinc-300 border-zinc-500/30',
  slack:      'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30',
  notion:     'bg-stone-500/15 text-stone-300 border-stone-500/30',
  jira:       'bg-blue-500/15 text-blue-400 border-blue-500/30',
  atlassian:  'bg-blue-500/15 text-blue-400 border-blue-500/30',
  stripe:     'bg-violet-500/15 text-violet-400 border-violet-500/30',
  vercel:     'bg-white/10 text-white border-white/20',
  cloudflare: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  aws:        'bg-amber-500/15 text-amber-400 border-amber-500/30',
  gcp:        'bg-sky-500/15 text-sky-400 border-sky-500/30',
  snowflake:  'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  sentry:     'bg-rose-500/15 text-rose-400 border-rose-500/30',
  openai:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  anthropic:  'bg-orange-500/15 text-orange-400 border-orange-500/30',
  filesystem: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  shell:      'bg-neutral-500/15 text-neutral-400 border-neutral-500/30',
  search:     'bg-teal-500/15 text-teal-400 border-teal-500/30',
  web:        'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  agent:      'bg-purple-500/15 text-purple-400 border-purple-500/30',
  planning:   'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  unknown:    'bg-muted text-muted-foreground border-border',
};

interface TreeNode {
  span: Span;
  children: TreeNode[];
}

function buildTree(spans: Span[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  spans.forEach((s) => byId.set(s.id, { span: s, children: [] }));
  const roots: TreeNode[] = [];
  spans.forEach((s) => {
    const node = byId.get(s.id)!;
    if (s.parent_id && byId.has(s.parent_id)) {
      byId.get(s.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  // Sort children by sequence
  const sortRec = (n: TreeNode) => {
    n.children.sort((a, b) => a.span.sequence - b.span.sequence);
    n.children.forEach(sortRec);
  };
  roots.forEach(sortRec);
  return roots;
}

const KIND_STYLES: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  session:  { icon: Box,       color: 'text-muted-foreground',           label: 'session'  },
  agent:    { icon: Bot,       color: 'text-purple-500',                 label: 'agent'    },
  tool:     { icon: Wrench,    color: 'text-blue-500',                   label: 'tool'     },
  llm_call: { icon: Sparkles,  color: 'text-amber-500',                  label: 'llm'      },
  eval:     { icon: CheckCircle2, color: 'text-emerald-500',             label: 'eval'     },
  step:     { icon: Box,       color: 'text-muted-foreground',           label: 'step'     },
};

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(c: number | string): string {
  const n = typeof c === 'string' ? parseFloat(c) : c;
  if (!n || n < 0.01) return '$0.00';
  return `$${n.toFixed(2)}`;
}

function NodeRow({ node, onSelect, selectedId }: { node: TreeNode; onSelect: (s: Span) => void; selectedId: string | null }) {
  const [open, setOpen] = useState(node.span.kind === 'session' || node.span.kind === 'agent');
  const { span, children } = node;
  const hasChildren = children.length > 0;
  const style = KIND_STYLES[span.kind] || KIND_STYLES.step;
  const Icon = style.icon;
  const isError = span.status === 'error' || span.tool_is_error === true;
  const label =
    span.kind === 'tool'  ? span.tool_name || span.name :
    span.kind === 'agent' ? (span.agent_type || 'agent') :
    span.kind === 'llm_call' ? (span.model || 'assistant.turn') :
    span.name;

  return (
    <div>
      <div
        onClick={() => onSelect(span)}
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 text-[12px] rounded cursor-pointer hover:bg-accent/50 transition-colors',
          selectedId === span.id && 'bg-accent'
        )}
        style={{ paddingLeft: 8 + span.depth * 16 }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
            className="p-0.5 -ml-1 shrink-0"
          >
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className={cn('h-3.5 w-3.5 shrink-0', style.color)} />
        <span className="truncate font-medium">{label}</span>
        {span.vendor && span.vendor !== 'filesystem' && span.vendor !== 'shell' && span.vendor !== 'search' && span.vendor !== 'unknown' && (
          <span
            className={cn(
              'text-[10px] px-1.5 py-0 rounded border font-medium uppercase tracking-wide shrink-0',
              VENDOR_COLORS[span.vendor] || VENDOR_COLORS.unknown
            )}
          >
            {span.vendor}
          </span>
        )}
        {isError && <AlertCircle className="h-3 w-3 text-destructive shrink-0" />}
        <span className="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
          {span.kind === 'llm_call' && (
            <>
              <span>{formatTokens(span.input_tokens)}→{formatTokens(span.output_tokens)}</span>
              <span>{formatCost(span.cost_usd)}</span>
            </>
          )}
          {span.kind === 'agent' && (
            <span>{formatCost(span.cost_usd)}</span>
          )}
          <span>{formatDuration(span.duration_ms)}</span>
        </span>
      </div>
      {hasChildren && open && (
        <div>
          {children.map((c) => (
            <NodeRow key={c.span.id} node={c} onSelect={onSelect} selectedId={selectedId} />
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  spans: Span[];
  onSelect?: (span: Span) => void;
  selectedId?: string | null;
}

export default function SpanTree({ spans, onSelect, selectedId }: Props) {
  const tree = useMemo(() => buildTree(spans), [spans]);

  if (!spans.length) {
    return <p className="text-[12px] text-muted-foreground p-3">No spans.</p>;
  }

  const handleSelect = (s: Span) => onSelect?.(s);

  return (
    <div className="space-y-0 py-1">
      {tree.map((n) => (
        <NodeRow key={n.span.id} node={n} onSelect={handleSelect} selectedId={selectedId ?? null} />
      ))}
    </div>
  );
}

export function SpanBadges({ span }: { span: Span }) {
  const badges: { label: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' }[] = [];
  badges.push({ label: span.kind, variant: 'outline' });
  if (span.vendor) badges.push({ label: `vendor:${span.vendor}`, variant: 'secondary' });
  if (span.category) badges.push({ label: `cat:${span.category}`, variant: 'outline' });
  if (span.model) badges.push({ label: span.model, variant: 'secondary' });
  if (span.agent_type) badges.push({ label: `agent:${span.agent_type}`, variant: 'secondary' });
  if (span.tool_name) badges.push({ label: `tool:${span.tool_name}`, variant: 'secondary' });
  if (span.status === 'error' || span.tool_is_error) badges.push({ label: 'error', variant: 'destructive' });
  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((b, i) => (
        <Badge key={i} variant={b.variant}>{b.label}</Badge>
      ))}
    </div>
  );
}

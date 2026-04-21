'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plug, Plus, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { fetchApi, postApi } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Connector {
  id: string;
  name: string;
  url: string;
  transport: string;
  status: 'connected' | 'disconnected' | 'error';
  last_error: string | null;
  last_checked_at: string | null;
  has_auth: boolean;
}

const PRESETS: Array<{ id: string; name: string; url: string; hint: string }> = [
  { id: 'linear', name: 'Linear', url: 'https://mcp.linear.app/mcp', hint: 'Paste a Linear API key. Get one at linear.app/settings/account/security.' },
  { id: 'notion', name: 'Notion', url: 'https://mcp.notion.com/mcp', hint: 'Paste an internal integration token.' },
];

export default function ConnectorsPanel() {
  const [connectors, setConnectors] = useState<Connector[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState({ id: '', name: '', url: '', token: '' });

  const load = useCallback(async () => {
    try { setConnectors(await fetchApi('/api/connectors')); } catch { setConnectors([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveToken = async (c: Connector, token: string) => {
    setBusy(c.id);
    try {
      await postApi('/api/connectors', {
        id: c.id,
        name: c.name,
        url: c.url,
        auth_header: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        transport: c.transport,
      });
      await postApi(`/api/connectors/${c.id}/test`, {});
      setEditing(null);
      setTokenInput('');
      await load();
    } finally { setBusy(null); }
  };

  const testConnector = async (id: string) => {
    setBusy(id);
    try { await postApi(`/api/connectors/${id}/test`, {}); await load(); } finally { setBusy(null); }
  };

  const remove = async (id: string) => {
    setBusy(id);
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/connectors/${id}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(null); }
  };

  const saveCustom = async () => {
    if (!custom.id || !custom.name || !custom.url) return;
    setBusy('__custom');
    try {
      await postApi('/api/connectors', {
        id: custom.id,
        name: custom.name,
        url: custom.url,
        auth_header: custom.token ? (custom.token.startsWith('Bearer ') ? custom.token : `Bearer ${custom.token}`) : null,
        transport: 'streamable-http',
      });
      if (custom.token) await postApi(`/api/connectors/${custom.id}/test`, {});
      setAdding(false);
      setCustom({ id: '', name: '', url: '', token: '' });
      await load();
    } finally { setBusy(null); }
  };

  const known = new Set((connectors ?? []).map((c) => c.id));
  const hiddenPresets = PRESETS.filter((p) => !known.has(p.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal flex items-center gap-2">
          <Plug className="h-3.5 w-3.5" /> Agent Connectors
        </CardTitle>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          External MCP servers the Spool chat agent can pull tools from. Stored locally, never leaves your machine.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {connectors === null ? (
          <div className="text-[12px] text-muted-foreground">Loading...</div>
        ) : connectors.length === 0 && hiddenPresets.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">No connectors yet.</div>
        ) : (
          <div className="space-y-2">
            {connectors.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{c.name}</span>
                      <StatusBadge status={c.status} hasAuth={c.has_auth} />
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono truncate">{c.url}</div>
                    {c.last_error && c.status === 'error' && (
                      <div className="text-[11px] text-destructive mt-1 truncate">{c.last_error}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.has_auth && (
                      <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => testConnector(c.id)} className="h-7 text-[11px]">
                        {busy === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Test'}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={c.has_auth ? 'ghost' : 'secondary'}
                      onClick={() => { setEditing(editing === c.id ? null : c.id); setTokenInput(''); }}
                      className="h-7 text-[11px]"
                    >
                      {c.has_auth ? 'Rotate token' : 'Connect'}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => remove(c.id)} className="h-7 w-7 p-0">
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
                {editing === c.id && (
                  <TokenForm
                    hint={PRESETS.find((p) => p.id === c.id)?.hint ?? 'Paste an API token. It will be sent as Authorization: Bearer <token>.'}
                    value={tokenInput}
                    onChange={setTokenInput}
                    busy={busy === c.id}
                    onCancel={() => setEditing(null)}
                    onSave={() => saveToken(c, tokenInput)}
                  />
                )}
              </div>
            ))}
            {hiddenPresets.map((p) => (
              <div key={p.id} className="rounded-lg border border-dashed bg-card/50 p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground font-mono">{p.url}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await postApi('/api/connectors', { id: p.id, name: p.name, url: p.url, transport: 'streamable-http' });
                    await load();
                    setEditing(p.id);
                  }}
                  className="h-7 text-[11px]"
                >
                  Add
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2">
          {adding ? (
            <div className="rounded-lg border bg-card p-3 space-y-2">
              <div className="text-[12px] font-medium">Custom MCP server</div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="id (e.g. my-mcp)" value={custom.id} onChange={(e) => setCustom({ ...custom, id: e.target.value })} className="h-8 text-[13px]" />
                <Input placeholder="Display name" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} className="h-8 text-[13px]" />
              </div>
              <Input placeholder="https://example.com/mcp" value={custom.url} onChange={(e) => setCustom({ ...custom, url: e.target.value })} className="h-8 text-[13px]" />
              <Input placeholder="API token (optional)" type="password" value={custom.token} onChange={(e) => setCustom({ ...custom, token: e.target.value })} className="h-8 text-[13px]" />
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={saveCustom} disabled={busy === '__custom' || !custom.id || !custom.name || !custom.url} className="h-7 text-[11px]">
                  {busy === '__custom' ? 'Saving...' : 'Add'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)} className="h-7 text-[11px]">Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAdding(true)} className="h-7 text-[11px] text-muted-foreground">
              <Plus className="h-3 w-3 mr-1" /> Add a custom MCP
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, hasAuth }: { status: string; hasAuth: boolean }) {
  if (!hasAuth) return <Badge variant="outline" className="text-[10px]">Not connected</Badge>;
  if (status === 'connected') return (
    <Badge variant="outline" className={cn('text-[10px] border-emerald-500/30 text-emerald-500')}>
      <CheckCircle className="h-2.5 w-2.5 mr-1" /> Connected
    </Badge>
  );
  if (status === 'error') return (
    <Badge variant="outline" className={cn('text-[10px] border-destructive/40 text-destructive')}>
      <XCircle className="h-2.5 w-2.5 mr-1" /> Error
    </Badge>
  );
  return <Badge variant="outline" className="text-[10px]">Pending</Badge>;
}

function TokenForm({ hint, value, onChange, busy, onCancel, onSave }: { hint: string; value: string; onChange: (v: string) => void; busy: boolean; onCancel: () => void; onSave: () => void }) {
  return (
    <div className="space-y-2 pt-2 border-t">
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <Input
        type="password"
        placeholder="Paste API token"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-[13px]"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={busy || !value.trim()} className="h-7 text-[11px]">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save & test'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 text-[11px]">Cancel</Button>
      </div>
    </div>
  );
}

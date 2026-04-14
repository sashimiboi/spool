'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Server, Key, Cpu, Bot, Scale, Plug, Terminal, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchApi, postApi } from '@/lib/api';

interface Settings {
  provider: string;
  model: string;
  ollama_url: string;
  anthropic_api_key_masked?: string;
}

interface OllamaStatus {
  status: string;
  models: string[];
  url: string;
}

interface AgentStatus {
  chat: {
    name: string;
    provider: string;
    model: string;
    connected: boolean;
    ollama_url?: string | null;
    has_key?: boolean | null;
    purpose: string;
    endpoint: string;
  };
  judge: {
    name: string;
    provider: string;
    model: string;
    connected: boolean;
    ollama_url: string;
    purpose: string;
    endpoint: string;
    note: string | null;
  };
  mcp: {
    name: string;
    transport: string;
    tools: string[];
    command: string;
    args: string[];
    purpose: string;
    connected: boolean;
  };
  ollama: {
    status: string;
    url: string;
    models: string[];
  };
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    provider: 'ollama', model: 'gemma3:4b', ollama_url: 'http://localhost:11434',
  });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [agents, setAgents] = useState<AgentStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o, a] = await Promise.all([
        fetchApi('/api/settings'),
        fetchApi('/api/settings/check-ollama'),
        fetchApi('/api/settings/agents'),
      ]);
      setSettings(s);
      setOllamaStatus(o);
      setAgents(a);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (updates: Record<string, string>) => {
    setSaving(true);
    setSaved(false);
    try {
      await postApi('/api/settings', updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      load();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" /></div>;
  }

  const isOllama = settings.provider === 'ollama';
  const isAnthropic = settings.provider === 'anthropic';

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Configure the Spool Assistant AI provider</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[13px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle className="h-3.5 w-3.5" /> Settings saved
        </div>
      )}

      {/* Agents overview */}
      {agents && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal flex items-center gap-2">
              <Bot className="h-3.5 w-3.5" /> Agents
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">Three Spool agents run side by side. Status updates live from the backend.</p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {/* Chat agent */}
            <AgentRow
              icon={Bot}
              name={agents.chat.name}
              role="CHAT"
              connected={agents.chat.connected}
              model={agents.chat.model}
              provider={agents.chat.provider}
              purpose={agents.chat.purpose}
              linkLabel="Open chat"
              linkHref={agents.chat.endpoint}
            />

            {/* Judge agent */}
            <AgentRow
              icon={Scale}
              name={agents.judge.name}
              role="JUDGE"
              connected={agents.judge.connected}
              model={agents.judge.model}
              provider="ollama"
              purpose={agents.judge.purpose}
              linkLabel="View evals"
              linkHref={agents.judge.endpoint}
              note={agents.judge.note}
            />

            {/* MCP server */}
            <AgentRow
              icon={Plug}
              name={agents.mcp.name}
              role="MCP"
              connected={agents.mcp.connected}
              model={`${agents.mcp.tools.length} tools · stdio`}
              provider="mcp"
              purpose={agents.mcp.purpose}
              linkLabel="Copy install command"
              copyValue={`claude mcp add spool ${agents.mcp.command} ${agents.mcp.args.join(' ')}`}
              copied={copiedCmd}
              onCopy={() => {
                navigator.clipboard.writeText(`claude mcp add spool ${agents.mcp.command} ${agents.mcp.args.join(' ')}`);
                setCopiedCmd(true);
                setTimeout(() => setCopiedCmd(false), 1800);
              }}
              tools={agents.mcp.tools}
            />
          </CardContent>
        </Card>
      )}

      {/* Provider selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5" /> AI Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => save({ provider: 'ollama' })}
              className={`p-3 rounded-lg border text-left transition-colors ${
                isOllama ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Server className="h-3.5 w-3.5" />
                <span className="font-medium text-[13px]">Ollama</span>
                <Badge variant="success" className="text-[10px]">Free</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Run models locally. No API key needed.</p>
            </button>

            <button
              onClick={() => save({ provider: 'anthropic' })}
              className={`p-3 rounded-lg border text-left transition-colors ${
                isAnthropic ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Key className="h-3.5 w-3.5" />
                <span className="font-medium text-[13px]">Anthropic</span>
                <Badge variant="default" className="text-[10px]">API Key</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Use Claude via API. Bring your own key.</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Ollama config */}
      {isOllama && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Ollama Configuration</CardTitle>
              {ollamaStatus && (
                ollamaStatus.status === 'connected'
                  ? <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" /> Connected</Badge>
                  : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Not Running</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-[13px] font-medium mb-1 block">Ollama URL</label>
              <div className="flex gap-2">
                <Input
                  value={settings.ollama_url || 'http://localhost:11434'}
                  onChange={(e) => setSettings({ ...settings, ollama_url: e.target.value })}
                />
                <Button variant="outline" size="sm" onClick={() => save({ ollama_url: settings.ollama_url })}>
                  Save
                </Button>
              </div>
            </div>

            <div>
              <label className="text-[13px] font-medium mb-1 block">Model</label>
              <div className="flex gap-2">
                <Input
                  value={settings.model || 'gemma3:4b'}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder="gemma3:4b"
                />
                <Button variant="outline" size="sm" onClick={() => save({ model: settings.model })}>
                  Save
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Pull models with: <code className="bg-secondary px-1 rounded text-[11px]">ollama pull gemma3:4b</code>
              </p>
            </div>

            {ollamaStatus && ollamaStatus.models.length > 0 && (
              <div>
                <label className="text-[13px] font-medium mb-1.5 block">Available Models</label>
                <div className="flex flex-wrap gap-1.5">
                  {ollamaStatus.models.map(m => (
                    <button
                      key={m}
                      onClick={() => save({ model: m })}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        settings.model === m
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-transparent border-border hover:bg-accent'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ollamaStatus && ollamaStatus.status === 'disconnected' && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[13px] text-foreground space-y-1">
                <p className="font-medium text-amber-600 dark:text-amber-400">Ollama is not running</p>
                <p className="text-muted-foreground">Install and start Ollama:</p>
                <code className="block bg-secondary rounded p-2 text-[11px] font-mono">
                  brew install ollama{'\n'}ollama serve{'\n'}ollama pull gemma3:4b
                </code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Chat provider config (below the agents card) */}
      {isAnthropic && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground normal-case tracking-normal">Anthropic Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-[13px] font-medium mb-1 block">API Key</label>
              {settings.anthropic_api_key_masked && (
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  Current key: <code className="bg-secondary px-1 rounded">{settings.anthropic_api_key_masked}</code>
                </p>
              )}
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { save({ anthropic_api_key: apiKey }); setApiKey(''); }}
                  disabled={!apiKey}
                >
                  Save
                </Button>
              </div>
            </div>

            <div>
              <label className="text-[13px] font-medium mb-1.5 block">Model</label>
              <div className="flex flex-wrap gap-1.5">
                {['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514'].map(m => (
                  <button
                    key={m}
                    onClick={() => save({ model: m })}
                    className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                      settings.model === m
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent border-border hover:bg-accent'
                    }`}
                  >
                    {m.replace('claude-', '').replace(/-\d+$/, '')}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


interface AgentRowProps {
  icon: React.ElementType;
  name: string;
  role: string;
  connected: boolean;
  model: string;
  provider: string;
  purpose: string;
  linkLabel?: string;
  linkHref?: string;
  copyValue?: string;
  copied?: boolean;
  onCopy?: () => void;
  note?: string | null;
  tools?: string[];
}

function AgentRow({
  icon: Icon,
  name,
  role,
  connected,
  model,
  provider,
  purpose,
  linkLabel,
  linkHref,
  copyValue,
  copied,
  onCopy,
  note,
  tools,
}: AgentRowProps) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border bg-card/50">
      <div className={cn(
        'mt-0.5 p-1.5 rounded-md border',
        connected ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'
      )}>
        <Icon className={cn('h-3.5 w-3.5', connected ? 'text-emerald-500' : 'text-amber-500')} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-foreground">{name}</span>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{role}</Badge>
          <Badge variant={connected ? 'success' : 'destructive'} className="text-[10px]">
            <span className={cn(
              'inline-block h-1.5 w-1.5 rounded-full mr-1',
              connected ? 'bg-emerald-500' : 'bg-amber-500',
            )} />
            {connected ? 'Connected' : 'Offline'}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{purpose}</p>
        <div className="flex items-center gap-2 mt-1.5 flex-wrap text-[11px]">
          <span className="text-muted-foreground">Model:</span>
          <code className="bg-secondary px-1.5 py-0.5 rounded font-mono text-[11px]">{model}</code>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">Provider:</span>
          <code className="bg-secondary px-1.5 py-0.5 rounded font-mono text-[11px]">{provider}</code>
        </div>
        {note && (
          <p className="mt-1.5 text-[11px] text-amber-500/90">{note}</p>
        )}
        {tools && tools.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tools.map(t => (
              <code key={t} className="text-[10px] bg-secondary px-1.5 py-0.5 rounded font-mono">{t}</code>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          {linkHref && (
            <Button asChild size="sm" variant="outline" className="h-7 text-[11px]">
              <a href={linkHref}>{linkLabel || 'Open'}</a>
            </Button>
          )}
          {copyValue && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onCopy}>
              {copied ? <Check className="h-3 w-3 mr-1 text-emerald-500" /> : <Terminal className="h-3 w-3 mr-1" />}
              {copied ? 'Copied!' : (linkLabel || 'Copy command')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

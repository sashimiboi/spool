'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckCircle, XCircle, Server, Key, Cpu } from 'lucide-react';
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

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Settings>({
    provider: 'ollama', model: 'gemma3:4b', ollama_url: 'http://localhost:11434',
  });
  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([
        fetchApi('/api/settings'),
        fetchApi('/api/settings/check-ollama'),
      ]);
      setSettings(s);
      setOllamaStatus(o);
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
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  const isOllama = settings.provider === 'ollama';
  const isAnthropic = settings.provider === 'anthropic';

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure the Spool Assistant AI provider</p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          <CheckCircle className="h-4 w-4" /> Settings saved
        </div>
      )}

      {/* Provider selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-foreground flex items-center gap-2">
            <Cpu className="h-4 w-4" /> AI Provider
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => save({ provider: 'ollama' })}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                isOllama ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Server className="h-4 w-4" />
                <span className="font-semibold text-sm">Ollama</span>
                <Badge variant="success" className="text-[10px]">Free</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Run models locally. No API key needed.</p>
            </button>

            <button
              onClick={() => save({ provider: 'anthropic' })}
              className={`p-4 rounded-lg border-2 text-left transition-colors ${
                isAnthropic ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Key className="h-4 w-4" />
                <span className="font-semibold text-sm">Anthropic</span>
                <Badge variant="info" className="text-[10px]">API Key</Badge>
              </div>
              <p className="text-xs text-muted-foreground">Use Claude via API. Bring your own key.</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Ollama config */}
      {isOllama && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-foreground">Ollama Configuration</CardTitle>
              {ollamaStatus && (
                ollamaStatus.status === 'connected'
                  ? <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" /> Connected</Badge>
                  : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Not Running</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Ollama URL</label>
              <div className="flex gap-2">
                <Input
                  value={settings.ollama_url || 'http://localhost:11434'}
                  onChange={(e) => setSettings({ ...settings, ollama_url: e.target.value })}
                />
                <Button variant="outline" onClick={() => save({ ollama_url: settings.ollama_url })}>
                  Save
                </Button>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Model</label>
              <div className="flex gap-2">
                <Input
                  value={settings.model || 'gemma3:4b'}
                  onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                  placeholder="gemma3:4b"
                />
                <Button variant="outline" onClick={() => save({ model: settings.model })}>
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Pull models with: <code className="bg-muted px-1 rounded">ollama pull gemma3:4b</code>
              </p>
            </div>

            {ollamaStatus && ollamaStatus.models.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Available Models</label>
                <div className="flex flex-wrap gap-2">
                  {ollamaStatus.models.map(m => (
                    <button
                      key={m}
                      onClick={() => save({ model: m })}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        settings.model === m
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border hover:bg-muted'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ollamaStatus && ollamaStatus.status === 'disconnected' && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 space-y-1">
                <p className="font-medium">Ollama is not running</p>
                <p>Install and start Ollama:</p>
                <code className="block bg-amber-100 rounded p-2 text-xs">
                  brew install ollama{'\n'}ollama serve{'\n'}ollama pull gemma3:4b
                </code>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Anthropic config */}
      {isAnthropic && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">Anthropic Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">API Key</label>
              {settings.anthropic_api_key_masked && (
                <p className="text-xs text-muted-foreground mb-2">
                  Current key: <code className="bg-muted px-1 rounded">{settings.anthropic_api_key_masked}</code>
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
                  onClick={() => { save({ anthropic_api_key: apiKey }); setApiKey(''); }}
                  disabled={!apiKey}
                >
                  Save
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Get your key at <span className="font-medium">console.anthropic.com</span>
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Model</label>
              <div className="flex flex-wrap gap-2">
                {['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001', 'claude-opus-4-20250514'].map(m => (
                  <button
                    key={m}
                    onClick={() => save({ model: m })}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      settings.model === m
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { CheckCircle, XCircle, Plus, Info } from 'lucide-react';
import { fetchApi, postApi, deleteApi } from '@/lib/api';

interface Provider {
  id: string; name: string; type: string; status: string;
  data_path: string; icon: string; session_count: number;
  last_synced_at: string | null; description: string;
}

interface AvailableProvider {
  type: string; name: string; icon: string;
  default_path: string; description: string; connected: boolean;
}

const COLORS: Record<string, string> = {
  claude: 'bg-amber-500', openai: 'bg-emerald-500', github: 'bg-indigo-500',
  cursor: 'bg-violet-500', windsurf: 'bg-cyan-500',
};
const LABELS: Record<string, string> = {
  claude: 'CL', openai: 'AI', github: 'GH', cursor: 'CU', windsurf: 'WS',
};

function Avatar({ icon }: { icon: string }) {
  return (
    <div className={`w-10 h-10 rounded-xl ${COLORS[icon] || 'bg-gray-500'} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
      {LABELS[icon] || icon.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function ConnectionsPage() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [available, setAvailable] = useState<AvailableProvider[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<AvailableProvider | null>(null);
  const [customPath, setCustomPath] = useState('');

  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([fetchApi('/api/providers'), fetchApi('/api/providers/available')]);
      setProviders(p); setAvailable(a);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    if (!selectedType) return;
    await postApi('/api/providers', { type: selectedType.type, data_path: customPath || selectedType.default_path });
    setModalOpen(false); setSelectedType(null); setCustomPath('');
    load();
  };

  const disconnect = async (id: string) => { await deleteApi(`/api/providers/${id}`); load(); };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;

  const unconnected = available.filter(a => !a.connected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
        {unconnected.length > 0 && (
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Add Connection
          </Button>
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        Connect your AI coding tools to track sessions across all providers in one place. Spool reads local session data - nothing is sent to external servers.
      </div>

      {/* Connected */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Connected</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {providers.map(p => (
            <Card key={p.id}>
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-center gap-3">
                  <Avatar icon={p.icon || 'claude'} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.data_path}</div>
                  </div>
                  {p.status === 'connected'
                    ? <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" /> Connected</Badge>
                    : <Badge variant="warning"><XCircle className="h-3 w-3 mr-1" /> Disconnected</Badge>
                  }
                </div>
                <div className="flex gap-6 text-sm">
                  <div><span className="text-xs text-muted-foreground block">Sessions</span><span className="font-medium">{p.session_count || 0}</span></div>
                  <div><span className="text-xs text-muted-foreground block">Last Synced</span><span className="font-medium">{p.last_synced_at ? new Date(p.last_synced_at).toLocaleDateString() : 'Never'}</span></div>
                </div>
                {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                <Button variant="outline" size="sm" onClick={() => disconnect(p.id)}>Disconnect</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Available */}
      {unconnected.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Available</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unconnected.map(a => (
              <Card key={a.type}>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar icon={a.icon} />
                    <div><div className="font-semibold">{a.name}</div><div className="text-xs text-muted-foreground">{a.default_path}</div></div>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  <Button size="sm" onClick={() => { setSelectedType(a); setCustomPath(''); setModalOpen(true); }}>
                    <Plus className="h-3 w-3 mr-1" /> Connect
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={(o) => { setModalOpen(o); if (!o) setSelectedType(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedType ? `Connect ${selectedType.name}` : 'Add Connection'}</DialogTitle>
            <DialogDescription>
              {selectedType ? selectedType.description : 'Select a provider to connect.'}
            </DialogDescription>
          </DialogHeader>
          {!selectedType ? (
            <div className="space-y-2">
              {unconnected.map(a => (
                <button
                  key={a.type}
                  onClick={() => { setSelectedType(a); setCustomPath(''); }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left"
                >
                  <Avatar icon={a.icon} />
                  <div><div className="font-medium text-sm">{a.name}</div><div className="text-xs text-muted-foreground">{a.description}</div></div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Avatar icon={selectedType.icon} />
                <span className="font-semibold">{selectedType.name}</span>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Data Path</label>
                <Input value={customPath || selectedType.default_path} onChange={(e) => setCustomPath(e.target.value)} />
                <p className="text-xs text-muted-foreground mt-1">Path to the directory where session data is stored.</p>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setModalOpen(false); setSelectedType(null); }}>Cancel</Button>
                <Button onClick={connect}>Connect</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

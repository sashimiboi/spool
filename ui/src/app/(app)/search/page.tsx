'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search as SearchIcon } from 'lucide-react';
import { fetchApi, cleanProject } from '@/lib/api';

interface SearchResult {
  content: string;
  role: string;
  project: string;
  timestamp: string;
  session_id: string;
  similarity: number;
  title: string;
}

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      setResults(await fetchApi(`/api/search?q=${encodeURIComponent(query)}&limit=15`));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Search</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">Semantic search across all your coding sessions.</p>
      </div>

      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="What did I work on related to..."
          onKeyDown={(e) => { if (e.key === 'Enter') doSearch(); }}
          className="flex-1"
        />
        <Button onClick={doSearch} disabled={loading}>
          <SearchIcon className="h-3.5 w-3.5 mr-1.5" />
          {loading ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="py-12 text-center text-muted-foreground text-[13px] rounded-lg border bg-card">
          No results found. Try a different query.
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">{results.length} results</p>
          {results.map((r, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="success">{(r.similarity * 100).toFixed(1)}%</Badge>
                <Badge variant={r.role === 'user' ? 'default' : 'secondary'}>{r.role}</Badge>
                <span className="text-[11px] text-muted-foreground">{cleanProject(r.project || '')}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {r.timestamp ? new Date(r.timestamp).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  }) : ''}
                </span>
              </div>
              {r.title && <p className="text-[11px] text-muted-foreground">Session: {r.title}</p>}
              <div className="p-2.5 bg-secondary/50 rounded text-[13px] leading-relaxed whitespace-pre-wrap">
                {r.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

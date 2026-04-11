'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">Search across all your coding sessions using natural language.</p>
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
          <SearchIcon className="h-4 w-4 mr-2" />
          {loading ? 'Searching...' : 'Search'}
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            No results found. Try a different query.
          </CardContent>
        </Card>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{results.length} results</p>
          {results.map((r, i) => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="success">{(r.similarity * 100).toFixed(1)}%</Badge>
                  <Badge variant={r.role === 'user' ? 'info' : 'secondary'}>{r.role}</Badge>
                  <span className="text-xs text-muted-foreground">{cleanProject(r.project || '')}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.timestamp ? new Date(r.timestamp).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    }) : ''}
                  </span>
                </div>
                {r.title && <p className="text-xs text-muted-foreground">Session: {r.title}</p>}
                <div className="p-3 bg-muted/30 rounded-md text-[13px] leading-relaxed whitespace-pre-wrap">
                  {r.content}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

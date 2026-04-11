'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Loader2, Settings, Plus, Trash2, MessageSquare } from 'lucide-react';
import { fetchApi, postApi, deleteApi } from '@/lib/api';
import { useRouter } from 'next/navigation';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  model: string;
  provider: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

const SUGGESTIONS = [
  'What did I work on this week?',
  'How much have I spent on Claude?',
  'Which project has the most sessions?',
  'What tools do I use most?',
  'Summarize my recent coding activity',
  'What was my last session about?',
];

export default function ChatPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [modelInfo, setModelInfo] = useState<{ provider: string; model: string } | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatSession[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load settings + chat history
  useEffect(() => {
    fetchApi('/api/settings').then((s) => {
      setModelInfo({ provider: s.provider || 'ollama', model: s.model || 'gemma3:4b' });
    }).catch(() => {});
    loadHistory();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      setHistory(await fetchApi('/api/chat/sessions?limit=30'));
    } catch (e) { console.error(e); }
  };

  const send = async (text?: string) => {
    const msg = text || input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', content: msg };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const data = await postApi('/api/chat', {
        messages: newMessages,
        chat_session_id: chatSessionId,
      });
      setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      if (data.chat_session_id) {
        setChatSessionId(data.chat_session_id);
      }
      loadHistory();
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: 'Failed to get response. Check that the API server is running.' }]);
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (id: string) => {
    try {
      const data = await fetchApi(`/api/chat/sessions/${id}`);
      if (data.messages) {
        setMessages(data.messages.map((m: any) => ({ role: m.role, content: m.content })));
        setChatSessionId(id);
      }
    } catch (e) { console.error(e); }
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteApi(`/api/chat/sessions/${id}`);
      if (chatSessionId === id) {
        newChat();
      }
      loadHistory();
    } catch (e) { console.error(e); }
  };

  const newChat = () => {
    setMessages([]);
    setChatSessionId(null);
  };

  return (
    <div className="flex h-[calc(100vh-48px)] gap-4">
      {/* Chat history sidebar */}
      <div className="w-56 shrink-0 flex flex-col border-r border-border pr-4">
        <Button variant="outline" size="sm" className="w-full mb-3" onClick={newChat}>
          <Plus className="h-3.5 w-3.5 mr-1.5" /> New Chat
        </Button>

        <div className="flex-1 overflow-auto space-y-0.5">
          {history.map((s) => (
            <div
              key={s.id}
              onClick={() => loadSession(s.id)}
              className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors text-left ${
                chatSessionId === s.id
                  ? 'bg-muted text-foreground'
                  : 'hover:bg-muted/50 text-muted-foreground'
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.title || 'Untitled'}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(s.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' \u00B7 '}
                  {s.message_count} msgs
                </div>
              </div>
              <button
                onClick={(e) => deleteSession(s.id, e)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                title="Delete chat"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          {history.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No chat history yet</p>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Chat</h1>
            <p className="text-sm text-muted-foreground">Ask questions about your coding sessions</p>
          </div>
          <div className="flex items-center gap-2">
            {modelInfo && (
              <button
                onClick={() => router.push('/settings')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border bg-background hover:bg-muted transition-colors text-xs"
                title="Change model in Settings"
              >
                <div className={`w-1.5 h-1.5 rounded-full ${modelInfo.provider === 'anthropic' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span className="text-muted-foreground">{modelInfo.provider === 'anthropic' ? 'Anthropic' : 'Ollama'}</span>
                <span className="font-medium text-foreground">{modelInfo.model.replace('claude-', '').replace(/-\d+$/, '')}</span>
                <Settings className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto space-y-4 pb-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Bot className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Spool Assistant</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  I can help you explore your coding session history, usage stats, and costs.
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="px-3 py-1.5 text-xs rounded-full border border-border bg-background hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[75%] ${
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-2.5'
                  : 'bg-muted/50 rounded-2xl rounded-bl-md px-4 py-2.5'
              }`}>
                <div className="text-[14px] leading-relaxed whitespace-pre-wrap">{m.content}</div>
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted/50 rounded-2xl rounded-bl-md px-4 py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t pt-4">
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask about your sessions..."
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={() => send()} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

CREATE EXTENSION IF NOT EXISTS vector;

-- Sessions parsed from AI coding tools
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    provider_id TEXT DEFAULT 'claude-code',
    project TEXT,
    cwd TEXT,
    git_branch TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    message_count INTEGER DEFAULT 0,
    tool_call_count INTEGER DEFAULT 0,
    estimated_input_tokens INTEGER DEFAULT 0,
    estimated_output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    claude_version TEXT,
    model TEXT,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_provider ON sessions(provider_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);

-- Individual messages within a session
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,  -- user, assistant
    content TEXT,
    timestamp TIMESTAMPTZ,
    tools_used JSONB DEFAULT '[]',
    cwd TEXT,
    git_branch TEXT,
    estimated_tokens INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- Tool calls extracted from assistant messages
CREATE TABLE IF NOT EXISTS tool_calls (
    id SERIAL PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    tool_input TEXT,
    tool_result_preview TEXT,
    timestamp TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_name);

-- Embeddings for semantic search
CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT,
    content TEXT NOT NULL,
    role TEXT,
    project TEXT,
    timestamp TIMESTAMPTZ,
    embedding vector(384),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chunks_session ON chunks(session_id);
CREATE INDEX IF NOT EXISTS idx_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Providers / connections for multi-tool support
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- claude-code, codex, copilot, cursor, windsurf, custom
    status TEXT DEFAULT 'connected',  -- connected, disconnected, error
    data_path TEXT,  -- where session data lives on disk
    icon TEXT,
    config JSONB DEFAULT '{}',
    session_count INTEGER DEFAULT 0,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed Claude Code as default provider
INSERT INTO providers (id, name, type, data_path, icon, status)
VALUES ('claude-code', 'Claude Code', 'claude-code', '~/.claude/projects', 'claude', 'connected')
ON CONFLICT (id) DO NOTHING;

-- Chat sessions with the Spool assistant
CREATE TABLE IF NOT EXISTS chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    model TEXT,
    provider TEXT,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    chat_session_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(chat_session_id);

-- Sync state to track what's been ingested
CREATE TABLE IF NOT EXISTS sync_state (
    file_path TEXT PRIMARY KEY,
    provider_id TEXT DEFAULT 'claude-code',
    last_size BIGINT DEFAULT 0,
    last_synced_at TIMESTAMPTZ DEFAULT now()
);

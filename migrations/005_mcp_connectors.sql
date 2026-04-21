-- MCP connectors (external agents Spool's chat agent can pull tools from).
-- Examples: Linear, Notion, Slack, custom MCP servers. Separate from the
-- `providers` table (AI coding tools whose sessions we ingest).

CREATE TABLE IF NOT EXISTS mcp_connectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    auth_header TEXT,
    transport TEXT NOT NULL DEFAULT 'streamable-http',
    status TEXT NOT NULL DEFAULT 'disconnected',
    last_error TEXT,
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

# Spool

Local session tracker and semantic search for AI coding assistants.

Track your Claude Code sessions (and eventually Codex, Copilot, Cursor, Windsurf) with usage stats, cost estimates, semantic search via pgvector, and a built-in AI chat agent to explore your history.

**Website:** [spooling.ai](https://spooling.ai)

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Docker** (for PostgreSQL + pgvector)
- **Ollama** (optional, for free local AI chat) or an **Anthropic API key**

---

## Quick Start

```bash
git clone <repo-url> spool
cd spool

# 1. Start the database
docker compose up -d

#docker-compose up -d  

# 2. Install Python backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .

# 3. Sync your Claude Code sessions
spool sync

# 4. Install UI dependencies
cd ui && npm install && cd ..

# 5. Start everything
spool serve &       # API on http://127.0.0.1:3002
cd ui && npm run dev # UI on http://localhost:3003
```

Open **http://localhost:3003** and you're in.

---

## CLI Usage

All CLI commands require the venv to be active and the database running.

```bash
source .venv/bin/activate
```

### `spool init`

Check database connection and detect Claude Code sessions.

```bash
spool init
```

### `spool sync`

Parse and ingest all Claude Code sessions into the database. Chunks and embeds message content into pgvector for semantic search.

```bash
spool sync              # Full sync with embeddings
spool sync --no-embed   # Skip embeddings (faster)
```

### `spool stats`

Show usage statistics - sessions, messages, tool calls, tokens, costs, broken down by project and day.

```bash
spool stats             # Overview + last 7 days
spool stats --week      # Weekly breakdown
spool stats --days 30   # Last 30 days
```

### `spool search <query>`

Semantic search across all your session history using natural language.

```bash
spool search "snowflake connector"
spool search "authentication bug" -n 5
spool search "database migration" -p ~/myproject
```

Options:
- `-n, --limit` - Number of results (default: 10)
- `-p, --project` - Filter by project name

### `spool watch`

Watch the Claude Code directory for new session data and auto-sync in real time.

```bash
spool watch
```

### `spool serve`

Start the API server only (for when you want to run the UI separately).

```bash
spool serve                    # Default: http://127.0.0.1:3002
spool serve --port 8080        # Custom port
spool serve --host 0.0.0.0     # Bind to all interfaces
```

### `spool ui`

Start both the API server and the Next.js UI together.

```bash
spool ui
```

---

## Web UI

The web dashboard runs on **http://localhost:3003** and includes:

| Page | Description |
|------|-------------|
| **Dashboard** | Overview stats, daily activity chart, projects, top tools, recent sessions |
| **Sessions** | Browse all sessions with filtering, click into any session for full conversation view |
| **Search** | Semantic search across all session history with similarity scores |
| **Analytics** | Charts for daily usage, cost trends, token usage, tool distribution (AG Charts) |
| **Chat** | AI assistant that can answer questions about your session data (RAG-powered) |
| **Connections** | Connect/disconnect AI coding tools (Claude Code, Codex, Copilot, Cursor, Windsurf) |
| **Settings** | Configure the AI chat provider (Ollama or Anthropic) |

### Running the UI

```bash
# Terminal 1: API server
source .venv/bin/activate
spool serve

# Terminal 2: Next.js dev server
cd ui
npm run dev
```

Or use `spool ui` to start both at once.

---

## Chat Agent Setup

The chat page lets you ask questions about your coding sessions in natural language. It uses RAG - retrieves relevant context from pgvector before answering.

### Option A: Ollama (free, local)

```bash
# Install Ollama
brew install ollama

# Start the server
ollama serve

# Pull a model
ollama pull gemma3:4b
```

Go to **Settings** in the UI and select Ollama. The model will auto-detect.

### Option B: Anthropic API (bring your own key)

Go to **Settings** in the UI, select Anthropic, and paste your API key from [console.anthropic.com](https://console.anthropic.com).

Available models: Sonnet, Haiku, Opus.

---

## Architecture

```
spool/
├── docker-compose.yml       # PostgreSQL + pgvector
├── init.sql                 # Database schema
├── pyproject.toml           # Python package config
├── spool/                   # Python backend
│   ├── cli.py               # Click CLI
│   ├── config.py            # Configuration
│   ├── db.py                # Database connection
│   ├── parser.py            # Claude Code JSONL parser
│   ├── embeddings.py        # sentence-transformers (all-MiniLM-L6-v2)
│   ├── ingest.py            # Sync pipeline
│   ├── search.py            # pgvector semantic search
│   ├── stats.py             # Usage statistics
│   ├── watcher.py           # File watcher (watchdog)
│   ├── agent.py             # Chat agent (Ollama + Anthropic)
│   └── server.py            # FastAPI API server
└── ui/                      # Next.js frontend
    ├── next.config.js       # API proxy to :3002
    └── src/
        ├── components/      # shadcn/ui components
        ├── lib/             # API helpers
        └── app/(app)/       # Pages (dashboard, sessions, search, etc.)
```

### Stack

| Layer | Technology |
|-------|-----------|
| Database | PostgreSQL 16 + pgvector (Docker) |
| Embeddings | sentence-transformers / all-MiniLM-L6-v2 (local) |
| Backend | Python, FastAPI, Click |
| Frontend | Next.js 14, shadcn/ui, Tailwind CSS, AG Charts |
| Chat AI | Ollama (local) or Anthropic API |

### Ports

| Service | Port |
|---------|------|
| PostgreSQL | 5434 |
| API Server | 3002 |
| Web UI | 3003 |

---

## Environment Variables

All optional - defaults work out of the box for local development.

| Variable | Default | Description |
|----------|---------|-------------|
| `SPOOL_DB_HOST` | `localhost` | Database host |
| `SPOOL_DB_PORT` | `5434` | Database port |
| `SPOOL_DB_NAME` | `spool` | Database name |
| `SPOOL_DB_USER` | `spool` | Database user |
| `SPOOL_DB_PASSWORD` | `spool` | Database password |
| `SPOOL_EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | Sentence transformer model |
| `SPOOL_UI_HOST` | `127.0.0.1` | API server host |
| `ANTHROPIC_API_KEY` | - | Anthropic API key (alternative to setting in UI) |

---

## Data Sources

Spool reads Claude Code session data from `~/.claude/projects/`. Each session is a UUID-named JSONL file containing the full conversation history with timestamps, tool calls, git context, and file changes.

No data is sent to external servers. Everything runs locally.

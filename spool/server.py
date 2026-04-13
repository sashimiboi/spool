"""FastAPI server for Spool API."""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from spool.stats import get_overview, get_daily_stats, get_session_detail, get_provider_breakdown
from spool.search import search as do_search
from spool.db import get_connection

app = FastAPI(title="Spool", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3003", "http://127.0.0.1:3003"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Overview / Stats ---

@app.get("/api/overview")
async def api_overview(provider: str | None = Query(default=None)):
    return get_overview(provider=provider)


@app.get("/api/daily")
async def api_daily(days: int = Query(default=14), provider: str | None = Query(default=None)):
    return get_daily_stats(days=days, provider=provider)


@app.get("/api/stats/providers")
async def api_provider_breakdown():
    return get_provider_breakdown()


@app.get("/api/sessions")
async def api_sessions(limit: int = Query(default=50), provider: str | None = Query(default=None)):
    conn = get_connection()
    if provider:
        rows = conn.execute(
            """SELECT id, provider_id, project, cwd, git_branch, started_at, ended_at,
                      message_count, tool_call_count, estimated_input_tokens,
                      estimated_output_tokens, estimated_cost_usd, claude_version, model, title
               FROM sessions WHERE provider_id = %s ORDER BY started_at DESC LIMIT %s""",
            (provider, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT id, provider_id, project, cwd, git_branch, started_at, ended_at,
                      message_count, tool_call_count, estimated_input_tokens,
                      estimated_output_tokens, estimated_cost_usd, claude_version, model, title
               FROM sessions ORDER BY started_at DESC LIMIT %s""",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/session/{session_id}")
async def api_session(session_id: str):
    detail = get_session_detail(session_id)
    if not detail:
        return {"error": "Session not found"}
    return detail


# --- Search ---

@app.get("/api/search")
async def api_search(
    q: str = Query(...),
    limit: int = Query(default=10),
    project: str | None = Query(default=None),
):
    return do_search(q, limit=limit, project=project)


# --- Providers / Connections ---

PROVIDER_TEMPLATES = {
    "claude-code": {
        "name": "Claude Code",
        "icon": "claude",
        "default_path": "~/.claude/projects",
        "description": "Anthropic's CLI for Claude - tracks sessions from the terminal and IDE extensions.",
        "status_hint": "Auto-detected from ~/.claude/",
    },
    "codex": {
        "name": "OpenAI Codex CLI",
        "icon": "openai",
        "default_path": "~/.codex/sessions",
        "description": "OpenAI's coding agent CLI. JSONL session logs organized by date.",
        "status_hint": "Auto-detected from ~/.codex/sessions/",
    },
    "copilot": {
        "name": "GitHub Copilot",
        "icon": "github",
        "default_path": "~/Library/Application Support/Code/User/workspaceStorage",
        "description": "GitHub Copilot Chat sessions from VS Code. Reads chatSessions per workspace.",
        "status_hint": "Auto-detected from VS Code workspaceStorage.",
    },
    "cursor": {
        "name": "Cursor",
        "icon": "cursor",
        "default_path": "~/Library/Application Support/Cursor/User/workspaceStorage",
        "description": "Cursor AI editor. Tracks chat and composer/agent interactions from SQLite.",
        "status_hint": "Auto-detected from Cursor Application Support.",
    },
    "windsurf": {
        "name": "Windsurf",
        "icon": "windsurf",
        "default_path": "~/Library/Application Support/Windsurf/User/workspaceStorage",
        "description": "Codeium's Windsurf editor. Tracks chat and Cascade agent sessions from SQLite.",
        "status_hint": "Auto-detected from Windsurf Application Support.",
    },
}


@app.get("/api/providers")
async def api_providers():
    """Get all configured providers with status=connected."""
    conn = get_connection()
    rows = conn.execute(
        """SELECT id, name, type, status, data_path, icon, config,
                  session_count, last_synced_at, created_at
           FROM providers WHERE status = 'connected' ORDER BY created_at"""
    ).fetchall()
    conn.close()

    providers = [dict(r) for r in rows]

    for p in providers:
        tmpl = PROVIDER_TEMPLATES.get(p["type"], {})
        p["description"] = tmpl.get("description", "")
        p["status_hint"] = tmpl.get("status_hint", "")

    return providers


@app.get("/api/providers/available")
async def api_available_providers():
    """Get all available provider types that can be connected."""
    from spool.providers import get_all_providers

    conn = get_connection()
    existing = conn.execute("SELECT type FROM providers WHERE status = 'connected'").fetchall()
    conn.close()
    existing_types = {r["type"] for r in existing}

    all_providers = get_all_providers()
    available = []
    for type_id, tmpl in PROVIDER_TEMPLATES.items():
        provider = all_providers.get(type_id)
        detected = provider.is_available() if provider else False
        file_count = len(provider.discover_session_files()) if (provider and detected) else 0
        available.append({
            "type": type_id,
            "name": tmpl["name"],
            "icon": tmpl["icon"],
            "default_path": tmpl["default_path"],
            "description": tmpl["description"],
            "connected": type_id in existing_types,
            "detected": detected,
            "file_count": file_count,
        })
    return available


class ProviderCreate(BaseModel):
    type: str
    data_path: str | None = None


@app.post("/api/providers")
async def api_create_provider(body: ProviderCreate):
    """Connect a new provider."""
    tmpl = PROVIDER_TEMPLATES.get(body.type)
    if not tmpl:
        return {"error": f"Unknown provider type: {body.type}"}

    provider_id = body.type
    data_path = body.data_path or tmpl["default_path"]

    conn = get_connection()
    conn.execute(
        """INSERT INTO providers (id, name, type, data_path, icon, status)
           VALUES (%s, %s, %s, %s, %s, 'connected')
           ON CONFLICT (id) DO UPDATE SET data_path = %s, status = 'connected'""",
        (provider_id, tmpl["name"], body.type, data_path, tmpl["icon"], data_path),
    )
    conn.commit()
    conn.close()

    return {"id": provider_id, "name": tmpl["name"], "status": "connected"}


class SyncRequest(BaseModel):
    provider: str | None = None
    embed: bool = False


@app.post("/api/sync")
async def api_sync(body: SyncRequest):
    """Trigger a sync for all or a specific provider."""
    from spool.ingest import sync as do_sync
    import threading

    # Run sync in a background thread so the API doesn't block
    result = {"status": "syncing", "provider": body.provider or "all"}

    def run_sync():
        try:
            do_sync(embed=body.embed, provider_filter=body.provider)
        except Exception as e:
            print(f"Sync error: {e}")

    thread = threading.Thread(target=run_sync, daemon=True)
    thread.start()
    # Wait briefly so fast syncs complete before response
    thread.join(timeout=30)

    if thread.is_alive():
        return {"status": "syncing", "message": "Sync is running in the background"}

    return {"status": "complete", "message": "Sync finished"}


@app.post("/api/providers/{provider_id}/sync")
async def api_sync_provider(provider_id: str):
    """Trigger a sync for a specific provider."""
    from spool.ingest import sync as do_sync
    import threading

    def run_sync():
        try:
            do_sync(embed=False, provider_filter=provider_id)
        except Exception as e:
            print(f"Sync error for {provider_id}: {e}")

    thread = threading.Thread(target=run_sync, daemon=True)
    thread.start()
    thread.join(timeout=30)

    if thread.is_alive():
        return {"status": "syncing", "message": f"Syncing {provider_id} in the background"}

    return {"status": "complete", "message": f"Sync for {provider_id} finished"}


@app.delete("/api/providers/{provider_id}")
async def api_delete_provider(provider_id: str):
    """Disconnect a provider."""
    conn = get_connection()
    conn.execute("UPDATE providers SET status = 'disconnected' WHERE id = %s", (provider_id,))
    conn.commit()
    conn.close()
    return {"status": "disconnected"}


# --- Tool usage breakdown ---

@app.get("/api/tools")
async def api_tools(limit: int = Query(default=20), provider: str | None = Query(default=None)):
    conn = get_connection()
    if provider:
        rows = conn.execute(
            """SELECT tc.tool_name, COUNT(*) AS uses,
                      COUNT(DISTINCT tc.session_id) AS sessions
               FROM tool_calls tc
               JOIN sessions s ON s.id = tc.session_id
               WHERE s.provider_id = %s
               GROUP BY tc.tool_name ORDER BY uses DESC LIMIT %s""",
            (provider, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT tool_name, COUNT(*) AS uses,
                      COUNT(DISTINCT session_id) AS sessions
               FROM tool_calls GROUP BY tool_name ORDER BY uses DESC LIMIT %s""",
            (limit,),
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# --- Chat Agent ---

class ChatRequest(BaseModel):
    messages: list[dict]
    provider: str | None = None
    chat_session_id: str | None = None


@app.post("/api/chat")
async def api_chat(body: ChatRequest):
    import uuid
    from spool.agent import chat

    response = await chat(body.messages, provider=body.provider)

    # Persist chat session
    conn = get_connection()
    session_id = body.chat_session_id or str(uuid.uuid4())

    # Get settings for model/provider info
    settings_row = conn.execute(
        "SELECT config FROM providers WHERE id = 'spool-agent'"
    ).fetchone()
    config = (settings_row["config"] if settings_row and isinstance(settings_row.get("config"), dict) else {}) if settings_row else {}
    prov = config.get("provider", "ollama")
    model = config.get("model", "gemma3:4b")

    # Create or update chat session
    if not body.chat_session_id:
        # New session - title from first user message
        first_msg = body.messages[0]["content"] if body.messages else "New chat"
        title = first_msg[:80].replace("\n", " ").strip()
        conn.execute(
            """INSERT INTO chat_sessions (id, title, model, provider, message_count)
               VALUES (%s, %s, %s, %s, 2)
               ON CONFLICT (id) DO UPDATE SET updated_at = now(), message_count = chat_sessions.message_count + 2""",
            (session_id, title, model, prov),
        )
    else:
        conn.execute(
            "UPDATE chat_sessions SET updated_at = now(), message_count = message_count + 2 WHERE id = %s",
            (session_id,),
        )

    # Save user message + assistant response
    last_user = body.messages[-1] if body.messages else None
    if last_user:
        conn.execute(
            "INSERT INTO chat_messages (chat_session_id, role, content) VALUES (%s, %s, %s)",
            (session_id, "user", last_user["content"]),
        )
    conn.execute(
        "INSERT INTO chat_messages (chat_session_id, role, content) VALUES (%s, %s, %s)",
        (session_id, "assistant", response),
    )
    conn.commit()
    conn.close()

    return {"response": response, "chat_session_id": session_id}


# --- Chat Session History ---

@app.get("/api/chat/sessions")
async def api_chat_sessions(limit: int = Query(default=30)):
    conn = get_connection()
    rows = conn.execute(
        """SELECT id, title, model, provider, message_count, created_at, updated_at
           FROM chat_sessions ORDER BY updated_at DESC LIMIT %s""",
        (limit,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/chat/sessions/{session_id}")
async def api_chat_session(session_id: str):
    conn = get_connection()
    session = conn.execute(
        "SELECT id, title, model, provider, message_count, created_at FROM chat_sessions WHERE id = %s",
        (session_id,),
    ).fetchone()
    if not session:
        conn.close()
        return {"error": "Chat session not found"}

    messages = conn.execute(
        "SELECT role, content, created_at FROM chat_messages WHERE chat_session_id = %s ORDER BY created_at",
        (session_id,),
    ).fetchall()
    conn.close()

    return {
        "session": dict(session),
        "messages": [dict(m) for m in messages],
    }


@app.delete("/api/chat/sessions/{session_id}")
async def api_delete_chat_session(session_id: str):
    conn = get_connection()
    conn.execute("DELETE FROM chat_sessions WHERE id = %s", (session_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}


# --- Settings ---

class SettingsUpdate(BaseModel):
    provider: str | None = None
    model: str | None = None
    anthropic_api_key: str | None = None
    ollama_url: str | None = None


@app.get("/api/settings")
async def api_settings():
    """Get current agent settings."""
    conn = get_connection()
    row = conn.execute(
        "SELECT config FROM providers WHERE id = 'spool-agent'"
    ).fetchone()
    conn.close()

    if row and row["config"]:
        config = row["config"] if isinstance(row["config"], dict) else {}
        if config.get("anthropic_api_key"):
            key = config["anthropic_api_key"]
            config["anthropic_api_key_masked"] = f"{key[:8]}...{key[-4:]}" if len(key) > 12 else "***"
            del config["anthropic_api_key"]
        return config

    return {"provider": "ollama", "model": "gemma3:4b", "ollama_url": "http://localhost:11434"}


@app.post("/api/settings")
async def api_update_settings(body: SettingsUpdate):
    """Update agent settings."""
    conn = get_connection()

    row = conn.execute(
        "SELECT config FROM providers WHERE id = 'spool-agent'"
    ).fetchone()

    if row:
        config = row["config"] if isinstance(row["config"], dict) else {}
    else:
        config = {}
        conn.execute(
            "INSERT INTO providers (id, name, type, status, icon) VALUES ('spool-agent', 'Spool Agent', 'agent', 'connected', 'spool')"
        )

    if body.provider is not None:
        config["provider"] = body.provider
    if body.model is not None:
        config["model"] = body.model
    if body.anthropic_api_key is not None:
        config["anthropic_api_key"] = body.anthropic_api_key
    if body.ollama_url is not None:
        config["ollama_url"] = body.ollama_url

    import json as _json
    conn.execute(
        "UPDATE providers SET config = %s WHERE id = 'spool-agent'",
        (_json.dumps(config),),
    )
    conn.commit()
    conn.close()
    return {"status": "updated"}


@app.get("/api/settings/check-ollama")
async def api_check_ollama():
    """Check if Ollama is running and what models are available."""
    import httpx as _httpx
    conn = get_connection()
    row = conn.execute("SELECT config FROM providers WHERE id = 'spool-agent'").fetchone()
    conn.close()
    config = (row["config"] if row and isinstance(row.get("config"), dict) else {}) if row else {}
    base_url = config.get("ollama_url", "http://localhost:11434")

    try:
        async with _httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{base_url}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
            return {"status": "connected", "models": models, "url": base_url}
    except Exception:
        return {"status": "disconnected", "models": [], "url": base_url}

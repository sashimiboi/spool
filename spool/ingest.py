"""Ingestion pipeline - parse AI coding sessions from multiple providers and store in pgvector."""

from pathlib import Path

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

from spool.config import MODEL_PRICING, DEFAULT_PRICING
from spool.db import get_connection
from spool.parser import ParsedSession
from spool.embeddings import embed_texts, chunk_text
from spool.providers import get_provider, get_all_providers

console = Console()


def _estimate_cost(input_tokens: int, output_tokens: int, model: str | None) -> float:
    pricing = MODEL_PRICING.get(model or "", DEFAULT_PRICING)
    return round((input_tokens * pricing[0] + output_tokens * pricing[1]) / 1_000_000, 6)


def _get_synced_files(conn) -> dict[str, int]:
    """Get map of file_path -> last_size for already-synced files."""
    rows = conn.execute("SELECT file_path, last_size FROM sync_state").fetchall()
    return {r["file_path"]: r["last_size"] for r in rows}


def _mark_synced(conn, file_path: str, size: int, provider_id: str = "claude-code"):
    conn.execute(
        "INSERT INTO sync_state (file_path, last_size, provider_id) VALUES (%s, %s, %s) "
        "ON CONFLICT (file_path) DO UPDATE SET last_size = %s, provider_id = %s, last_synced_at = now()",
        (file_path, size, provider_id, size, provider_id),
    )


def _store_session(conn, session: ParsedSession):
    """Store a parsed session and its messages."""
    cost = _estimate_cost(
        session.estimated_input_tokens,
        session.estimated_output_tokens,
        session.model,
    )

    conn.execute(
        """INSERT INTO sessions (id, provider_id, project, cwd, git_branch, started_at, ended_at,
           message_count, tool_call_count, estimated_input_tokens, estimated_output_tokens,
           estimated_cost_usd, claude_version, model, title)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (id) DO UPDATE SET
           provider_id = EXCLUDED.provider_id,
           message_count = EXCLUDED.message_count,
           tool_call_count = EXCLUDED.tool_call_count,
           estimated_input_tokens = EXCLUDED.estimated_input_tokens,
           estimated_output_tokens = EXCLUDED.estimated_output_tokens,
           estimated_cost_usd = EXCLUDED.estimated_cost_usd,
           ended_at = EXCLUDED.ended_at,
           title = EXCLUDED.title""",
        (
            session.session_id, session.provider_id, session.project, session.cwd,
            session.git_branch, session.started_at, session.ended_at, session.message_count,
            session.tool_call_count, session.estimated_input_tokens,
            session.estimated_output_tokens, cost, session.claude_version,
            session.model, session.title,
        ),
    )

    # Upsert messages
    for msg in session.messages:
        if not msg.uuid:
            continue
        import json
        conn.execute(
            """INSERT INTO messages (id, session_id, role, content, timestamp, tools_used,
               cwd, git_branch, estimated_tokens)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (id) DO NOTHING""",
            (
                msg.uuid, session.session_id, msg.role, msg.content,
                msg.timestamp, json.dumps(msg.tools_used), msg.cwd,
                msg.git_branch, msg.estimated_tokens,
            ),
        )

        # Store tool calls with details
        if msg.tool_details:
            for td in msg.tool_details:
                conn.execute(
                    """INSERT INTO tool_calls (session_id, message_id, tool_name, tool_input, tool_result_preview, timestamp)
                       VALUES (%s, %s, %s, %s, %s, %s)""",
                    (session.session_id, msg.uuid, td.name, td.input_summary, td.result_preview or None, msg.timestamp),
                )
        else:
            for tool_name in msg.tools_used:
                conn.execute(
                    """INSERT INTO tool_calls (session_id, message_id, tool_name, timestamp)
                       VALUES (%s, %s, %s, %s)""",
                    (session.session_id, msg.uuid, tool_name, msg.timestamp),
                )


def _embed_session(conn, session: ParsedSession):
    """Chunk and embed session messages into pgvector."""
    # Delete existing chunks for this session (re-embed on update)
    conn.execute("DELETE FROM chunks WHERE session_id = %s", (session.session_id,))

    all_chunks = []
    chunk_meta = []

    for msg in session.messages:
        if not msg.content.strip():
            continue
        chunks = chunk_text(msg.content)
        for chunk in chunks:
            all_chunks.append(chunk)
            chunk_meta.append({
                "session_id": session.session_id,
                "message_id": msg.uuid,
                "role": msg.role,
                "project": session.project,
                "timestamp": msg.timestamp,
            })

    if not all_chunks:
        return 0

    # Batch embed
    vectors = embed_texts(all_chunks)

    for chunk, vec, meta in zip(all_chunks, vectors, chunk_meta):
        conn.execute(
            """INSERT INTO chunks (session_id, message_id, content, role, project, timestamp, embedding)
               VALUES (%s, %s, %s, %s, %s, %s, %s::vector)""",
            (
                meta["session_id"], meta["message_id"], chunk,
                meta["role"], meta["project"], meta["timestamp"],
                str(vec),
            ),
        )

    return len(all_chunks)


def _get_connected_providers(conn) -> list[dict]:
    """Get all connected providers from the database."""
    rows = conn.execute(
        "SELECT id, type, data_path FROM providers WHERE status = 'connected' AND type != 'agent'"
    ).fetchall()
    return [dict(r) for r in rows]


def sync(embed: bool = True, provider_filter: str | None = None):
    """Sync sessions from all connected providers to the database."""
    conn = get_connection()
    connected = _get_connected_providers(conn)

    if provider_filter:
        connected = [p for p in connected if p["type"] == provider_filter]

    if not connected:
        console.print("[yellow]No connected providers found. Connect one via the UI or run 'spool sync' after connecting Claude Code.[/yellow]")
        # Fall back to Claude Code if it's not in the DB yet but data exists
        from spool.providers.claude_code import ClaudeCodeProvider
        cc = ClaudeCodeProvider()
        if cc.is_available():
            connected = [{"id": "claude-code", "type": "claude-code", "data_path": str(cc.default_data_path())}]
        else:
            conn.close()
            return

    synced = _get_synced_files(conn)
    grand_total_sessions = 0
    grand_total_messages = 0
    grand_total_chunks = 0

    for prov_info in connected:
        provider = get_provider(prov_info["type"])
        if not provider:
            console.print(f"[yellow]Unknown provider type: {prov_info['type']}[/yellow]")
            continue

        # Use custom data_path if set, otherwise default
        data_path = None
        if prov_info.get("data_path"):
            expanded = Path(prov_info["data_path"]).expanduser()
            if expanded.exists():
                data_path = expanded

        files = provider.discover_session_files(data_path)
        if not files:
            continue

        # Filter to new or changed files
        to_process = []
        for f in files:
            size = f.stat().st_size
            if str(f) not in synced or synced[str(f)] != size:
                to_process.append(f)

        if not to_process:
            continue

        console.print(
            f"[bold]{provider.name}:[/bold] Found {len(to_process)} new/updated session files."
        )

        total_messages = 0
        total_chunks = 0
        total_sessions = 0

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TextColumn("{task.completed}/{task.total}"),
            console=console,
        ) as progress:
            task = progress.add_task(f"Syncing {provider.name}...", total=len(to_process))

            for f in to_process:
                sessions = provider.parse_session_file(f)
                for session in sessions:
                    _store_session(conn, session)
                    total_messages += session.message_count
                    total_sessions += 1

                    if embed:
                        chunks = _embed_session(conn, session)
                        total_chunks += chunks

                _mark_synced(conn, str(f), f.stat().st_size, prov_info["type"])
                conn.commit()
                progress.advance(task)

        # Update provider stats
        conn.execute(
            """UPDATE providers SET
               session_count = (SELECT COUNT(*) FROM sessions WHERE provider_id = %s),
               last_synced_at = now()
               WHERE id = %s""",
            (prov_info["id"], prov_info["id"]),
        )
        conn.commit()

        grand_total_sessions += total_sessions
        grand_total_messages += total_messages
        grand_total_chunks += total_chunks

        console.print(
            f"  [green]Synced {total_sessions} sessions, "
            f"{total_messages} messages, "
            f"{total_chunks} chunks embedded.[/green]"
        )

    conn.close()

    if grand_total_sessions == 0:
        console.print("[green]All sessions already synced.[/green]")
    else:
        console.print(
            f"\n[green]Total: {grand_total_sessions} sessions, "
            f"{grand_total_messages} messages, "
            f"{grand_total_chunks} chunks embedded.[/green]"
        )

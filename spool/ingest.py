"""Ingestion pipeline - parse Claude Code sessions and store in pgvector."""

from pathlib import Path

from rich.console import Console
from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn

from spool.config import MODEL_PRICING, DEFAULT_PRICING
from spool.db import get_connection
from spool.parser import ParsedSession, discover_session_files, parse_session_file
from spool.embeddings import embed_texts, chunk_text

console = Console()


def _estimate_cost(input_tokens: int, output_tokens: int, model: str | None) -> float:
    pricing = MODEL_PRICING.get(model or "", DEFAULT_PRICING)
    return round((input_tokens * pricing[0] + output_tokens * pricing[1]) / 1_000_000, 6)


def _get_synced_files(conn) -> dict[str, int]:
    """Get map of file_path -> last_size for already-synced files."""
    rows = conn.execute("SELECT file_path, last_size FROM sync_state").fetchall()
    return {r["file_path"]: r["last_size"] for r in rows}


def _mark_synced(conn, file_path: str, size: int):
    conn.execute(
        "INSERT INTO sync_state (file_path, last_size) VALUES (%s, %s) "
        "ON CONFLICT (file_path) DO UPDATE SET last_size = %s, last_synced_at = now()",
        (file_path, size, size),
    )


def _store_session(conn, session: ParsedSession):
    """Store a parsed session and its messages."""
    cost = _estimate_cost(
        session.estimated_input_tokens,
        session.estimated_output_tokens,
        session.model,
    )

    conn.execute(
        """INSERT INTO sessions (id, project, cwd, git_branch, started_at, ended_at,
           message_count, tool_call_count, estimated_input_tokens, estimated_output_tokens,
           estimated_cost_usd, claude_version, model, title)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (id) DO UPDATE SET
           message_count = EXCLUDED.message_count,
           tool_call_count = EXCLUDED.tool_call_count,
           estimated_input_tokens = EXCLUDED.estimated_input_tokens,
           estimated_output_tokens = EXCLUDED.estimated_output_tokens,
           estimated_cost_usd = EXCLUDED.estimated_cost_usd,
           ended_at = EXCLUDED.ended_at,
           title = EXCLUDED.title""",
        (
            session.session_id, session.project, session.cwd, session.git_branch,
            session.started_at, session.ended_at, session.message_count,
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

        # Store tool calls
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


def sync(embed: bool = True):
    """Sync all Claude Code sessions to the database."""
    files = discover_session_files()
    if not files:
        console.print("[yellow]No Claude Code session files found.[/yellow]")
        return

    conn = get_connection()
    synced = _get_synced_files(conn)

    # Filter to new or changed files
    to_process = []
    for f in files:
        size = f.stat().st_size
        if str(f) not in synced or synced[str(f)] != size:
            to_process.append(f)

    if not to_process:
        console.print("[green]All sessions already synced.[/green]")
        conn.close()
        return

    console.print(f"Found [bold]{len(to_process)}[/bold] new/updated session files to sync.")

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
        task = progress.add_task("Syncing sessions...", total=len(to_process))

        for f in to_process:
            session = parse_session_file(f)
            if session is None:
                progress.advance(task)
                continue

            _store_session(conn, session)
            total_messages += session.message_count
            total_sessions += 1

            if embed:
                chunks = _embed_session(conn, session)
                total_chunks += chunks

            _mark_synced(conn, str(f), f.stat().st_size)
            conn.commit()
            progress.advance(task)

    # Update provider session_count and last_synced_at
    conn.execute(
        """UPDATE providers SET
           session_count = (SELECT COUNT(*) FROM sessions WHERE provider_id = 'claude-code'),
           last_synced_at = now()
           WHERE id = 'claude-code'"""
    )
    conn.commit()
    conn.close()

    console.print(
        f"\n[green]Synced {total_sessions} sessions, "
        f"{total_messages} messages, "
        f"{total_chunks} chunks embedded.[/green]"
    )

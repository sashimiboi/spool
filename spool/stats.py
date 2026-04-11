"""Usage statistics and metrics."""

from datetime import datetime, timedelta, timezone

from spool.db import get_connection


def get_overview() -> dict:
    """Get high-level usage stats."""
    conn = get_connection()

    summary = conn.execute(
        """SELECT
           COUNT(*) AS total_sessions,
           COALESCE(SUM(message_count), 0) AS total_messages,
           COALESCE(SUM(tool_call_count), 0) AS total_tool_calls,
           COALESCE(SUM(estimated_input_tokens), 0) AS total_input_tokens,
           COALESCE(SUM(estimated_output_tokens), 0) AS total_output_tokens,
           COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
           MIN(started_at) AS earliest_session,
           MAX(ended_at) AS latest_session
        FROM sessions"""
    ).fetchone()

    # Sessions per project
    projects = conn.execute(
        """SELECT project, COUNT(*) AS sessions, SUM(message_count) AS messages,
                  SUM(estimated_cost_usd) AS cost
           FROM sessions GROUP BY project ORDER BY sessions DESC LIMIT 20"""
    ).fetchall()

    # Top tools
    top_tools = conn.execute(
        """SELECT tool_name, COUNT(*) AS uses
           FROM tool_calls GROUP BY tool_name ORDER BY uses DESC LIMIT 15"""
    ).fetchall()

    # Recent sessions
    recent = conn.execute(
        """SELECT id, project, title, started_at, message_count,
                  estimated_cost_usd, claude_version
           FROM sessions ORDER BY started_at DESC LIMIT 10"""
    ).fetchall()

    conn.close()

    return {
        "summary": dict(summary) if summary else {},
        "projects": [dict(r) for r in projects],
        "top_tools": [dict(r) for r in top_tools],
        "recent_sessions": [dict(r) for r in recent],
    }


def get_daily_stats(days: int = 7) -> list[dict]:
    """Get daily usage breakdown."""
    conn = get_connection()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    rows = conn.execute(
        """SELECT DATE(started_at) AS day,
                  COUNT(*) AS sessions,
                  COALESCE(SUM(message_count), 0) AS messages,
                  COALESCE(SUM(tool_call_count), 0) AS tool_calls,
                  COALESCE(SUM(estimated_input_tokens + estimated_output_tokens), 0) AS total_tokens,
                  COALESCE(SUM(estimated_cost_usd), 0) AS cost
           FROM sessions
           WHERE started_at >= %s
           GROUP BY DATE(started_at)
           ORDER BY day""",
        (cutoff,),
    ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


def get_session_detail(session_id: str) -> dict | None:
    """Get detailed info for a specific session."""
    conn = get_connection()

    session = conn.execute(
        "SELECT * FROM sessions WHERE id = %s", (session_id,)
    ).fetchone()

    if not session:
        conn.close()
        return None

    messages = conn.execute(
        """SELECT role, content, timestamp, tools_used, estimated_tokens
           FROM messages WHERE session_id = %s ORDER BY timestamp""",
        (session_id,),
    ).fetchall()

    tool_summary = conn.execute(
        """SELECT tool_name, COUNT(*) AS uses
           FROM tool_calls WHERE session_id = %s
           GROUP BY tool_name ORDER BY uses DESC""",
        (session_id,),
    ).fetchall()

    conn.close()

    return {
        "session": dict(session),
        "messages": [dict(m) for m in messages],
        "tool_summary": [dict(t) for t in tool_summary],
    }

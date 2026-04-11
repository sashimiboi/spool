"""Semantic search over session history via pgvector."""

from spool.db import get_connection
from spool.embeddings import embed_text


def search(query: str, limit: int = 10, project: str | None = None) -> list[dict]:
    """Search session chunks by semantic similarity."""
    vec = embed_text(query)

    conn = get_connection()

    if project:
        rows = conn.execute(
            """SELECT c.content, c.role, c.project, c.timestamp, c.session_id,
                      1 - (c.embedding <=> %s::vector) AS similarity,
                      s.title, s.cwd
               FROM chunks c
               JOIN sessions s ON s.id = c.session_id
               WHERE c.project = %s
               ORDER BY c.embedding <=> %s::vector
               LIMIT %s""",
            (str(vec), project, str(vec), limit),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT c.content, c.role, c.project, c.timestamp, c.session_id,
                      1 - (c.embedding <=> %s::vector) AS similarity,
                      s.title, s.cwd
               FROM chunks c
               JOIN sessions s ON s.id = c.session_id
               ORDER BY c.embedding <=> %s::vector
               LIMIT %s""",
            (str(vec), str(vec), limit),
        ).fetchall()

    conn.close()

    return [
        {
            "content": r["content"][:200],
            "role": r["role"],
            "project": r["project"],
            "timestamp": r["timestamp"].isoformat() if r["timestamp"] else None,
            "session_id": r["session_id"],
            "similarity": round(float(r["similarity"]), 4),
            "title": r["title"],
            "cwd": r["cwd"],
        }
        for r in rows
    ]

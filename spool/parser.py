"""Parse Claude Code session JSONL files from ~/.claude/projects/.

Outputs both the legacy `ParsedSession` (messages + tool counts) and a
`Trace` built from parentUuid/isSidechain, so ingest can write to both the
legacy tables and the new traces/spans tables in the same pass.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from spool.config import CLAUDE_PROJECTS_DIR, CHARS_PER_TOKEN, MODEL_PRICING, DEFAULT_PRICING
from spool.tracing import (
    Span,
    SpanKind,
    SpanStatus,
    Trace,
    TraceBuilder,
)


@dataclass
class ParsedMessage:
    uuid: str
    session_id: str
    role: str
    content: str
    timestamp: datetime | None
    cwd: str | None = None
    git_branch: str | None = None
    tools_used: list[str] = field(default_factory=list)
    estimated_tokens: int = 0


@dataclass
class ParsedSession:
    session_id: str
    project: str
    messages: list[ParsedMessage] = field(default_factory=list)
    started_at: datetime | None = None
    ended_at: datetime | None = None
    cwd: str | None = None
    git_branch: str | None = None
    claude_version: str | None = None
    model: str | None = None
    title: str | None = None
    provider_id: str = "claude-code"
    trace: Optional[Trace] = None

    @property
    def message_count(self) -> int:
        return len(self.messages)

    @property
    def tool_call_count(self) -> int:
        return sum(len(m.tools_used) for m in self.messages)

    @property
    def estimated_input_tokens(self) -> int:
        return sum(m.estimated_tokens for m in self.messages if m.role == "user")

    @property
    def estimated_output_tokens(self) -> int:
        return sum(m.estimated_tokens for m in self.messages if m.role == "assistant")


def _extract_content(message: dict) -> str:
    """Extract text content from a message object."""
    msg = message.get("message", {})
    content = msg.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    parts.append(f"[tool: {block.get('name', 'unknown')}]")
                elif block.get("type") == "tool_result":
                    pass
        return "\n".join(parts)
    return str(content) if content else ""


def _extract_tool_uses(message: dict) -> list[dict]:
    """Return the tool_use content blocks from an assistant message."""
    msg = message.get("message", {})
    content = msg.get("content", "")
    if not isinstance(content, list):
        return []
    return [
        b for b in content
        if isinstance(b, dict) and b.get("type") == "tool_use"
    ]


def _extract_tool_results(message: dict) -> list[dict]:
    """Return the tool_result content blocks from a user message."""
    msg = message.get("message", {})
    content = msg.get("content", "")
    if not isinstance(content, list):
        return []
    return [
        b for b in content
        if isinstance(b, dict) and b.get("type") == "tool_result"
    ]


def _parse_timestamp(raw) -> datetime | None:
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return datetime.fromtimestamp(raw / 1000, tz=timezone.utc)
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _price_for(model: str | None) -> tuple[float, float]:
    if not model:
        return DEFAULT_PRICING
    return MODEL_PRICING.get(model, DEFAULT_PRICING)


def _cost_for_usage(model: str | None, usage: dict | None) -> float:
    if not usage:
        return 0.0
    in_rate, out_rate = _price_for(model)
    it = (usage.get("input_tokens") or 0) + (usage.get("cache_creation_input_tokens") or 0)
    ot = usage.get("output_tokens") or 0
    cache_read = usage.get("cache_read_input_tokens") or 0
    # Cache reads are ~10% of input cost in Anthropic's pricing.
    return round(
        (it * in_rate + ot * out_rate + cache_read * in_rate * 0.1) / 1_000_000,
        6,
    )


def _tool_result_text(block: dict) -> tuple[str, bool | None]:
    """Return (text, is_error) for a tool_result block."""
    content = block.get("content")
    is_error = block.get("is_error")
    if isinstance(content, str):
        return content, is_error
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                parts.append(c.get("text", ""))
            elif isinstance(c, str):
                parts.append(c)
        return "\n".join(parts), is_error
    return "", is_error


def parse_session_file(file_path: Path) -> ParsedSession | None:
    """Parse a single Claude Code session JSONL file into messages + trace."""
    session_id = file_path.stem
    project = file_path.parent.name

    # --- Pass 1: load all records into memory keyed by uuid -------------
    records: list[dict] = []
    by_uuid: dict[str, dict] = {}

    try:
        with open(file_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if record.get("type") not in ("user", "assistant"):
                    continue
                records.append(record)
                uid = record.get("uuid")
                if uid:
                    by_uuid[uid] = record
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return None

    if not records:
        return None

    # Session-wide metadata from first record with it.
    cwd = git_branch = claude_version = model = None
    for r in records:
        cwd = cwd or r.get("cwd")
        git_branch = git_branch or r.get("gitBranch")
        claude_version = claude_version or r.get("version")
        if not model:
            m = (r.get("message") or {}).get("model")
            if m:
                model = m

    # --- Build ParsedMessage list (legacy path, preserved exactly) -------
    messages: list[ParsedMessage] = []
    for record in records:
        content = _extract_content(record)
        if not content.strip():
            continue
        role = record["type"]  # "user" or "assistant"
        tools = [b.get("name", "unknown") for b in _extract_tool_uses(record)] if role == "assistant" else []
        ts = _parse_timestamp(record.get("timestamp"))
        est_tokens = max(1, len(content) // CHARS_PER_TOKEN)

        messages.append(ParsedMessage(
            uuid=record.get("uuid", ""),
            session_id=session_id,
            role=role,
            content=content,
            timestamp=ts,
            cwd=record.get("cwd"),
            git_branch=record.get("gitBranch"),
            tools_used=tools,
            estimated_tokens=est_tokens,
        ))

    if not messages:
        return None

    # Title from first user message.
    first_user = next((m for m in messages if m.role == "user"), None)
    title = None
    if first_user:
        title = first_user.content[:80].replace("\n", " ").strip()
        if len(first_user.content) > 80:
            title += "..."

    timestamps = [m.timestamp for m in messages if m.timestamp]
    started_at = min(timestamps) if timestamps else None
    ended_at = max(timestamps) if timestamps else None

    # --- Build the Trace -------------------------------------------------
    trace = _build_trace(
        session_id=session_id,
        project=project,
        records=records,
        by_uuid=by_uuid,
        cwd=cwd,
        git_branch=git_branch,
        model=model,
        title=title,
    )

    return ParsedSession(
        session_id=session_id,
        project=project,
        messages=messages,
        started_at=started_at,
        ended_at=ended_at,
        cwd=cwd,
        git_branch=git_branch,
        claude_version=claude_version,
        model=model,
        title=title,
        trace=trace,
    )


def _walk_to_primary(uuid_: str, by_uuid: dict[str, dict]) -> str | None:
    """Walk parentUuid chain until we hit a non-sidechain record.

    Returns the uuid of the primary-chain assistant message that spawned
    this sidechain (or None if the chain ends outside sidechain-land).
    """
    seen = set()
    cur = uuid_
    while cur and cur not in seen:
        seen.add(cur)
        rec = by_uuid.get(cur)
        if not rec:
            return None
        if not rec.get("isSidechain"):
            return cur
        cur = rec.get("parentUuid")
    return None


def _build_trace(
    session_id: str,
    project: str,
    records: list[dict],
    by_uuid: dict[str, dict],
    cwd: str | None,
    git_branch: str | None,
    model: str | None,
    title: str | None,
) -> Trace:
    """Build a Trace with span tree from Claude Code records.

    Structure:
        session (root)
          ├─ llm_call       (per assistant msg, with usage/cost)
          ├─ tool           (per tool_use inside an assistant msg; closed by its tool_result)
          └─ agent          (created for each Task tool_use; parents the sidechain sub-trace)
                ├─ llm_call
                └─ tool ...
    """
    tb = TraceBuilder(
        provider_id="claude-code",
        session_id=session_id,
        project=project,
        cwd=cwd,
        git_branch=git_branch,
        model=model,
        trace_id=f"trace-{session_id}",
    )

    session_start = _parse_timestamp(records[0].get("timestamp")) if records else None
    root = tb.start_session(
        name=title or f"Session {session_id[:8]}",
        started_at=session_start,
    )

    # Map: Task tool_use_id -> agent Span (so sidechain messages parented under the right agent)
    agent_by_tool_id: dict[str, Span] = {}
    # Map: primary assistant msg uuid containing the Task -> agent Span
    agent_by_primary_uuid: dict[str, Span] = {}
    # Map: open tool span by tool_use id (closed when tool_result arrives)
    open_tools: dict[str, Span] = {}

    for rec in records:
        uid = rec.get("uuid", "")
        rec_type = rec.get("type")
        ts = _parse_timestamp(rec.get("timestamp"))
        is_side = bool(rec.get("isSidechain"))

        # Determine this record's parent span in the tree.
        parent_span: Span = root
        if is_side:
            primary_uid = _walk_to_primary(uid, by_uuid)
            if primary_uid and primary_uid in agent_by_primary_uuid:
                parent_span = agent_by_primary_uuid[primary_uid]
            # else: fall through to root (orphan sidechain — rare)

        if rec_type == "assistant":
            msg = rec.get("message") or {}
            usage = msg.get("usage") or {}
            model_id = msg.get("model") or model

            input_tokens = usage.get("input_tokens") or 0
            cache_write = usage.get("cache_creation_input_tokens") or 0
            cache_read = usage.get("cache_read_input_tokens") or 0
            output_tokens = usage.get("output_tokens") or 0
            cost = _cost_for_usage(model_id, usage)

            llm_span = tb.start_llm_call(
                parent=parent_span,
                name="assistant.turn",
                started_at=ts,
                model=model_id,
                sidechain=is_side,
                message_uuid=uid,
            )
            tb.end_span(
                llm_span,
                ended_at=ts,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cache_read_tokens=cache_read,
                cache_write_tokens=cache_write,
                cost_usd=cost,
            )

            # Open a span for every tool_use in this assistant turn.
            for tu in _extract_tool_uses(rec):
                tool_name = tu.get("name", "unknown")
                tool_id = tu.get("id") or f"tu-{uid}-{tool_name}"
                tool_input = tu.get("input") if isinstance(tu.get("input"), dict) else None

                if tool_name == "Task":
                    # Agent span — child of whatever parent_span is.
                    sub_type = (tool_input or {}).get("subagent_type") or "generic"
                    prompt = (tool_input or {}).get("prompt") or (tool_input or {}).get("description")
                    agent = tb.start_agent(
                        parent=parent_span,
                        name=f"agent:{sub_type}",
                        started_at=ts,
                        agent_type=sub_type,
                        agent_prompt=prompt,
                        task_tool_id=tool_id,
                    )
                    agent_by_tool_id[tool_id] = agent
                    agent_by_primary_uuid[uid] = agent
                    # Also track it as an open "tool" so the tool_result closes the agent.
                    open_tools[tool_id] = agent
                else:
                    tool_span = tb.start_tool(
                        parent=parent_span,
                        name=f"tool:{tool_name}",
                        tool_name=tool_name,
                        started_at=ts,
                        tool_input=tool_input,
                        tool_use_id=tool_id,
                    )
                    open_tools[tool_id] = tool_span

        elif rec_type == "user":
            # A user record may wrap tool_results; close the matching tool spans.
            for tr in _extract_tool_results(rec):
                tool_use_id = tr.get("tool_use_id") or ""
                span = open_tools.pop(tool_use_id, None)
                if span is None:
                    continue
                text, is_error = _tool_result_text(tr)
                status = SpanStatus.ERROR if is_error else SpanStatus.OK
                tb.end_span(
                    span,
                    ended_at=ts,
                    status=status,
                    tool_output=text[:4000] if text else None,
                    tool_is_error=bool(is_error) if is_error is not None else None,
                )

    # Close any still-open tool spans with the last known timestamp.
    last_ts = None
    for rec in reversed(records):
        last_ts = _parse_timestamp(rec.get("timestamp"))
        if last_ts:
            break
    for span in open_tools.values():
        tb.end_span(span, ended_at=last_ts, status=SpanStatus.OK)

    return tb.finalize()


def discover_session_files() -> list[Path]:
    """Find all session JSONL files in the Claude Code projects directory."""
    if not CLAUDE_PROJECTS_DIR.exists():
        return []
    files = []
    for project_dir in CLAUDE_PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        for f in project_dir.glob("*.jsonl"):
            name = f.stem
            if len(name) == 36 and name.count("-") == 4:
                files.append(f)
    return sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)

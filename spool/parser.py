"""Parse Claude Code session JSONL files from ~/.claude/projects/."""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from spool.config import CLAUDE_PROJECTS_DIR, CHARS_PER_TOKEN


@dataclass
class ToolCallDetail:
    tool_use_id: str
    name: str
    input_summary: str
    result_preview: str = ""


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
    tool_details: list[ToolCallDetail] = field(default_factory=list)
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


def _summarize_tool_input(name: str, inp: dict) -> str:
    """Create a one-line summary of a tool call's input."""
    def _short_path(p: str) -> str:
        parts = p.rsplit("/", 2)
        return "/".join(parts[-2:]) if len(parts) > 2 else p

    if name == "Read":
        path = _short_path(inp.get("file_path", ""))
        offset = inp.get("offset")
        limit = inp.get("limit")
        if offset and limit:
            return f"{path}:{offset}-{offset + limit}"
        return path
    if name in ("Edit", "Write"):
        return _short_path(inp.get("file_path", ""))
    if name == "Bash":
        cmd = inp.get("command", "")
        return cmd[:120]
    if name == "Grep":
        pattern = inp.get("pattern", "")
        path = _short_path(inp.get("path", "")) if inp.get("path") else ""
        gl = inp.get("glob", "")
        parts = [f'"{pattern}"']
        if path:
            parts.append(f"in {path}")
        if gl:
            parts.append(f"({gl})")
        return " ".join(parts)
    if name == "Glob":
        return inp.get("pattern", "")
    if name == "Agent":
        return inp.get("description", "")[:100]
    if name in ("WebSearch", "WebFetch"):
        return inp.get("query", inp.get("url", ""))[:120]
    if name == "Skill":
        return inp.get("skill", "")
    if name == "TodoWrite":
        todos = inp.get("todos", [])
        return f"{len(todos)} items"
    if name == "LSP":
        return inp.get("operation", "")
    # Fallback: show first key=value
    for k, v in inp.items():
        return f"{k}={str(v)[:80]}"
    return ""


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


def _extract_tools(message: dict) -> list[str]:
    """Extract tool names from a message."""
    msg = message.get("message", {})
    content = msg.get("content", "")
    tools = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                tools.append(block.get("name", "unknown"))
    return tools


def _extract_tool_details(message: dict) -> list[ToolCallDetail]:
    """Extract detailed tool call info from an assistant message."""
    msg = message.get("message", {})
    content = msg.get("content", "")
    details = []
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_use":
                name = block.get("name", "unknown")
                inp = block.get("input", {})
                details.append(ToolCallDetail(
                    tool_use_id=block.get("id", ""),
                    name=name,
                    input_summary=_summarize_tool_input(name, inp),
                ))
    return details


def _extract_tool_results(message: dict) -> dict[str, str]:
    """Extract tool results from a user message, keyed by tool_use_id."""
    msg = message.get("message", {})
    content = msg.get("content", "")
    results: dict[str, str] = {}
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict) and block.get("type") == "tool_result":
                tool_use_id = block.get("tool_use_id", "")
                result_content = block.get("content", "")
                if isinstance(result_content, list):
                    text_parts = [b.get("text", "") for b in result_content if isinstance(b, dict) and b.get("type") == "text"]
                    result_content = "\n".join(text_parts)
                if tool_use_id and isinstance(result_content, str):
                    results[tool_use_id] = result_content[:500]
    return results


def _parse_timestamp(raw: str | int | float | None) -> datetime | None:
    """Parse various timestamp formats."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        # Unix milliseconds
        return datetime.fromtimestamp(raw / 1000, tz=timezone.utc)
    if isinstance(raw, str):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def parse_session_file(file_path: Path) -> ParsedSession | None:
    """Parse a single Claude Code session JSONL file."""
    session_id = file_path.stem
    project = file_path.parent.name

    messages = []
    cwd = None
    git_branch = None
    claude_version = None
    pending_tool_details: list[ToolCallDetail] = []

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

                rec_type = record.get("type")
                if rec_type not in ("user", "assistant"):
                    continue

                # Pair tool results before content check (user messages
                # with only tool_result blocks have empty text content)
                if rec_type == "user" and pending_tool_details:
                    results = _extract_tool_results(record)
                    if results:
                        for td in pending_tool_details:
                            if td.tool_use_id in results:
                                td.result_preview = results[td.tool_use_id]
                    pending_tool_details = []

                content = _extract_content(record)
                if not content.strip():
                    continue

                tools = _extract_tools(record) if rec_type == "assistant" else []
                ts = _parse_timestamp(record.get("timestamp"))
                est_tokens = max(1, len(content) // CHARS_PER_TOKEN)

                tool_details: list[ToolCallDetail] = []
                if rec_type == "assistant":
                    tool_details = _extract_tool_details(record)
                    pending_tool_details = tool_details

                msg = ParsedMessage(
                    uuid=record.get("uuid", ""),
                    session_id=session_id,
                    role=rec_type,
                    content=content,
                    timestamp=ts,
                    cwd=record.get("cwd"),
                    git_branch=record.get("gitBranch"),
                    tools_used=tools,
                    tool_details=tool_details,
                    estimated_tokens=est_tokens,
                )
                messages.append(msg)

                if not cwd and record.get("cwd"):
                    cwd = record["cwd"]
                if not git_branch and record.get("gitBranch"):
                    git_branch = record["gitBranch"]
                if not claude_version and record.get("version"):
                    claude_version = record["version"]
    except Exception as e:
        print(f"Error parsing {file_path}: {e}")
        return None

    if not messages:
        return None

    # Derive session title from first user message
    first_user = next((m for m in messages if m.role == "user"), None)
    title = None
    if first_user:
        title = first_user.content[:80].replace("\n", " ").strip()
        if len(first_user.content) > 80:
            title += "..."

    timestamps = [m.timestamp for m in messages if m.timestamp]
    started_at = min(timestamps) if timestamps else None
    ended_at = max(timestamps) if timestamps else None

    return ParsedSession(
        session_id=session_id,
        project=project,
        messages=messages,
        started_at=started_at,
        ended_at=ended_at,
        cwd=cwd,
        git_branch=git_branch,
        claude_version=claude_version,
        title=title,
    )


def discover_session_files() -> list[Path]:
    """Find all session JSONL files in the Claude Code projects directory."""
    if not CLAUDE_PROJECTS_DIR.exists():
        return []
    files = []
    for project_dir in CLAUDE_PROJECTS_DIR.iterdir():
        if not project_dir.is_dir():
            continue
        for f in project_dir.glob("*.jsonl"):
            # Skip non-session files (session files are UUID-named)
            name = f.stem
            if len(name) == 36 and name.count("-") == 4:
                files.append(f)
    return sorted(files, key=lambda f: f.stat().st_mtime, reverse=True)

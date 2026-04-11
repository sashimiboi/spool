"""Parse Claude Code session JSONL files from ~/.claude/projects/."""

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from spool.config import CLAUDE_PROJECTS_DIR, CHARS_PER_TOKEN


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
                    # Skip tool results to keep content focused
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

                content = _extract_content(record)
                if not content.strip():
                    continue

                tools = _extract_tools(record) if rec_type == "assistant" else []
                ts = _parse_timestamp(record.get("timestamp"))
                est_tokens = max(1, len(content) // CHARS_PER_TOKEN)

                msg = ParsedMessage(
                    uuid=record.get("uuid", ""),
                    session_id=session_id,
                    role=rec_type,
                    content=content,
                    timestamp=ts,
                    cwd=record.get("cwd"),
                    git_branch=record.get("gitBranch"),
                    tools_used=tools,
                    estimated_tokens=est_tokens,
                )
                messages.append(msg)

                if not cwd and record.get("cwd"):
                    cwd = record["cwd"]
                if not git_branch and record.get("gitBranch"):
                    git_branch = record["gitBranch"]
                if not claude_version and record.get("version"):
                    claude_version = record["version"]
    except Exception:
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

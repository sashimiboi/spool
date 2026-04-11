"""Watch Claude Code directory for new session data and auto-sync."""

import time

from rich.console import Console
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileModifiedEvent, FileCreatedEvent

from spool.config import CLAUDE_PROJECTS_DIR
from spool.db import get_connection
from spool.parser import parse_session_file
from spool.ingest import _store_session, _embed_session, _mark_synced

console = Console()


class SessionFileHandler(FileSystemEventHandler):
    """Handle new or modified session JSONL files."""

    def __init__(self, embed: bool = True):
        self.embed = embed
        self._debounce: dict[str, float] = {}

    def _should_process(self, path: str) -> bool:
        """Debounce - skip if we processed this file within the last 5 seconds."""
        now = time.time()
        if path in self._debounce and now - self._debounce[path] < 5:
            return False
        self._debounce[path] = now
        return True

    def _is_session_file(self, path: str) -> bool:
        if not path.endswith(".jsonl"):
            return False
        from pathlib import Path
        name = Path(path).stem
        return len(name) == 36 and name.count("-") == 4

    def _handle(self, path: str):
        if not self._is_session_file(path):
            return
        if not self._should_process(path):
            return

        from pathlib import Path
        file_path = Path(path)
        console.print(f"[blue]Detected change:[/blue] {file_path.name[:12]}...")

        session = parse_session_file(file_path)
        if not session:
            return

        try:
            conn = get_connection()
            _store_session(conn, session)
            chunks = 0
            if self.embed:
                chunks = _embed_session(conn, session)
            _mark_synced(conn, str(file_path), file_path.stat().st_size)
            conn.commit()
            conn.close()
            console.print(
                f"  [green]Synced {session.message_count} messages, {chunks} chunks[/green]"
            )
        except Exception as e:
            console.print(f"  [red]Error: {e}[/red]")

    def on_modified(self, event):
        if isinstance(event, FileModifiedEvent):
            self._handle(event.src_path)

    def on_created(self, event):
        if isinstance(event, FileCreatedEvent):
            self._handle(event.src_path)


def watch(embed: bool = True):
    """Watch for Claude Code session changes and auto-sync."""
    if not CLAUDE_PROJECTS_DIR.exists():
        console.print("[red]Claude Code projects directory not found.[/red]")
        return

    console.print(f"[bold]Watching[/bold] {CLAUDE_PROJECTS_DIR}")
    console.print("Press Ctrl+C to stop.\n")

    handler = SessionFileHandler(embed=embed)
    observer = Observer()
    observer.schedule(handler, str(CLAUDE_PROJECTS_DIR), recursive=True)
    observer.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        console.print("\n[yellow]Stopped watching.[/yellow]")
    observer.join()

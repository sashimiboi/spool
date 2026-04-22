"""Spool Cloud: push local sessions up to api.spooling.ai."""

import json
import os
from datetime import datetime
from pathlib import Path

import click
import httpx
from rich.console import Console

from spool.db import get_connection

console = Console()

DEFAULT_API = "https://api.spooling.ai"
CONFIG_PATH = Path.home() / ".config" / "spool" / "cloud.json"


def _load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text())
    except Exception:
        return {}


def _save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    os.chmod(CONFIG_PATH, 0o600)


def _auth_headers() -> dict:
    cfg = _load_config()
    key = cfg.get("api_key") or os.environ.get("SPOOL_CLOUD_API_KEY")
    if not key:
        raise click.ClickException("Not logged in. Run `spool cloud login --key sk_...` first.")
    return {"Authorization": f"Bearer {key}"}


def _api_base() -> str:
    cfg = _load_config()
    return cfg.get("api_url") or os.environ.get("SPOOL_CLOUD_URL") or DEFAULT_API


@click.group()
def cloud():
    """Spooling Cloud: push local sessions to api.spooling.ai."""


@cloud.command("login")
@click.option("--key", required=True, help="API key minted at app.spooling.ai/settings/api-keys")
@click.option("--api-url", default=None, help=f"Override API base (default {DEFAULT_API})")
def cloud_login(key: str, api_url: str | None):
    """Store a Spooling Cloud API key in ~/.config/spool/cloud.json."""
    cfg = _load_config()
    cfg["api_key"] = key.strip()
    if api_url:
        cfg["api_url"] = api_url.rstrip("/")
    _save_config(cfg)

    base = cfg.get("api_url") or DEFAULT_API
    try:
        r = httpx.get(f"{base}/v1/stats", headers={"Authorization": f"Bearer {cfg['api_key']}"}, timeout=10)
        r.raise_for_status()
        stats = r.json()
        console.print(f"[green]Logged in to {base}[/green]")
        console.print(f"  sessions in cloud: [bold]{stats.get('sessions', 0)}[/bold]")
    except Exception as e:
        console.print(f"[red]Saved key, but /v1/stats check failed: {e}[/red]")


@cloud.command("status")
def cloud_status():
    """Show current login + cloud stats."""
    cfg = _load_config()
    if not cfg.get("api_key"):
        console.print("[yellow]Not logged in.[/yellow] Run `spool cloud login --key sk_...`.")
        return
    base = _api_base()
    try:
        r = httpx.get(f"{base}/v1/stats", headers=_auth_headers(), timeout=10)
        r.raise_for_status()
        s = r.json()
        console.print(f"API: [cyan]{base}[/cyan]")
        console.print(f"  sessions: [bold]{s.get('sessions', 0)}[/bold]")
        console.print(f"  messages: [bold]{s.get('messages', 0)}[/bold]")
        console.print(f"  providers: [bold]{s.get('providers', 0)}[/bold]")
        console.print(f"  cost: [bold]${s.get('cost', 0):.2f}[/bold]")
    except Exception as e:
        console.print(f"[red]Error: {e}[/red]")


@cloud.command("logout")
def cloud_logout():
    """Remove the stored API key."""
    cfg = _load_config()
    cfg.pop("api_key", None)
    _save_config(cfg)
    console.print("[green]Logged out.[/green]")


@click.command()
@click.option("--limit", default=100, help="Max sessions to push per run")
@click.option("--batch", default=20, help="Sessions per request")
def push(limit: int, batch: int):
    """Push local sessions up to Spooling Cloud."""
    headers = _auth_headers()
    base = _api_base()

    conn = get_connection()
    try:
        rows = conn.execute(
            """SELECT id, provider_id, project, title, cwd, started_at, ended_at,
                      message_count, tool_call_count,
                      estimated_input_tokens, estimated_output_tokens, estimated_cost_usd
               FROM sessions
               ORDER BY started_at DESC NULLS LAST
               LIMIT %s""",
            (limit,),
        ).fetchall()
        sessions = []
        for r in rows:
            sid = r["id"]
            msgs = conn.execute(
                """SELECT role, content, timestamp,
                          ROW_NUMBER() OVER (ORDER BY timestamp NULLS LAST, id) - 1 AS seq
                   FROM messages WHERE session_id = %s
                   ORDER BY timestamp NULLS LAST, id""",
                (sid,),
            ).fetchall()
            sessions.append({
                "id": sid,
                "provider_id": r["provider_id"],
                "project": r["project"],
                "title": r["title"],
                "cwd": r["cwd"],
                "started_at": r["started_at"].isoformat() if r["started_at"] else None,
                "ended_at": r["ended_at"].isoformat() if r["ended_at"] else None,
                "message_count": r["message_count"] or 0,
                "tool_call_count": r["tool_call_count"] or 0,
                "input_tokens": r["estimated_input_tokens"] or 0,
                "output_tokens": r["estimated_output_tokens"] or 0,
                "estimated_cost_usd": float(r["estimated_cost_usd"] or 0),
                "messages": [
                    {
                        "role": m["role"],
                        "content": (m["content"] or "")[:20000],
                        "sequence": int(m["seq"]),
                        "timestamp": m["timestamp"].isoformat() if m["timestamp"] else None,
                    }
                    for m in msgs
                ],
            })
    finally:
        conn.close()

    if not sessions:
        console.print("[yellow]No local sessions to push.[/yellow]")
        return

    total = 0
    with httpx.Client(timeout=60) as client:
        for i in range(0, len(sessions), batch):
            chunk = sessions[i:i + batch]
            try:
                r = client.post(f"{base}/v1/sessions/batch", headers=headers, json={"sessions": chunk})
                r.raise_for_status()
                data = r.json()
                total += data.get("accepted", 0)
                console.print(f"  pushed {data.get('accepted', 0)} sessions")
            except httpx.HTTPStatusError as e:
                console.print(f"[red]HTTP {e.response.status_code}: {e.response.text[:200]}[/red]")
                return
            except Exception as e:
                console.print(f"[red]Error: {e}[/red]")
                return

    console.print(f"[green]Done.[/green] {total} sessions synced to {base}")

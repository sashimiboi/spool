"""Spool CLI - track and search your Claude Code sessions."""

import click
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

console = Console()


@click.group()
@click.version_option(package_name="spool")
def cli():
    """Spool - local session tracker for AI coding assistants."""
    pass


@cli.command()
def init():
    """Check database connection and show status."""
    from spool.db import check_db
    from spool.config import DATABASE_URL, CLAUDE_PROJECTS_DIR

    console.print(Panel("[bold]Spool[/bold] - Session Tracker", style="blue"))

    # Check DB
    if check_db():
        console.print("[green]Database connected[/green]")
    else:
        console.print(f"[red]Cannot connect to database.[/red]")
        console.print(f"  URL: {DATABASE_URL}")
        console.print("  Run: [bold]docker compose up -d[/bold]")
        return

    # Check Claude dir
    if CLAUDE_PROJECTS_DIR.exists():
        from spool.parser import discover_session_files
        files = discover_session_files()
        console.print(f"[green]Found {len(files)} Claude Code session files[/green]")
    else:
        console.print("[yellow]No Claude Code projects directory found[/yellow]")

    console.print("\nRun [bold]spool sync[/bold] to ingest sessions.")


@cli.command()
@click.option("--no-embed", is_flag=True, help="Skip embedding (faster sync)")
def sync(no_embed):
    """Sync Claude Code sessions to the database."""
    from spool.ingest import sync as do_sync
    do_sync(embed=not no_embed)


@cli.command()
def watch():
    """Watch for new session data and auto-sync."""
    from spool.watcher import watch as do_watch
    do_watch()


@cli.command()
@click.argument("query")
@click.option("-n", "--limit", default=10, help="Number of results")
@click.option("-p", "--project", default=None, help="Filter by project")
def search(query, limit, project):
    """Semantic search across session history."""
    from spool.search import search as do_search

    results = do_search(query, limit=limit, project=project)

    if not results:
        console.print("[yellow]No results found.[/yellow]")
        return

    for i, r in enumerate(results, 1):
        similarity = f"{r['similarity']:.1%}"
        project_name = r["project"] or "unknown"
        role = r["role"]
        ts = r["timestamp"] or ""

        console.print(
            f"\n[bold]{i}.[/bold] [{similarity}] "
            f"[dim]{project_name}[/dim] "
            f"[{'green' if role == 'user' else 'blue'}]{role}[/{'green' if role == 'user' else 'blue'}] "
            f"[dim]{ts[:19]}[/dim]"
        )
        if r["title"]:
            console.print(f"   [dim]Session:[/dim] {r['title']}")
        console.print(f"   {r['content']}")


@cli.command()
@click.option("--week", is_flag=True, help="Show weekly breakdown")
@click.option("--days", default=7, help="Number of days for daily stats")
def stats(week, days):
    """Show usage statistics."""
    from spool.stats import get_overview, get_daily_stats

    overview = get_overview()
    s = overview["summary"]

    if not s or s.get("total_sessions", 0) == 0:
        console.print("[yellow]No sessions synced yet. Run 'spool sync' first.[/yellow]")
        return

    # Overview panel
    total_tokens = s["total_input_tokens"] + s["total_output_tokens"]
    console.print(Panel(
        f"Sessions: [bold]{s['total_sessions']}[/bold]  |  "
        f"Messages: [bold]{s['total_messages']}[/bold]  |  "
        f"Tool calls: [bold]{s['total_tool_calls']}[/bold]\n"
        f"Tokens: [bold]{total_tokens:,}[/bold] est.  |  "
        f"Cost: [bold]${float(s['total_cost_usd']):.2f}[/bold] est.",
        title="[bold]Spool Overview[/bold]",
        style="blue",
    ))

    # Projects table
    if overview["projects"]:
        table = Table(title="Projects", show_lines=False)
        table.add_column("Project", style="cyan")
        table.add_column("Sessions", justify="right")
        table.add_column("Messages", justify="right")
        table.add_column("Est. Cost", justify="right")
        for p in overview["projects"][:10]:
            proj = p["project"].replace("-Users-anthonyloya-", "~/")
            table.add_row(
                proj,
                str(p["sessions"]),
                str(int(p["messages"] or 0)),
                f"${float(p['cost'] or 0):.2f}",
            )
        console.print(table)

    # Top tools
    if overview["top_tools"]:
        table = Table(title="Top Tools", show_lines=False)
        table.add_column("Tool", style="magenta")
        table.add_column("Uses", justify="right")
        for t in overview["top_tools"][:10]:
            table.add_row(t["tool_name"], str(t["uses"]))
        console.print(table)

    # Daily stats
    if week or days:
        daily = get_daily_stats(days=days if not week else 7)
        if daily:
            table = Table(title=f"Daily Usage (last {days if not week else 7} days)", show_lines=False)
            table.add_column("Date")
            table.add_column("Sessions", justify="right")
            table.add_column("Messages", justify="right")
            table.add_column("Tool Calls", justify="right")
            table.add_column("Tokens", justify="right")
            table.add_column("Cost", justify="right")
            for d in daily:
                table.add_row(
                    str(d["day"]),
                    str(d["sessions"]),
                    str(int(d["messages"])),
                    str(int(d["tool_calls"])),
                    f"{int(d['total_tokens']):,}",
                    f"${float(d['cost']):.2f}",
                )
            console.print(table)

    # Recent sessions
    if overview["recent_sessions"]:
        table = Table(title="Recent Sessions", show_lines=False)
        table.add_column("Started", style="dim")
        table.add_column("Project", style="cyan")
        table.add_column("Title")
        table.add_column("Msgs", justify="right")
        table.add_column("Cost", justify="right")
        for r in overview["recent_sessions"]:
            proj = (r["project"] or "").replace("-Users-anthonyloya-", "~/")
            ts = r["started_at"].strftime("%m/%d %H:%M") if r["started_at"] else ""
            title = (r["title"] or "")[:50]
            table.add_row(
                ts, proj, title,
                str(r["message_count"]),
                f"${float(r['estimated_cost_usd'] or 0):.2f}",
            )
        console.print(table)


@cli.command()
@click.option("--host", default=None, help="Host to bind to")
@click.option("--port", default=None, type=int, help="Port to bind to")
def serve(host, port):
    """Start the API server."""
    from spool.config import UI_HOST
    from spool.server import app
    import uvicorn

    h = host or UI_HOST
    p = port or 3002
    console.print(f"[bold]Spool API[/bold] at http://{h}:{p}")
    console.print("Start the UI with: [bold]cd ui && npm run dev[/bold]")
    uvicorn.run(app, host=h, port=p, log_level="warning")


@cli.command()
def ui():
    """Launch both the API server and Next.js UI."""
    import subprocess
    import os

    ui_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ui")

    console.print("[bold]Starting Spool...[/bold]")
    console.print("  API:  http://127.0.0.1:3002")
    console.print("  UI:   http://localhost:3001")

    # Start API in background
    api_proc = subprocess.Popen(
        ["python3", "-m", "uvicorn", "spool.server:app", "--host", "127.0.0.1", "--port", "3002", "--log-level", "warning"],
    )

    # Start Next.js dev server
    try:
        subprocess.run(["npm", "run", "dev"], cwd=ui_dir)
    except KeyboardInterrupt:
        pass
    finally:
        api_proc.terminate()


if __name__ == "__main__":
    cli()

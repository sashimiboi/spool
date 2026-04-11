"""Base provider class for AI coding tool session parsers."""

from abc import ABC, abstractmethod
from pathlib import Path

from spool.parser import ParsedSession

# Registry populated by Provider subclasses
PROVIDER_REGISTRY: dict[str, type["Provider"]] = {}


class Provider(ABC):
    """Abstract base for session data providers."""

    # Subclasses must set these
    type_id: str = ""
    name: str = ""

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if cls.type_id:
            PROVIDER_REGISTRY[cls.type_id] = cls

    @abstractmethod
    def default_data_path(self) -> Path:
        """Return the default path where this provider stores session data."""

    @abstractmethod
    def discover_session_files(self, data_path: Path | None = None) -> list[Path]:
        """Find all session files for this provider.

        Args:
            data_path: Override the default data path. If None, uses default_data_path().

        Returns:
            List of file paths sorted by modification time (newest first).
        """

    @abstractmethod
    def parse_session_file(self, file_path: Path) -> list[ParsedSession]:
        """Parse a session file into one or more ParsedSession objects.

        Some providers (like Cursor/Windsurf SQLite) store multiple sessions
        per file, so this returns a list.

        Returns:
            List of ParsedSession objects. Empty list if parsing fails.
        """

    def is_available(self) -> bool:
        """Check if this provider's data directory exists."""
        return self.default_data_path().exists()

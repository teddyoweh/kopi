"""Settings read from the environment. Secrets never have defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
FIXTURES_DIR = BACKEND_DIR / "fixtures"
PROFILES_DIR = BACKEND_DIR / "profiles"
DATA_DIR = Path(os.environ.get("KOPI_DATA_DIR", BACKEND_DIR.parent / "data"))


def _csv(value: str) -> list[str]:
    return [part.strip() for part in value.split(",") if part.strip()]


@dataclass(frozen=True)
class Settings:
    store: str = field(default_factory=lambda: os.environ.get("KOPI_STORE", "fixtures"))
    access_codes: list[str] = field(default_factory=lambda: _csv(os.environ.get("KOPI_ACCESS_CODES", "")))
    signing_key: str | None = field(default_factory=lambda: os.environ.get("KOPI_SIGNING_KEY"))
    allowed_origins: list[str] = field(
        default_factory=lambda: _csv(
            os.environ.get(
                "KOPI_ALLOWED_ORIGINS",
                "https://kopi.unv.run,http://localhost:3000,http://127.0.0.1:3000",
            )
        )
    )
    needledb_url: str | None = field(default_factory=lambda: os.environ.get("NEEDLEDB_URL"))
    needledb_api_key: str | None = field(default_factory=lambda: os.environ.get("NEEDLEDB_API_KEY"))

    @property
    def auth_required(self) -> bool:
        return bool(self.access_codes)

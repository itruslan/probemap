"""Application settings from environment variables.

Business config (datasource, projects, label_map) lives in config.py / config.json.
This module handles only runtime settings: paths, networking, logging.
"""

import os
import pathlib

# ---------------------------------------------------------------------------
# Data directory (JSON configs, layouts, icons)
# ---------------------------------------------------------------------------

DATA_DIR: str = os.getenv(
    "PROBEMAP_DATA_DIR",
    os.path.join(os.path.dirname(__file__), "../data"),
)

CONFIG_PATH: str = os.path.join(DATA_DIR, "config.json")
PROJECTS_PATH: str = os.path.join(DATA_DIR, "projects.json")
LAYOUTS_DIR: str = os.path.join(DATA_DIR, "layouts")
ICONS_DIR: pathlib.Path = pathlib.Path(os.path.join(DATA_DIR, "icons"))

# ---------------------------------------------------------------------------
# Static files (built frontend)
# ---------------------------------------------------------------------------

STATIC_DIR: str | None = os.getenv("PROBEMAP_STATIC_DIR", None)

# ---------------------------------------------------------------------------
# Network / CORS
# ---------------------------------------------------------------------------

PORT: int = int(os.getenv("PROBEMAP_PORT", "8000"))

_cors_raw = os.getenv("PROBEMAP_CORS_ORIGINS", "*")
CORS_ORIGINS: list[str] = [o.strip() for o in _cors_raw.split(",") if o.strip()]

# ---------------------------------------------------------------------------
# Datasource override (env takes precedence over config.json)
# ---------------------------------------------------------------------------

DATASOURCE_URL: str | None = os.getenv("PROBEMAP_DATASOURCE_URL", None)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

LOG_LEVEL: str = os.getenv("PROBEMAP_LOG_LEVEL", "info").lower()
# "json" | "text" | "" (auto: text on TTY, json otherwise)
LOG_FORMAT: str = os.getenv("PROBEMAP_LOG_FORMAT", "").lower()

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

# When set, write endpoints require a valid Bearer token.
# When not set, all requests are allowed (single-user / trusted-network mode).
ADMIN_PASSWORD: str | None = os.getenv("PROBEMAP_ADMIN_PASSWORD") or None

# ---------------------------------------------------------------------------
# S3-compatible storage (optional; fallback to DATA_DIR when not set)
# ---------------------------------------------------------------------------

S3_ENDPOINT: str | None = os.getenv("PROBEMAP_S3_ENDPOINT") or None
S3_BUCKET: str | None = os.getenv("PROBEMAP_S3_BUCKET") or None
S3_ACCESS_KEY: str | None = os.getenv("PROBEMAP_S3_ACCESS_KEY") or None
S3_SECRET_KEY: str | None = os.getenv("PROBEMAP_S3_SECRET_KEY") or None
S3_REGION: str = os.getenv("PROBEMAP_S3_REGION", "us-east-1")
# Optional key prefix inside the bucket (e.g. "probemap" for multi-tenant setups)
S3_PREFIX: str = os.getenv("PROBEMAP_S3_PREFIX", "").strip("/")

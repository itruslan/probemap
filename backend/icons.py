import pathlib
import re

import storage as _storage

ALLOWED_EXTS = {".svg", ".png", ".webp"}
_EXTS = list(ALLOWED_EXTS)
_MIME = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}

_SAFE_NAME = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")


def sanitize_icon_name(name: str) -> str:
    """Return name if safe, else empty string. Blocks path traversal and shell chars."""
    cleaned = name.strip()
    if _SAFE_NAME.match(cleaned):
        return cleaned
    return ""


def list_icons() -> list[dict[str, str]]:
    keys = _storage.get_store().list_prefix("icons/")
    seen: dict[str, str] = {}
    for key in keys:
        p = pathlib.PurePosixPath(key)
        if p.suffix in _EXTS:
            seen[p.stem] = key
    return [{"name": stem, "url": f"/api/icons/{stem}"} for stem in sorted(seen)]


def read_icon(name: str) -> tuple[bytes, str] | None:
    """Return (bytes, mime_type) or None if not found."""
    store = _storage.get_store()
    for ext in _EXTS:
        data = store.read_bytes(f"icons/{name}{ext}")
        if data is not None:
            return data, _MIME[ext]
    return None


def save_icon(name: str, data: bytes, ext: str = ".svg") -> None:
    store = _storage.get_store()
    # Remove old files with other extensions for same name
    for old_ext in _EXTS:
        if old_ext != ext:
            store.delete(f"icons/{name}{old_ext}")
    store.write_bytes(f"icons/{name}{ext}", data, _MIME.get(ext, "application/octet-stream"))


def delete_icon(name: str) -> bool:
    store = _storage.get_store()
    deleted = False
    for ext in _EXTS:
        if store.delete(f"icons/{name}{ext}"):
            deleted = True
    return deleted

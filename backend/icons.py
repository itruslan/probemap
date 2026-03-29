import os
import pathlib

ICONS_DIR = pathlib.Path(
    os.getenv("ICONS_DIR", os.path.join(os.path.dirname(__file__), "../data/icons"))
)

_EXTS = [".svg", ".png", ".webp"]
_MIME = {".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp"}


def list_icons() -> list[dict[str, str]]:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    seen: dict[str, pathlib.Path] = {}
    for f in sorted(ICONS_DIR.iterdir()):
        if f.suffix in _EXTS:
            seen[f.stem] = f
    return [{"name": p.stem, "url": f"/api/icons/{p.stem}"} for p in seen.values()]


def save_icon(name: str, data: bytes, ext: str = ".svg") -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    # Remove old files with other extensions for same name
    for old_ext in _EXTS:
        old = ICONS_DIR / f"{name}{old_ext}"
        if old.exists():
            old.unlink()
    (ICONS_DIR / f"{name}{ext}").write_bytes(data)


def delete_icon(name: str) -> bool:
    deleted = False
    for ext in _EXTS:
        path = ICONS_DIR / f"{name}{ext}"
        if path.exists():
            path.unlink()
            deleted = True
    return deleted


def icon_path(name: str) -> pathlib.Path | None:
    for ext in _EXTS:
        p = ICONS_DIR / f"{name}{ext}"
        if p.exists():
            return p
    return None


def icon_mime(path: pathlib.Path) -> str:
    return _MIME.get(path.suffix, "application/octet-stream")

import json
from typing import Any

import storage as _storage

_EMPTY: dict[str, Any] = {"nodes": [], "groups": [], "edges": []}
_LEGACY_KEY = "layout.json"


def _key(project_id: str) -> str:
    return f"layouts/{project_id}.json"


def read(project_id: str = "default") -> dict[str, Any]:
    raw = _storage.get_store().read_text(_key(project_id))
    if raw is not None:
        return json.loads(raw)
    # migrate legacy layout.json → default project
    if project_id == "default":
        raw = _storage.get_store().read_text(_LEGACY_KEY)
        if raw is not None:
            return json.loads(raw)
    return dict(_EMPTY)


def write(project_id: str, layout_data: dict[str, Any]) -> None:
    _storage.get_store().write_text(_key(project_id), json.dumps(layout_data, indent=2))

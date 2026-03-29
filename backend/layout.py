import json
import os
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
LAYOUTS_DIR = os.path.join(DATA_DIR, "layouts")
_LEGACY_PATH = os.path.join(DATA_DIR, "layout.json")

_EMPTY: dict[str, Any] = {"nodes": [], "groups": [], "edges": []}


def _path(project_id: str) -> str:
    return os.path.join(LAYOUTS_DIR, f"{project_id}.json")


def read(project_id: str = "default") -> dict[str, Any]:
    try:
        with open(_path(project_id)) as f:
            return json.load(f)
    except FileNotFoundError:
        pass
    # migrate legacy layout.json → default project
    if project_id == "default":
        try:
            with open(_LEGACY_PATH) as f:
                return json.load(f)
        except FileNotFoundError:
            pass
    return dict(_EMPTY)


def write(project_id: str, layout_data: dict[str, Any]) -> None:
    os.makedirs(LAYOUTS_DIR, exist_ok=True)
    with open(_path(project_id), "w") as f:
        json.dump(layout_data, f, indent=2)

import json
import os
from typing import Any

LAYOUT_PATH = os.getenv("LAYOUT_PATH", os.path.join(os.path.dirname(__file__), "../data/layout.json"))

_EMPTY: dict[str, Any] = {"nodes": [], "groups": [], "edges": []}


def read() -> dict[str, Any]:
    try:
        with open(LAYOUT_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return _EMPTY


def write(layout: dict[str, Any]) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(LAYOUT_PATH)), exist_ok=True)
    with open(LAYOUT_PATH, "w") as f:
        json.dump(layout, f, indent=2)

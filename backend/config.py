import json
import os
import uuid
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(__file__), "../data")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")
PROJECTS_PATH = os.path.join(DATA_DIR, "projects.json")

DEFAULT_LABEL_MAP: dict[str, Any] = {
    "service": "service",
    "port": "port",
    "zone": "zone",
    "module": "module",
    "url": None,
}

_DEFAULT_CONFIG: dict[str, Any] = {
    "datasource": None,
    "probe_jobs": [],
    "label_map": DEFAULT_LABEL_MAP,
}


def read_config() -> dict[str, Any]:
    try:
        with open(CONFIG_PATH) as f:
            data = json.load(f)
    except FileNotFoundError:
        return dict(_DEFAULT_CONFIG)
    data.setdefault("probe_jobs", [])
    data.setdefault("label_map", DEFAULT_LABEL_MAP)
    return data


def write_config(cfg: dict[str, Any]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)


def read_projects() -> list[dict[str, Any]]:
    try:
        with open(PROJECTS_PATH) as f:
            return json.load(f)
    except FileNotFoundError:
        return []


def write_projects(projects: list[dict[str, Any]]) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(PROJECTS_PATH, "w") as f:
        json.dump(projects, f, indent=2)


def get_project(project_id: str) -> dict[str, Any] | None:
    return next((p for p in read_projects() if p["id"] == project_id), None)


def create_project(name: str, filter_label: str | None, filter_value: str | None) -> dict[str, Any]:
    project: dict[str, Any] = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "filter": {"label": filter_label, "value": filter_value} if filter_label else None,
    }
    projects = read_projects()
    projects.append(project)
    write_projects(projects)
    return project


def update_project(project_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    projects = read_projects()
    for i, p in enumerate(projects):
        if p["id"] == project_id:
            projects[i] = {**p, **patch, "id": project_id}
            write_projects(projects)
            return projects[i]
    return None


def delete_project(project_id: str) -> bool:
    projects = read_projects()
    filtered = [p for p in projects if p["id"] != project_id]
    if len(filtered) == len(projects):
        return False
    write_projects(filtered)
    return True

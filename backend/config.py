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
    "probe_source": "instance",
    "module": "module",
    "url": None,
}

_DEFAULT_CONFIG: dict[str, Any] = {
    "datasource": None,
    "probe_jobs": [],
    "label_map": DEFAULT_LABEL_MAP,
    "metric_extra_selector": "",
    "metric_filter_rules": [],
}


def project_metric_filter_pairs(project: dict[str, Any]) -> list[tuple[str, str]]:
    """Пары лейбл=значение для PromQL: сначала filters[], иначе legacy filter."""
    out: list[tuple[str, str]] = []
    for x in project.get("filters") or []:
        if not isinstance(x, dict):
            continue
        lb = (x.get("label") or "").strip()
        val = x.get("value")
        if lb and val is not None and str(val).strip() != "":
            out.append((lb, str(val).strip()))
    if out:
        return out
    f = project.get("filter")
    if isinstance(f, dict) and f.get("label") and f.get("value") is not None:
        v = str(f["value"]).strip()
        if v:
            return [(str(f["label"]).strip(), v)]
    return []


def read_config() -> dict[str, Any]:
    try:
        with open(CONFIG_PATH) as f:
            data = json.load(f)
    except FileNotFoundError:
        return dict(_DEFAULT_CONFIG)
    data.setdefault("probe_jobs", [])
    raw_lm = data.get("label_map") or {}
    lm = {**DEFAULT_LABEL_MAP, **raw_lm}
    # Было «zone» — переносим имя лейбла в probe_source, если нового ключа ещё не сохраняли
    if "probe_source" not in raw_lm and "zone" in raw_lm:
        lm["probe_source"] = raw_lm.get("zone") or "instance"
    if not str(lm.get("probe_source") or "").strip():
        lm["probe_source"] = "instance"
    data["label_map"] = lm
    data.setdefault("metric_extra_selector", "")
    data.setdefault("metric_filter_rules", [])
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


def _normalize_filter_list(
    filters: list[dict[str, Any]] | None,
    filter_label: str | None,
    filter_value: str | None,
) -> tuple[list[dict[str, str]] | None, dict[str, str] | None]:
    flist: list[dict[str, str]] = []
    if filters is not None:
        for x in filters:
            if not isinstance(x, dict):
                continue
            lb = (x.get("label") or "").strip()
            val = x.get("value")
            if lb and val is not None and str(val).strip() != "":
                flist.append({"label": lb, "value": str(val).strip()})
    elif filter_label and filter_value is not None and str(filter_value).strip() != "":
        flist.append({"label": filter_label.strip(), "value": str(filter_value).strip()})
    if not flist:
        return None, None
    legacy = flist[0]
    return flist, legacy


def create_project(
    name: str,
    filter_label: str | None = None,
    filter_value: str | None = None,
    filters: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    flist, legacy = _normalize_filter_list(filters, filter_label, filter_value)
    project: dict[str, Any] = {
        "id": uuid.uuid4().hex[:8],
        "name": name,
        "filters": flist,
        "filter": legacy,
    }
    projects = read_projects()
    projects.append(project)
    write_projects(projects)
    return project


def update_project(project_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    projects = read_projects()
    for i, p in enumerate(projects):
        if p["id"] == project_id:
            merged = {**p, **patch, "id": project_id}
            if "filters" in patch:
                flist, leg = _normalize_filter_list(patch.get("filters"), None, None)
                merged["filters"] = flist
                merged["filter"] = leg
            projects[i] = merged
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

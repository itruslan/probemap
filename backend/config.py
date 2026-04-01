import json
import os
import re
import uuid
from typing import Any

_LEGACY_EXTRA_SELECTOR_RE = re.compile(
    r'([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"',
)


def _unescape_promql_double_quoted(s: str) -> str:
    return s.replace("\\\"", '"').replace("\\\\", "\\")


def _merge_legacy_metric_extra_into_rules(data: dict[str, Any], extra: str) -> None:
    """Переносит только пары label=\"value\" из удалённого поля metric_extra_selector."""
    rules = list(data.get("metric_filter_rules") or [])
    seen = {
        (
            str(r.get("label") or "").strip(),
            str(r.get("value") or "").strip(),
            str(r.get("op") or "eq").lower(),
        )
        for r in rules
        if isinstance(r, dict)
    }
    for m in _LEGACY_EXTRA_SELECTOR_RE.finditer(extra):
        lb, raw_v = m.group(1), m.group(2)
        v = _unescape_promql_double_quoted(raw_v)
        key = (lb, v, "eq")
        if key not in seen:
            rules.append({"label": lb, "value": v, "op": "eq"})
            seen.add(key)
    data["metric_filter_rules"] = rules

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
    data.setdefault("metric_filter_rules", [])
    _miss = object()
    legacy = data.pop("metric_extra_selector", _miss)
    if legacy is not _miss:
        ex = str(legacy or "").strip().strip(",").strip()
        if ex:
            _merge_legacy_metric_extra_into_rules(data, ex)
        write_config(data)
    return data


def project_creation_allowed() -> tuple[bool, str]:
    """Проверка перед POST /api/projects: URL датасорса и шаг таргетов.

    Нет ключа settings_targets_saved — legacy, разрешаем.
    """
    c = read_config()
    ds = c.get("datasource") or {}
    url = (ds.get("url") or "").strip()
    if not url:
        return False, "datasource_not_configured"
    if c.get("settings_targets_saved") is False:
        return False, "settings_targets_unsaved"
    return True, ""


def write_config(cfg: dict[str, Any]) -> None:
    out = {k: v for k, v in cfg.items() if k != "metric_extra_selector"}
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(out, f, indent=2)


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

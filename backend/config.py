import copy
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

import settings
import storage as _storage

_LEGACY_EXTRA_SELECTOR_RE = re.compile(
    r'([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"',
)


def _unescape_promql_double_quoted(s: str) -> str:
    return s.replace('\\"', '"').replace("\\\\", "\\")


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


_CONFIG_KEY = "config.json"
_PROJECTS_KEY = "projects.json"

DEFAULT_LABEL_MAP: dict[str, Any] = {
    "service": "service",
    "port": "port",
    "probe_source": "instance",
    "module": "module",
    "url": None,
    "name_labels": None,
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
    raw = _storage.get_store().read_text(_CONFIG_KEY)
    if raw is None:
        return dict(_DEFAULT_CONFIG)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"config.json is corrupted: {e}") from e
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


def apply_datasource_env_overlay(c: dict[str, Any]) -> dict[str, Any]:
    """Копия конфига для API/UI: подставляет эффективный URL, если задан PROBEMAP_DATASOURCE_URL."""
    out = copy.deepcopy(c)
    env_url = (settings.DATASOURCE_URL or "").strip()
    if env_url:
        raw_ds = out.get("datasource")
        ds = dict(raw_ds) if isinstance(raw_ds, dict) else {}
        ds["url"] = env_url.rstrip("/")
        out["datasource"] = ds
        out["datasource_url_from_env"] = True
    else:
        out["datasource_url_from_env"] = False
    return out


def read_config_for_api() -> dict[str, Any]:
    """То же, что read_config(), но URL в ответе совпадает с тем, что использует metrics (env > файл)."""
    return apply_datasource_env_overlay(read_config())


def sanitize_config_write(body: dict[str, Any]) -> dict[str, Any]:
    """Убрать поля только для ответа API перед записью в config.json."""
    return {k: v for k, v in body.items() if k != "datasource_url_from_env"}


def project_creation_allowed() -> tuple[bool, str]:
    """Проверка перед POST /api/projects: URL датасорса и шаг таргетов.

    Нет ключа settings_targets_saved — legacy, разрешаем.
    """
    c = read_config()
    ds = c.get("datasource") or {}
    url = settings.DATASOURCE_URL or (ds.get("url") or "").strip()
    if not url:
        return False, "datasource_not_configured"
    if c.get("settings_targets_saved") is False and not settings.DATASOURCE_URL:
        return False, "settings_targets_unsaved"
    return True, ""


def write_config(cfg: dict[str, Any]) -> None:
    out = {k: v for k, v in cfg.items() if k != "metric_extra_selector"}
    _storage.get_store().write_text(_CONFIG_KEY, json.dumps(out, indent=2))


def _load_all_projects() -> list[dict[str, Any]]:
    raw = _storage.get_store().read_text(_PROJECTS_KEY)
    if raw is None:
        return []
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"projects.json is corrupted: {e}") from e


def read_projects() -> list[dict[str, Any]]:
    """Возвращает только активные (не удалённые) проекты."""
    return [p for p in _load_all_projects() if not p.get("deleted_at")]


def read_deleted_projects() -> list[dict[str, Any]]:
    """Возвращает только soft-deleted проекты."""
    return [p for p in _load_all_projects() if p.get("deleted_at")]


def write_projects(projects: list[dict[str, Any]]) -> None:
    _storage.get_store().write_text(_PROJECTS_KEY, json.dumps(projects, indent=2))


def get_project(project_id: str) -> dict[str, Any] | None:
    """Возвращает активный проект по id (None если не найден или удалён)."""
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
        "id": uuid.uuid4().hex,
        "name": name,
        "filters": flist,
        "filter": legacy,
    }
    projects = read_projects()
    projects.append(project)
    write_projects(projects)
    return project


EXPORT_VERSION = "1"


def build_export(project: dict[str, Any], layout: dict[str, Any]) -> dict[str, Any]:
    """Собирает экспортный пакет: метаданные проекта + раскладка."""
    return {
        "probemap_export": EXPORT_VERSION,
        "name": project.get("name", ""),
        "filters": project.get("filters") or [],
        "layout": layout,
    }


def import_project(payload: dict[str, Any], layout_writer: Any) -> dict[str, Any]:
    """Создаёт проект из экспортного пакета. layout_writer(project_id, layout) — callback для записи раскладки."""
    name = str(payload.get("name") or "Imported project").strip() or "Imported project"
    filters = payload.get("filters") or []
    layout = payload.get("layout") or {}
    project = create_project(name, filters=filters)
    layout_writer(project["id"], layout)
    return project


_PROJECT_ALLOWED_KEYS = {"name", "filters"}


def update_project(project_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    safe_patch = {k: v for k, v in patch.items() if k in _PROJECT_ALLOWED_KEYS}
    projects = read_projects()
    for i, p in enumerate(projects):
        if p["id"] == project_id:
            merged = {**p, **safe_patch, "id": project_id}
            if "filters" in safe_patch:
                flist, leg = _normalize_filter_list(safe_patch.get("filters"), None, None)
                merged["filters"] = flist
                merged["filter"] = leg
            projects[i] = merged
            write_projects(projects)
            return projects[i]
    return None


def delete_project(project_id: str) -> bool:
    """Soft delete: помечает проект как удалённый (deleted_at = now)."""
    projects = _load_all_projects()
    for p in projects:
        if p["id"] == project_id and not p.get("deleted_at"):
            p["deleted_at"] = datetime.now(timezone.utc).isoformat()
            write_projects(projects)
            return True
    return False


def restore_project(project_id: str) -> dict[str, Any] | None:
    """Восстанавливает soft-deleted проект. Возвращает проект или None если не найден."""
    projects = _load_all_projects()
    for p in projects:
        if p["id"] == project_id and p.get("deleted_at"):
            p.pop("deleted_at")
            write_projects(projects)
            return p
    return None


def hard_delete_project(project_id: str) -> bool:
    """Безвозвратное удаление (только из корзины)."""
    projects = _load_all_projects()
    filtered = [p for p in projects if not (p["id"] == project_id and p.get("deleted_at"))]
    if len(filtered) == len(projects):
        return False
    write_projects(filtered)
    return True

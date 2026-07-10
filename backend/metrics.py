import asyncio
import re
from collections import defaultdict
from typing import Any

import config as cfg_mod
import httpx
import log
import settings

_log = log.get("probemap.metrics")

# Shared client — reuses TCP connections across requests.
# Created lazily on first use; lives for the process lifetime.
_http_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        _http_client = httpx.AsyncClient(timeout=10)
    return _http_client


def _get_vm_url() -> str:
    if settings.DATASOURCE_URL:
        return settings.DATASOURCE_URL.rstrip("/")
    c = cfg_mod.read_config()
    ds = c.get("datasource") or {}
    url = ds.get("url", "").rstrip("/")
    if not url:
        raise RuntimeError("Datasource not configured")
    return url


def _label_map() -> dict[str, Any]:
    return cfg_mod.read_config().get("label_map", cfg_mod.DEFAULT_LABEL_MAP)


def _merge_label_map(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Слияние черновика label_map с дефолтами (как при чтении конфига)."""
    lm = {**cfg_mod.DEFAULT_LABEL_MAP, **(raw or {})}
    if raw and "probe_source" not in raw and "zone" in raw:
        lm["probe_source"] = raw.get("zone") or "instance"
    ps = str(lm.get("probe_source") or "").strip()
    if not ps:
        lm["probe_source"] = "instance"
    return lm


async def _query(vm_url: str, q: str) -> list[dict[str, Any]]:
    try:
        r = await get_http_client().get(f"{vm_url}/api/v1/query", params={"query": q})
        r.raise_for_status()
        result: list[dict[str, Any]] = r.json()["data"]["result"]
        _log.debug("query ok url=%s results=%d query=%.120s", vm_url, len(result), q)
        return result
    except httpx.HTTPError as e:
        _log.warning("query failed url=%s query=%.120s error=%s", vm_url, q, e)
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e
    except (KeyError, ValueError) as e:
        _log.warning("query bad response url=%s query=%.120s error=%s", vm_url, q, e)
        raise RuntimeError(f"VictoriaMetrics request failed: unexpected response: {e}") from e


def _service_probe_kind(ports: list[dict[str, Any]]) -> str:
    """Classify a service for catalog grouping based on its probe types.

    "service" — HTTP/TCP/UDP (application endpoints)
    "resource" — ICMP/DNS (infrastructure hosts)
    HTTP wins over ICMP if a service has both.
    """
    types: set[str] = set()
    for port in ports:
        types.update(port.get("probe_types") or [])
    if "http" in types:
        return "service"
    if "icmp" in types or "dns" in types:
        return "resource"
    return "service"  # tcp/udp → service by default


def _module_to_type(module: str) -> str:
    m = module.lower()
    if "http" in m:  # covers both http and https
        return "http"
    if "icmp" in m or "ping" in m:
        return "icmp"
    if "udp" in m:
        return "udp"
    if "dns" in m:
        return "dns"
    return "tcp"


def _promql_escape_label_value(val: str) -> str:
    return str(val).replace("\\", "\\\\").replace('"', '\\"')


def _re2_escape(val: str) -> str:
    """Экранирование литерала для RE2-регулярок VM/Prometheus (аналог Go regexp.QuoteMeta).

    В отличие от re.escape НЕ экранирует '-': RE2 считает '\\-' вне символьного
    класса невалидной escape-последовательностью и возвращает 422 на запрос.
    """
    return re.sub(r"([\\.+*?()|\[\]{}^$])", r"\\\1", str(val))


def _cfg_rules_to_parts(cfg: dict[str, Any]) -> list[str]:
    parts: list[str] = []
    for r in cfg.get("metric_filter_rules") or []:
        if not isinstance(r, dict):
            continue
        lb = (r.get("label") or "").strip()
        val = r.get("value")
        if not lb or val is None or str(val).strip() == "":
            continue
        v = _promql_escape_label_value(str(val).strip())
        op = str(r.get("op") or "eq").lower()
        if op == "re":
            parts.append(f'{lb}=~"{v}"')
        elif op == "ne":
            parts.append(f'{lb}!="{v}"')
        elif op == "nre":
            parts.append(f'{lb}!~"{v}"')
        else:
            parts.append(f'{lb}="{v}"')
    return parts


def build_probe_success_selector(
    enabled_jobs: list[str],
    project_pairs: list[tuple[str, str]],
    cfg: dict[str, Any],
) -> str:
    """Селектор для `probe_success{...}` или пустая строка."""
    parts: list[str] = []
    if enabled_jobs:
        job_re = "|".join(_re2_escape(j) for j in enabled_jobs)
        parts.append(f'job=~"{job_re}"')
    for fl, fv in project_pairs:
        if fl and fv:
            parts.append(f'{fl}="{_promql_escape_label_value(fv)}"')
    parts.extend(_cfg_rules_to_parts(cfg))
    inner = ", ".join(parts)
    if not inner:
        return ""
    return "{" + inner + "}"


def _norm_label(m: dict[str, Any], key: str) -> str:
    v = m.get(key)
    return str(v) if v is not None and v != "" else ""


def _metric_label_denylist(src_l: str) -> set[str]:
    """Лейблы, которые не показываем в UI: имя метрики, job scrape, источник пробы, instance."""
    return {
        "__name__",
        "job",
        src_l,
        "instance",
    }


def _consensus_labels(metrics_list: list[dict[str, Any]], deny: set[str]) -> dict[str, str]:
    """Только лейблы с одним и тем же непустым значением во всех сериях сервиса (нет расхождений между blackbox)."""
    if not metrics_list:
        return {}
    keys: set[str] = set()
    for m in metrics_list:
        keys |= set(m.keys())
    out: dict[str, str] = {}
    for k in sorted(keys):
        if k in deny:
            continue
        nonempty = [
            str(m.get(k)).strip()
            for m in metrics_list
            if m.get(k) is not None and str(m.get(k)).strip() != ""
        ]
        if not nonempty:
            continue
        unique = set(nonempty)
        if len(unique) != 1:
            continue
        out[k] = next(iter(unique))
    return out


def _probe_source_label_name(lm: dict[str, Any]) -> str:
    """Имя лейбла в метриках для различения инстансов/источников пробы (раньше «zone»)."""
    v = lm.get("probe_source") or lm.get("zone") or "instance"
    s = str(v).strip()
    return s if s else "instance"


def _composite_name(m: dict[str, Any], svc_l: str, name_labels: list[str]) -> str:
    """Build the service node ID/name from one or more metric labels.

    If name_labels is non-empty, the primary svc_l is always prepended (deduplicated),
    then name_labels values are appended. Non-empty parts are joined with " · ".
    Falls back to the primary svc_l value (or "unknown") when the result is empty.
    """
    if name_labels:
        all_labels = [svc_l] + [lbl for lbl in name_labels if lbl != svc_l]
        parts = [str(m.get(lbl) or "") for lbl in all_labels]
        joined = " · ".join(p for p in parts if p)
        if joined:
            return joined
    return m.get(svc_l) or "unknown"


def _parse_series_maps(
    status_series: list[dict[str, Any]],
    duration_series: list[dict[str, Any]],
    svc_l: str,
    port_l: str,
    src_l: str,
    module_l: str,
    name_labels: list[str] | None = None,
) -> tuple[
    dict[tuple, int],
    dict[tuple, float],
    dict[tuple, set[str]],
    set[tuple[str, str, str, str]],
    dict[tuple[str, str, str, str], set[str]],
    list[str],
]:
    """Parse raw VictoriaMetrics series into lookup maps.

    Returns (status_map, duration_map, probe_types_map,
             port_tuple_set, port_tuple_sources, probe_sources).
    """
    nl = name_labels or []

    def series_key(m: dict[str, Any]) -> tuple[str, str, str, str, str]:
        return (
            _composite_name(m, svc_l, nl),
            m.get(port_l) or "unknown",
            m.get(src_l) or "",
            _norm_label(m, module_l),
            m.get("job") or "",
        )

    probe_sources = sorted({s["metric"].get(src_l, "") for s in status_series})
    status_map: dict[tuple, int] = {}
    duration_map: dict[tuple, float] = {}
    probe_types_map: dict[tuple, set[str]] = defaultdict(set)
    # Одна запись порта на комбинацию (service, port, module, job)
    port_tuple_set: set[tuple[str, str, str, str]] = set()
    port_tuple_sources: dict[tuple[str, str, str, str], set[str]] = defaultdict(set)

    for s in status_series:
        m = s["metric"]
        key = series_key(m)
        status_map[key] = int(float(s["value"][1]))
        if mod := m.get(module_l):
            probe_types_map[key].add(_module_to_type(str(mod)))
        pt: tuple[str, str, str, str] = (
            _composite_name(m, svc_l, nl),
            m.get(port_l) or "unknown",
            _norm_label(m, module_l),
            m.get("job") or "",
        )
        port_tuple_set.add(pt)
        port_tuple_sources[pt].add(m.get(src_l) or "")

    for s in duration_series:
        m = s["metric"]
        duration_map[series_key(m)] = round(float(s["value"][1]) * 1000, 1)

    return (
        status_map,
        duration_map,
        probe_types_map,
        port_tuple_set,
        port_tuple_sources,
        probe_sources,
    )


def _build_services_map(
    port_tuple_set: set[tuple[str, str, str, str]],
    port_tuple_sources: dict[tuple[str, str, str, str], set[str]],
    status_map: dict[tuple, int],
    duration_map: dict[tuple, float],
    probe_types_map: dict[tuple, set[str]],
) -> dict[str, dict]:
    """Build services_map from aggregated series maps."""
    services_map: dict[str, dict] = {}
    for svc_name, port, mod, job in sorted(port_tuple_set):
        if svc_name not in services_map:
            services_map[svc_name] = {"id": svc_name, "name": svc_name, "ports": []}
        pt = (svc_name, port, mod, job)
        sources_here = sorted(port_tuple_sources.get(pt, set()))
        all_types: set[str] = set()
        for src in sources_here:
            all_types |= probe_types_map.get((svc_name, port, src, mod, job), set())
        source_statuses = {
            src: {
                "success": status_map.get((svc_name, port, src, mod, job)),
                "duration_ms": duration_map.get((svc_name, port, src, mod, job)),
                "probe_types": sorted(probe_types_map.get((svc_name, port, src, mod, job), set())),
            }
            for src in sources_here
        }
        successes = [v["success"] for v in source_statuses.values() if v["success"] is not None]
        if not successes:
            overall = "unknown"
        elif all(v == 1 for v in successes):
            overall = "ok"
        elif all(v == 0 for v in successes):
            overall = "down"
        else:
            overall = "warn"
        entry: dict[str, Any] = {
            "port": port,
            "status": overall,
            "probe_types": sorted(all_types),
            "sources": source_statuses,
        }
        if mod:
            entry["module"] = mod
        if job:
            entry["job"] = job
        services_map[svc_name]["ports"].append(entry)
    return services_map


def _attach_labels_and_kind(
    services_map: dict[str, dict],
    status_series: list[dict[str, Any]],
    svc_l: str,
    src_l: str,
    name_labels: list[str] | None = None,
) -> None:
    """Attach consensus labels and probe_kind to each service in-place."""
    deny = _metric_label_denylist(src_l)
    nl = name_labels or []
    by_svc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for s in status_series:
        m = s["metric"]
        by_svc[_composite_name(m, svc_l, nl)].append(m)
    for svc_name, row in services_map.items():
        lbls = _consensus_labels(by_svc.get(svc_name, []), deny)
        if lbls:
            row["labels"] = lbls
        row["probe_kind"] = _service_probe_kind(row["ports"])


async def get_services(filter_pairs: list[tuple[str, str]] | None = None) -> dict[str, Any]:
    # Single config read — was being called 3× before (via _get_vm_url, explicit, _label_map)
    c = cfg_mod.read_config()
    ds = c.get("datasource") or {}
    vm_url = (settings.DATASOURCE_URL or ds.get("url", "")).rstrip("/")
    if not vm_url:
        raise RuntimeError("Datasource not configured")

    lm = {**cfg_mod.DEFAULT_LABEL_MAP, **c.get("label_map", {})}
    jobs = [j["job"] for j in c.get("probe_jobs", []) if j.get("enabled")]
    sel = build_probe_success_selector(jobs, list(filter_pairs or []), c)

    svc_l: str = lm["service"]
    port_l: str = lm["port"]
    src_l = _probe_source_label_name(lm)
    module_l: str = lm["module"]
    name_labels: list[str] = [
        lbl for lbl in (lm.get("name_labels") or []) if isinstance(lbl, str) and lbl.strip()
    ]

    status_series, duration_series = await asyncio.gather(
        _query(vm_url, f"last_over_time(probe_success{sel}[2m])"),
        _query(vm_url, f"last_over_time(probe_duration_seconds{sel}[2m])"),
    )

    status_map, duration_map, probe_types_map, port_tuple_set, port_tuple_sources, probe_sources = (
        _parse_series_maps(
            status_series, duration_series, svc_l, port_l, src_l, module_l, name_labels
        )
    )
    services_map = _build_services_map(
        port_tuple_set, port_tuple_sources, status_map, duration_map, probe_types_map
    )
    _attach_labels_and_kind(services_map, status_series, svc_l, src_l, name_labels)

    return {"services": list(services_map.values()), "probe_sources": probe_sources}


async def discover_jobs_for(
    vm_url: str, label_map: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    url = vm_url.strip().rstrip("/")
    if not url:
        raise RuntimeError("Datasource not configured")
    lm = _merge_label_map(label_map)
    src_l = _probe_source_label_name(lm)
    series = await _query(url, f"group by (job, {src_l}) (probe_success)")
    jobs: dict[str, set[str]] = defaultdict(set)
    for s in series:
        job = s["metric"].get("job")
        src = s["metric"].get(src_l)
        if job:
            if src:
                jobs[job].add(src)
            else:
                jobs.setdefault(job, set())
    return [{"job": j, "probe_sources": sorted(z)} for j, z in sorted(jobs.items())]


async def discover_jobs() -> list[dict[str, Any]]:
    return await discover_jobs_for(_get_vm_url(), _label_map())


async def discover_labels_for(vm_url: str) -> list[str]:
    url = vm_url.strip().rstrip("/")
    if not url:
        raise RuntimeError("Datasource not configured")
    try:
        r = await get_http_client().get(
            f"{url}/api/v1/labels",
            params={"match[]": "probe_success"},
        )
        r.raise_for_status()
        return sorted(r.json().get("data", []))
    except httpx.HTTPError as e:
        _log.warning("labels request failed url=%s error=%s", url, e)
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


async def discover_labels() -> list[str]:
    return await discover_labels_for(_get_vm_url())


async def get_filter_values(label: str) -> list[str]:
    vm_url = _get_vm_url()
    try:
        r = await get_http_client().get(
            f"{vm_url}/api/v1/label/{label}/values",
            params={"match[]": "probe_success"},
        )
        r.raise_for_status()
        return sorted(r.json().get("data", []))
    except httpx.HTTPError as e:
        _log.warning("label values request failed url=%s label=%s error=%s", vm_url, label, e)
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


async def test_datasource(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{url.rstrip('/')}/api/v1/query", params={"query": "1"})
            return r.status_code == 200
    except httpx.HTTPError:
        return False

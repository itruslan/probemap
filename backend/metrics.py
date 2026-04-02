import asyncio
from collections import defaultdict
from typing import Any

import config as cfg_mod
import httpx
import log
import settings

_log = log.get("probemap.metrics")


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
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{vm_url}/api/v1/query", params={"query": q})
            r.raise_for_status()
            return r.json()["data"]["result"]
    except httpx.HTTPError as e:
        _log.warning("query failed url=%s query=%.120s error=%s", vm_url, q, e)
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


def _apply_kind_rules(labels: dict[str, str], kind_rules: list[dict[str, Any]]) -> str | None:
    """First-match-wins: return kind if any rule matches the service's consensus labels."""
    for rule in kind_rules:
        if not isinstance(rule, dict):
            continue
        lb = (rule.get("label") or "").strip()
        val = str(rule.get("value") or "").strip()
        kind = (rule.get("kind") or "").strip()
        if not lb or not val or not kind:
            continue
        if labels.get(lb) == val:
            return kind
    return None


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
    if "http" in m or "https" in m:
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
        job_re = "|".join(enabled_jobs)
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


async def get_services(filter_pairs: list[tuple[str, str]] | None = None) -> dict[str, Any]:
    vm_url = _get_vm_url()
    c = cfg_mod.read_config()
    jobs = [j["job"] for j in c.get("probe_jobs", []) if j.get("enabled")]
    lm = _label_map()
    pairs = list(filter_pairs or [])
    sel = build_probe_success_selector(jobs, pairs, c)

    svc_l = lm["service"]
    port_l = lm["port"]
    src_l = _probe_source_label_name(lm)
    module_l = lm["module"]

    status_series, duration_series = await asyncio.gather(
        _query(vm_url, f"last_over_time(probe_success{sel}[2m])"),
        _query(vm_url, f"last_over_time(probe_duration_seconds{sel}[2m])"),
    )

    def series_key(m: dict[str, Any]) -> tuple[str, str, str, str, str]:
        """Уникальность серии: сервис, порт, источник пробы, модуль blackbox, job scrape."""
        return (
            m.get(svc_l) or "unknown",
            m.get(port_l) or "unknown",
            m.get(src_l) or "",
            _norm_label(m, module_l),
            m.get("job") or "",
        )

    probe_sources = sorted({s["metric"].get(src_l, "") for s in status_series})

    status_map: dict[tuple, int] = {}
    duration_map: dict[tuple, float] = {}
    probe_types_map: dict[tuple, set[str]] = defaultdict(set)

    for s in status_series:
        m = s["metric"]
        key = series_key(m)
        status_map[key] = int(float(s["value"][1]))
        if mod := m.get(module_l):
            probe_types_map[key].add(_module_to_type(str(mod)))

    for s in duration_series:
        m = s["metric"]
        key = series_key(m)
        duration_map[key] = round(float(s["value"][1]) * 1000, 1)

    # Одна запись порта на комбинацию (service, port, module, job) — иначе разные blackbox/job затирали друг друга
    port_tuple_set: set[tuple[str, str, str, str]] = set()
    # Значения лейбла источника только там, где есть серия для этой пробы
    port_tuple_sources: dict[tuple[str, str, str, str], set[str]] = defaultdict(set)
    for s in status_series:
        m = s["metric"]
        pt = (
            m.get(svc_l) or "unknown",
            m.get(port_l) or "unknown",
            _norm_label(m, module_l),
            m.get("job") or "",
        )
        port_tuple_set.add(pt)
        port_tuple_sources[pt].add(m.get(src_l) or "")

    services_map: dict[str, dict] = {}
    for svc_name, port, mod, job in sorted(port_tuple_set, key=lambda t: (t[0], t[1], t[2], t[3])):
        if svc_name not in services_map:
            services_map[svc_name] = {"id": svc_name, "name": svc_name, "ports": []}

        pt = (svc_name, port, mod, job)
        sources_here = sorted(port_tuple_sources.get(pt, set()))

        all_types: set[str] = set()
        for src in sources_here:
            sk = (svc_name, port, src, mod, job)
            all_types |= probe_types_map.get(sk, set())

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

    deny = _metric_label_denylist(src_l)
    kind_rules = c.get("kind_rules") or []
    by_svc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for s in status_series:
        m = s["metric"]
        by_svc[m.get(svc_l) or "unknown"].append(m)
    for svc_name, row in services_map.items():
        lbls = _consensus_labels(by_svc.get(svc_name, []), deny)
        if lbls:
            row["labels"] = lbls
        row["probe_kind"] = _service_probe_kind(row["ports"])
        matched_kind = _apply_kind_rules(lbls if lbls else {}, kind_rules)
        if matched_kind:
            row["kind"] = matched_kind

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
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{url}/api/v1/labels",
                params={"match[]": "probe_success"},
            )
            r.raise_for_status()
            return sorted(r.json().get("data", []))
    except httpx.HTTPError as e:
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


async def discover_labels() -> list[str]:
    return await discover_labels_for(_get_vm_url())


async def get_filter_values(label: str) -> list[str]:
    vm_url = _get_vm_url()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{vm_url}/api/v1/label/{label}/values",
                params={"match[]": "probe_success"},
            )
            r.raise_for_status()
            return sorted(r.json().get("data", []))
    except httpx.HTTPError as e:
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


async def test_datasource(url: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{url.rstrip('/')}/api/v1/query", params={"query": "1"})
            return r.status_code == 200
    except Exception:
        return False

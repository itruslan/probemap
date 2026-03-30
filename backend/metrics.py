import asyncio
from collections import defaultdict
from typing import Any

import httpx

import config as cfg_mod


def _get_vm_url() -> str:
    c = cfg_mod.read_config()
    ds = c.get("datasource") or {}
    url = ds.get("url", "").rstrip("/")
    if not url:
        raise RuntimeError("Datasource not configured")
    return url


def _enabled_jobs() -> list[str]:
    c = cfg_mod.read_config()
    return [j["job"] for j in c.get("probe_jobs", []) if j.get("enabled")]


def _label_map() -> dict[str, Any]:
    return cfg_mod.read_config().get("label_map", cfg_mod.DEFAULT_LABEL_MAP)


async def _query(vm_url: str, q: str) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(f"{vm_url}/api/v1/query", params={"query": q})
            r.raise_for_status()
            return r.json()["data"]["result"]
    except httpx.HTTPError as e:
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


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


def _build_selector(jobs: list[str], lm: dict[str, Any], filter_label: str | None, filter_value: str | None) -> str:
    parts: list[str] = []
    if jobs:
        job_re = "|".join(jobs)
        parts.append(f'job=~"{job_re}"')
    if filter_label and filter_value:
        parts.append(f'{filter_label}="{filter_value}"')
    return "{" + ", ".join(parts) + "}" if parts else ""


async def get_services(filter_label: str | None = None, filter_value: str | None = None) -> dict[str, Any]:
    vm_url = _get_vm_url()
    jobs = _enabled_jobs()
    lm = _label_map()
    sel = _build_selector(jobs, lm, filter_label, filter_value)

    svc_l = lm["service"]
    port_l = lm["port"]
    zone_l = lm["zone"]
    module_l = lm["module"]

    discovery, status_series, duration_series, zones_series = await asyncio.gather(
        _query(vm_url, f"group by ({svc_l}, {port_l}, {module_l}, {zone_l}) (probe_success{sel})"),
        _query(vm_url, f"last_over_time(probe_success{sel}[2m])"),
        _query(vm_url, f"last_over_time(probe_duration_seconds{sel}[2m])"),
        _query(vm_url, f"group by ({zone_l}) (probe_success{sel})"),
    )

    zones = sorted({s["metric"].get(zone_l, "") for s in zones_series if s["metric"].get(zone_l)})

    status_map: dict[tuple, int] = {}
    duration_map: dict[tuple, float] = {}
    probe_types_map: dict[tuple, set[str]] = defaultdict(set)

    for s in status_series:
        m = s["metric"]
        key = (m.get(svc_l), m.get(port_l), m.get(zone_l))
        status_map[key] = int(float(s["value"][1]))
        if module := m.get(module_l):
            probe_types_map[key].add(_module_to_type(module))

    for s in duration_series:
        m = s["metric"]
        key = (m.get(svc_l), m.get(port_l), m.get(zone_l))
        duration_map[key] = round(float(s["value"][1]) * 1000, 1)

    services_map: dict[str, dict] = {}
    seen_ports: set[tuple[str, str]] = set()
    for s in discovery:
        m = s["metric"]
        svc_name = m.get(svc_l, "unknown")
        port = m.get(port_l, "unknown")

        port_key = (svc_name, port)
        if port_key in seen_ports:
            continue
        seen_ports.add(port_key)

        if svc_name not in services_map:
            services_map[svc_name] = {"id": svc_name, "name": svc_name, "ports": []}

        all_types: set[str] = set()
        for zone in zones:
            all_types |= probe_types_map.get((svc_name, port, zone), set())

        zone_statuses = {
            zone: {
                "success": status_map.get((svc_name, port, zone)),
                "duration_ms": duration_map.get((svc_name, port, zone)),
                "probe_types": sorted(probe_types_map.get((svc_name, port, zone), set())),
            }
            for zone in zones
        }

        successes = [v["success"] for v in zone_statuses.values() if v["success"] is not None]
        if not successes:
            overall = "unknown"
        elif all(v == 1 for v in successes):
            overall = "ok"
        elif all(v == 0 for v in successes):
            overall = "down"
        else:
            overall = "warn"

        services_map[svc_name]["ports"].append({
            "port": port,
            "status": overall,
            "probe_types": sorted(all_types),
            "zones": zone_statuses,
        })

    return {"services": list(services_map.values()), "zones": zones}


async def discover_jobs() -> list[dict[str, Any]]:
    vm_url = _get_vm_url()
    lm = _label_map()
    zone_l = lm["zone"]
    series = await _query(vm_url, f"group by (job, {zone_l}) (probe_success)")
    jobs: dict[str, set[str]] = defaultdict(set)
    for s in series:
        job = s["metric"].get("job")
        zone = s["metric"].get(zone_l)
        if job:
            if zone:
                jobs[job].add(zone)
            else:
                jobs.setdefault(job, set())
    return [{"job": j, "zones": sorted(z)} for j, z in sorted(jobs.items())]


async def discover_labels() -> list[str]:
    vm_url = _get_vm_url()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"{vm_url}/api/v1/labels",
                params={"match[]": "probe_success"},
            )
            r.raise_for_status()
            return sorted(r.json().get("data", []))
    except httpx.HTTPError as e:
        raise RuntimeError(f"VictoriaMetrics request failed: {e}") from e


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

import os
from typing import Any

import httpx

VM_URL = os.getenv("VM_URL", "http://vmsingle-vm.monitoring.svc:8428")


async def _query(q: str) -> list[dict[str, Any]]:
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{VM_URL}/api/v1/query", params={"query": q})
        r.raise_for_status()
        return r.json()["data"]["result"]


async def get_services() -> dict[str, Any]:
    discovery, status_series, duration_series, zones_series = await _query_all()

    zones = sorted({s["metric"]["zone"] for s in zones_series if "zone" in s["metric"]})

    status_map = {
        (m.get("service"), m.get("port"), m.get("zone")): int(float(s["value"][1]))
        for s in status_series
        for m in [s["metric"]]
    }
    duration_map = {
        (m.get("service"), m.get("port"), m.get("zone")): round(float(s["value"][1]) * 1000, 1)
        for s in duration_series
        for m in [s["metric"]]
    }

    services_map: dict[str, dict] = {}
    for s in discovery:
        m = s["metric"]
        svc_name = m.get("service", "unknown")
        port = m.get("port", "unknown")

        if svc_name not in services_map:
            services_map[svc_name] = {"id": svc_name, "name": svc_name, "ports": []}

        zone_statuses = {
            zone: {
                "success": status_map.get((svc_name, port, zone)),
                "duration_ms": duration_map.get((svc_name, port, zone)),
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

        services_map[svc_name]["ports"].append(
            {"port": port, "status": overall, "zones": zone_statuses}
        )

    return {"services": list(services_map.values()), "zones": zones}


async def _query_all() -> tuple:
    import asyncio

    return await asyncio.gather(
        _query('group by (service, port) (probe_success{job="blackbox"})'),
        _query('last_over_time(probe_success{job="blackbox"}[2m])'),
        _query('last_over_time(probe_duration_seconds{job="blackbox"}[2m])'),
        _query('group by (zone) (probe_success{job="blackbox"})'),
    )

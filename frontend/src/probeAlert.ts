import type { Node } from "@xyflow/react";
import type { Port, Service } from "./api";

/** Как `aggStatus` в ServiceNode — агрегат по полю `status` порта, если нет детальных рядов `sources`. */
function aggStatusFromPorts(ports: Port[]): string {
  if (!ports?.length) return "unknown";
  if (ports.some((p) => p.status === "down")) return "down";
  if (ports.some((p) => p.status === "warn")) return "warn";
  if (ports.every((p) => p.status === "ok")) return "ok";
  return "unknown";
}

/**
 * Тот же «красный» мониторинг, что и рамка карточки сервиса: rollup по `sources.*.success`,
 * иначе — как в узле, fallback на агрегат `port.status`.
 * Совпадает с `status === "down"` в ServiceNode.
 */
export function probeCardDown(ports: Port[] | undefined): boolean {
  const rows = (ports ?? []).flatMap((p) =>
    Object.entries(p.sources ?? {}).map(([, s]) => ({ success: s.success })),
  );

  let probeRollupStatus: "ok" | "warn" | "down" | "unknown" = "unknown";
  if (rows.length > 0) {
    const hasAnyFail = rows.some((r) => r.success === 0);
    const hasAnyOk = rows.some((r) => r.success === 1);
    probeRollupStatus =
      hasAnyFail && hasAnyOk ? "warn"
        : hasAnyFail ? "down"
        : hasAnyOk ? "ok"
          : "unknown";
  }

  const portAgg = aggStatusFromPorts(ports ?? []);
  const status = probeRollupStatus !== "unknown" ? probeRollupStatus : portAgg;
  return status === "down";
}

/** Id сервиса в каталоге для подсветки: service-узел → id в каталоге или matchServiceId. */
export function effectiveServiceIdForNode(n: Node, services: Service[]): string | null {
  if (n.type === "service") {
    if (services.some((s) => s.id === n.id)) return n.id;
    const d = n.data as { matchServiceId?: string | null };
    return d.matchServiceId ?? null;
  }
  return null;
}

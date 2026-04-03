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

/** Full probe status — mirrors the ServiceNode status computation. */
export function probeNodeStatus(
  ports: Port[] | undefined,
): "ok" | "warn" | "down" | "unknown" {
  const rows = (ports ?? []).flatMap((p) =>
    Object.entries(p.sources ?? {}).map(([, s]) => ({ success: s.success })),
  );
  if (rows.length > 0) {
    const hasAnyFail = rows.some((r) => r.success === 0);
    const hasAnyOk = rows.some((r) => r.success === 1);
    if (hasAnyFail && hasAnyOk) return "warn";
    if (hasAnyFail) return "down";
    if (hasAnyOk) return "ok";
  }
  return aggStatusFromPorts(ports ?? []) as "ok" | "warn" | "down" | "unknown";
}

/** Id сервиса в каталоге для подсветки: service-узел → id в каталоге. */
export function effectiveServiceIdForNode(
  n: Node,
  services: Service[],
): string | null {
  if (n.type === "service") {
    if (services.some((s) => s.id === n.id)) return n.id;
  }
  return null;
}

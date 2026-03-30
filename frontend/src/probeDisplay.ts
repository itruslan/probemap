/** Нормализация типа пробы для бейджа (как в метриках / blackbox module) */
export function primaryProbeKind(types: string[] | undefined): string {
  const t = (types ?? []).map((x) => x.toLowerCase());
  if (t.includes("icmp")) return "ICMP";
  if (t.includes("http")) return "HTTP";
  if (t.includes("dns")) return "DNS";
  if (t.includes("udp")) return "UDP";
  if (t.includes("tcp")) return "TCP";
  return "TCP";
}

/** Порт из строки сервиса: host:443, https://x:8080/path */
export function parsePortFromServiceLabel(label: string): string | null {
  const u = label.trim();
  const m =
    u.match(/:(\d{2,5})(?:\/|\?|#|$)/) ||
    u.match(/:(\d{2,5})$/);
  return m ? m[1] : null;
}

export interface PortProbeChips {
  /** Номер порта для чипа, например «443», или null для ICMP */
  portText: string | null;
  /** Короткий тип для бейджа: TCP, HTTP, ICMP, … */
  kind: string;
}

/**
 * Порт + тип пробы: для ICMP без порта — только ICMP;
 * порт из метки `port`, иначе из имени сервиса.
 * `moduleLabel` — лейбл module blackbox (icmp / http_2xx / …).
 */
export function portProbeChips(
  portLabel: string,
  probeTypes: string[] | undefined,
  serviceName: string,
  moduleLabel?: string | null,
): PortProbeChips {
  const pl = (portLabel ?? "").trim().toLowerCase();
  if (pl === "icmp" || pl === "ping") {
    return { portText: null, kind: "ICMP" };
  }

  const types = [...(probeTypes ?? [])];
  const ml = (moduleLabel ?? "").toLowerCase();
  if (ml.includes("icmp") || ml.includes("ping")) {
    if (!types.map((x) => x.toLowerCase()).includes("icmp")) types.push("icmp");
  }

  const kind = primaryProbeKind(types);
  if (kind === "ICMP") {
    return { portText: null, kind: "ICMP" };
  }
  let raw = (portLabel ?? "").trim();
  if (!raw || raw === "unknown") {
    raw = parsePortFromServiceLabel(serviceName) ?? "";
  }
  if (!raw) {
    return { portText: null, kind };
  }
  return { portText: raw, kind };
}

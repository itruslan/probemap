/**
 * Registry of semantic node kinds for the topology map.
 *
 * `kind` describes WHAT a node represents (vpn-gateway, managed-db, etc.),
 * while `type` in React Flow describes HOW it renders (service, group).
 */

export interface NodeKindDef {
  kind: string;
  /** Display name */
  label: { en: string; ru: string };
  /** Group for the creation menu */
  group: "actor" | "network" | "entry" | "cluster" | "service" | "managed" | "other";
  /** Lucide icon name (used in IconRenderer or as fallback) */
  icon: string;
  /** Default accent color (CSS value) */
  color?: string;
}

export const NODE_KINDS: NodeKindDef[] = [
  // Actors
  { kind: "user", label: { en: "User", ru: "Пользователь" }, group: "actor", icon: "User" },
  { kind: "bot", label: { en: "Bot / Automation", ru: "Бот / Автоматизация" }, group: "actor", icon: "Bot" },
  { kind: "external-system", label: { en: "External System", ru: "Внешняя система" }, group: "actor", icon: "ExternalLink" },

  // Network
  { kind: "vpn-gateway", label: { en: "VPN Gateway", ru: "VPN-шлюз" }, group: "network", icon: "ShieldCheck" },
  { kind: "network-segment", label: { en: "Network Segment", ru: "Сегмент сети" }, group: "network", icon: "Network" },
  { kind: "vpc", label: { en: "VPC", ru: "VPC" }, group: "network", icon: "Cloud" },
  { kind: "interconnect", label: { en: "Interconnect", ru: "Интерконнект" }, group: "network", icon: "Cable" },

  // Entry points
  { kind: "load-balancer", label: { en: "Load Balancer", ru: "Балансировщик" }, group: "entry", icon: "Scale" },
  { kind: "cdn", label: { en: "CDN", ru: "CDN" }, group: "entry", icon: "Globe" },
  { kind: "waf", label: { en: "WAF", ru: "WAF" }, group: "entry", icon: "Shield" },
  { kind: "api-gateway", label: { en: "API Gateway", ru: "API Gateway" }, group: "entry", icon: "Router" },

  // Cluster
  { kind: "k8s-cluster", label: { en: "Kubernetes Cluster", ru: "Кластер Kubernetes" }, group: "cluster", icon: "Container" },

  // Service (default for nodes from metrics)
  { kind: "service", label: { en: "Service", ru: "Сервис" }, group: "service", icon: "Globe" },

  // Managed resources
  { kind: "managed-db", label: { en: "Managed Database", ru: "Managed БД" }, group: "managed", icon: "Database" },
  { kind: "managed-cache", label: { en: "Managed Cache", ru: "Managed кеш" }, group: "managed", icon: "MemoryStick" },
  { kind: "object-storage", label: { en: "Object Storage", ru: "Объектное хранилище" }, group: "managed", icon: "HardDrive" },
  { kind: "dns", label: { en: "DNS", ru: "DNS" }, group: "managed", icon: "Globe" },

  // Fallback
  { kind: "custom", label: { en: "Custom", ru: "Произвольный" }, group: "other", icon: "Box" },
];

export const NODE_KIND_MAP = new Map(NODE_KINDS.map((k) => [k.kind, k]));

export const KIND_GROUPS = [
  { key: "actor" as const, label: { en: "Actors", ru: "Акторы" } },
  { key: "network" as const, label: { en: "Network", ru: "Сеть" } },
  { key: "entry" as const, label: { en: "Entry Points", ru: "Точки входа" } },
  { key: "cluster" as const, label: { en: "Cluster", ru: "Кластер" } },
  { key: "service" as const, label: { en: "Services", ru: "Сервисы" } },
  { key: "managed" as const, label: { en: "Managed Resources", ru: "Managed-ресурсы" } },
  { key: "other" as const, label: { en: "Other", ru: "Прочее" } },
] as const;

/** Get kind definition, falling back to "custom" for unknown kinds. */
export function getKindDef(kind: string | undefined): NodeKindDef {
  return NODE_KIND_MAP.get(kind ?? "service") ?? NODE_KIND_MAP.get("custom")!;
}

// ---------------------------------------------------------------------------
// Group visual styles
// ---------------------------------------------------------------------------

export interface GroupVisualStyle {
  /** Left accent bar color (null = no bar). */
  accentColor: string | null;
  /** Card border-radius in px. */
  borderRadius: number;
  /** Min-width of the card. */
  minWidth: number;
}

const GROUP_VISUAL: Record<string, GroupVisualStyle> = {
  service: { accentColor: null,      borderRadius: 8,  minWidth: 140 },
  managed: { accentColor: "#f59e0b", borderRadius: 8,  minWidth: 140 },
  entry:   { accentColor: "#8b5cf6", borderRadius: 8,  minWidth: 140 },
  cluster: { accentColor: "#6366f1", borderRadius: 8,  minWidth: 140 },
  network: { accentColor: "#0ea5e9", borderRadius: 10, minWidth: 120 },
  actor:   { accentColor: null,      borderRadius: 20, minWidth: 100 },
  other:   { accentColor: null,      borderRadius: 12, minWidth: 120 },
};

export function getGroupVisual(kind: string | undefined): GroupVisualStyle {
  const group = getKindDef(kind).group;
  return GROUP_VISUAL[group] ?? GROUP_VISUAL.other;
}

/** Groups where monitoring is optional: no matchServiceId = normal state, not "unknown". */
const MONITORING_OPTIONAL_GROUPS = new Set<string>(["actor", "network", "other"]);

/**
 * Returns true if a kind belongs to a group where monitoring is optional.
 * Nodes of these kinds without matchServiceId show no status indicator at all.
 */
export function isMonitoringOptional(kind: string | undefined): boolean {
  return MONITORING_OPTIONAL_GROUPS.has(getKindDef(kind).group);
}

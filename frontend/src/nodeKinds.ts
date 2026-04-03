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
  /** FA6 icon name for IconRenderer (e.g. "FaUser") */
  icon: string;
  /** Default accent color (CSS value) */
  color?: string;
  /** Hidden from the «Add component» context menu (still available in kind_rules). */
  menuHidden?: boolean;
}

export const NODE_KINDS: NodeKindDef[] = [
  // Actors
  { kind: "user", label: { en: "User", ru: "Пользователь" }, group: "actor", icon: "FaUser" },
  { kind: "bot", label: { en: "Bot / Automation", ru: "Бот / Автоматизация" }, group: "actor", icon: "FaRobot" },
  { kind: "external-system", label: { en: "External System", ru: "Внешняя система" }, group: "actor", icon: "FaArrowUpRightFromSquare" },

  // Network
  { kind: "vpn-gateway", label: { en: "VPN Gateway", ru: "VPN-шлюз" }, group: "network", icon: "FaShieldHalved" },
  { kind: "network-segment", label: { en: "Network Segment", ru: "Сегмент сети" }, group: "network", icon: "FaNetworkWired" },
  { kind: "vpc", label: { en: "VPC", ru: "VPC" }, group: "network", icon: "FaCloud" },
  { kind: "interconnect", label: { en: "Interconnect", ru: "Интерконнект" }, group: "network", icon: "FaPlug" },

  // Entry points
  { kind: "load-balancer", label: { en: "Load Balancer", ru: "Балансировщик" }, group: "entry", icon: "FaScaleBalanced" },
  { kind: "cdn", label: { en: "CDN", ru: "CDN" }, group: "entry", icon: "FaGlobe" },
  { kind: "waf", label: { en: "WAF", ru: "WAF" }, group: "entry", icon: "FaShield" },
  { kind: "api-gateway", label: { en: "API Gateway", ru: "API Gateway" }, group: "entry", icon: "FaRoute" },

  // Generic cluster — shown in context menu (self-managed or any cluster/resource)
  { kind: "cluster", label: { en: "Cluster", ru: "Кластер" }, group: "cluster", icon: "FaLayerGroup" },

  // Service (default for nodes from metrics)
  { kind: "service", label: { en: "Service", ru: "Сервис" }, group: "service", icon: "FaGlobe" },

  // Managed & specific cluster kinds — available for kind_rules, hidden from creation menu
  { kind: "managed-kubernetes", label: { en: "Managed Kubernetes", ru: "Managed Kubernetes" }, group: "cluster", icon: "FaLayerGroup", menuHidden: true },
  { kind: "k8s-cluster", label: { en: "Kubernetes Cluster", ru: "Кластер Kubernetes" }, group: "cluster", icon: "FaLayerGroup", menuHidden: true },
  { kind: "managed-postgresql", label: { en: "Managed PostgreSQL", ru: "Managed PostgreSQL" }, group: "managed", icon: "FaDatabase", menuHidden: true },
  { kind: "managed-mysql", label: { en: "Managed MySQL", ru: "Managed MySQL" }, group: "managed", icon: "FaDatabase", menuHidden: true },
  { kind: "managed-clickhouse", label: { en: "Managed ClickHouse", ru: "Managed ClickHouse" }, group: "managed", icon: "FaDatabase", menuHidden: true },
  { kind: "managed-mongodb", label: { en: "Managed MongoDB", ru: "Managed MongoDB" }, group: "managed", icon: "FaDatabase", menuHidden: true },
  { kind: "managed-redis", label: { en: "Managed Redis", ru: "Managed Redis" }, group: "managed", icon: "FaMicrochip", menuHidden: true },
  { kind: "managed-opensearch", label: { en: "Managed OpenSearch", ru: "Managed OpenSearch" }, group: "managed", icon: "FaDatabase", menuHidden: true },
  { kind: "managed-kafka", label: { en: "Managed Kafka", ru: "Managed Kafka" }, group: "managed", icon: "FaTowerBroadcast", menuHidden: true },
  { kind: "managed-db", label: { en: "Managed Database", ru: "Managed БД" }, group: "managed", icon: "FaDatabase", menuHidden: true },
  { kind: "managed-cache", label: { en: "Managed Cache", ru: "Managed кеш" }, group: "managed", icon: "FaMicrochip", menuHidden: true },
  { kind: "object-storage", label: { en: "Object Storage", ru: "Object Storage" }, group: "managed", icon: "FaHardDrive", menuHidden: true },
  { kind: "dns", label: { en: "DNS", ru: "DNS" }, group: "managed", icon: "FaGlobe", menuHidden: true },

  // Fallback
  { kind: "custom", label: { en: "Custom", ru: "Произвольный" }, group: "other", icon: "FaBox" },
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
// Group kinds (typed containers: VM, K8s, DB clusters, etc.)
// ---------------------------------------------------------------------------

export interface GroupKindDef {
  kind: string;
  label: { en: string; ru: string };
  /** FA6 icon name */
  icon: string;
  /** Whether this group type exposes connection handles */
  hasHandles: boolean;
  /** Default hex color for the area fill */
  defaultColor: string;
}

export const GROUP_KINDS: GroupKindDef[] = [
  // Infrastructure hosts — no handles (arrows go to services inside)
  { kind: "vm",               label: { en: "Virtual Machine",    ru: "Виртуальная машина"   }, icon: "FaServer",         hasHandles: false, defaultColor: "#cbd5e1" },
  { kind: "k8s-cluster",     label: { en: "Kubernetes Cluster", ru: "Кластер Kubernetes"   }, icon: "FaLayerGroup",    hasHandles: false, defaultColor: "#93c5fd" },

  // DB / infra clusters — have handles (connect cluster as whole to other objects)
  { kind: "postgres-cluster",    label: { en: "PostgreSQL Cluster",  ru: "Кластер PostgreSQL"   }, icon: "FaDatabase",      hasHandles: true, defaultColor: "#86efac" },
  { kind: "mysql-cluster",       label: { en: "MySQL Cluster",       ru: "Кластер MySQL"        }, icon: "FaDatabase",      hasHandles: true, defaultColor: "#86efac" },
  { kind: "oracle-cluster",      label: { en: "Oracle DB Cluster",   ru: "Кластер Oracle DB"    }, icon: "FaDatabase",      hasHandles: true, defaultColor: "#fcd34d" },
  { kind: "redis-cluster",       label: { en: "Redis Cluster",       ru: "Кластер Redis"        }, icon: "FaMicrochip",     hasHandles: true, defaultColor: "#f9a8d4" },
  { kind: "kafka-cluster",       label: { en: "Kafka Cluster",       ru: "Кластер Kafka"        }, icon: "FaTowerBroadcast", hasHandles: true, defaultColor: "#c4b5fd" },
  { kind: "mongodb-cluster",     label: { en: "MongoDB Cluster",     ru: "Кластер MongoDB"      }, icon: "FaDatabase",      hasHandles: true, defaultColor: "#86efac" },
  { kind: "opensearch-cluster",  label: { en: "OpenSearch Cluster",  ru: "Кластер OpenSearch"   }, icon: "FaDatabase",      hasHandles: true, defaultColor: "#93c5fd" },
  { kind: "clickhouse-cluster",  label: { en: "ClickHouse Cluster",  ru: "Кластер ClickHouse"   }, icon: "FaDatabase",      hasHandles: true, defaultColor: "#fcd34d" },
  { kind: "generic-cluster",     label: { en: "Self-managed Cluster", ru: "Self-managed кластер" }, icon: "FaCubes",         hasHandles: true, defaultColor: "#cbd5e1" },
];

export const GROUP_KIND_MAP = new Map(GROUP_KINDS.map((k) => [k.kind, k]));

export function getGroupKindDef(kind: string | undefined): GroupKindDef | undefined {
  return kind ? GROUP_KIND_MAP.get(kind) : undefined;
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

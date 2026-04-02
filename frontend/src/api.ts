const BASE = import.meta.env.VITE_API_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new ApiError(r.status, text || `HTTP ${r.status}`);
  }
  return r.json();
}

// ---------------------------------------------------------------------------
// Monitoring types
// ---------------------------------------------------------------------------

/** Статус пробы по источнику (инстанс blackbox и т.п., лейбл из probe_source в настройках) */
export interface ProbeSourceStatus {
  success: 0 | 1 | null;
  duration_ms: number | null;
  probe_types: string[];
}

/** @deprecated используйте ProbeSourceStatus */
export type ZoneStatus = ProbeSourceStatus;

export interface Port {
  port: string;
  /** Имя scrape job (разные blackbox / job в Prometheus) */
  job?: string | null;
  /** Лейбл module у blackbox (http_2xx, tcp_connect, …) */
  module?: string | null;
  status: "ok" | "warn" | "down" | "unknown";
  probe_types: string[];
  /** Ключ — значение лейбла источника пробы (по умолчанию instance) */
  sources: Record<string, ProbeSourceStatus>;
}

export interface Service {
  id: string;
  name: string;
  ports: Port[];
  /** Лейблы из метрик: только согласованные между сериями (без расхождений между blackbox). */
  labels?: Record<string, string>;
  /** Классификация по типу проб для группировки в каталоге: "service" (HTTP/TCP) | "resource" (ICMP/DNS). */
  probe_kind?: "service" | "resource";
}

export interface ServicesResponse {
  services: Service[];
  /** Уникальные значения лейбла источника пробы по всем сериям */
  probe_sources: string[];
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  icon?: string;
  description?: string;
  actions?: ServiceAction[];
  /** Не учитывать источники пробы (значение лейбла probe_source, например instance/pod) */
  ignored_sources?: string[];
}

export interface ServiceAction {
  icon: string;
  label: string;
  url: string;
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  type?: "service" | "group";
  label?: string;
  kind?: string;
  /** Для service-узлов: привязка к сервису из мониторинга по id */
  matchServiceId?: string | null;
  icon?: string;
  width?: number;
  height?: number;
  color?: string;
  group?: string;
  zIndex?: number;
  description?: string;
  actions?: ServiceAction[];
  /** У custom-узла: порты из метрик после привязки к сервису каталога */
  ports?: Port[];
}

export interface DatasourceStatusResponse {
  configured: boolean;
  ok: boolean;
  name?: string | null;
}

export async function fetchDatasourceStatus(): Promise<DatasourceStatusResponse> {
  return apiFetch<DatasourceStatusResponse>(`${BASE}/api/datasource/status`);
}

export interface Group {
  id: string;
  label: string;
  type: "vm" | "kubernetes";
}

/** Метаданные связи (фаза 3 — сетевой путь); хранятся в `edge.data` React Flow. */
export interface LayoutEdgeData extends Record<string, unknown> {
  protocol?: string;
  port?: string;
  description?: string;
}

export function normalizeLayoutEdgeData(data: unknown): LayoutEdgeData {
  if (!data || typeof data !== "object") return {};
  const o = data as Record<string, unknown>;
  const protocol = typeof o.protocol === "string" ? o.protocol.trim() : "";
  const port = typeof o.port === "string" ? o.port.trim() : "";
  const description = typeof o.description === "string" ? o.description : "";
  return {
    protocol: protocol || undefined,
    port: port || undefined,
    description: description || undefined,
  };
}

export interface Layout {
  nodes: LayoutNode[];
  groups: Group[];
  edges: Record<string, unknown>[];
  service_configs?: Record<string, ServiceConfig>;
}

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------

export interface Datasource {
  name: string;
  type: string;
  url: string;
}

export interface ProbeJob {
  job: string;
  enabled: boolean;
}

export interface LabelMap {
  service: string;
  port: string;
  /** Имя лейбла в метриках для различения инстансов blackbox (часто instance) */
  probe_source: string;
  module: string;
  url: string | null;
}

/** Оператор сравнения лейбла в PromQL */
export type MetricFilterOp = "eq" | "re" | "ne" | "nre";

export interface MetricFilterRule {
  label: string;
  value: string;
  op: MetricFilterOp;
}

export interface AppConfig {
  datasource: Datasource | null;
  probe_jobs: ProbeJob[];
  label_map: LabelMap;
  /** Правила лейбл + значение (конструктор) */
  metric_filter_rules?: MetricFilterRule[];
  /**
   * false — после сохранения URL показан только шаг выбора job; true — полные настройки.
   * В старых конфигах ключ отсутствует → считаем true (миграция).
   */
  settings_targets_saved?: boolean;
  /** true — URL в datasource взят из PROBEMAP_DATASOURCE_URL (не только из config.json). */
  datasource_url_from_env?: boolean;
}

export interface MetricSelectorPreview {
  selector: string;
  example: string;
}

export interface DiscoveredJob {
  job: string;
  probe_sources: string[];
}

// ---------------------------------------------------------------------------
// Project types
// ---------------------------------------------------------------------------

export interface ProjectFilter {
  label: string;
  value: string;
}

export interface Project {
  id: string;
  name: string;
  filter: ProjectFilter | null;
  /** Несколько условий label=value для метрик проекта */
  filters?: ProjectFilter[] | null;
}

// ---------------------------------------------------------------------------
// Legacy service / layout API (no project)
// ---------------------------------------------------------------------------

export async function fetchServices(): Promise<ServicesResponse> {
  const raw = await apiFetch<ServicesResponse & { zones?: string[] }>(`${BASE}/api/services`);
  const probe_sources = raw.probe_sources ?? raw.zones ?? [];
  const services = raw.services.map((svc) => ({
    ...svc,
    ports: svc.ports.map((p) => {
      const legacy = p as Port & { zones?: Record<string, ProbeSourceStatus> };
      return { ...p, sources: p.sources ?? legacy.zones ?? {} };
    }),
  }));
  return { services, probe_sources };
}

export async function fetchLayout(): Promise<Layout> {
  return apiFetch<Layout>(`${BASE}/api/layout`);
}

export async function saveLayout(layout: Layout): Promise<void> {
  await apiFetch(`${BASE}/api/layout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
}

// ---------------------------------------------------------------------------
// Project API
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  return apiFetch<Project[]>(`${BASE}/api/projects`);
}

export async function createProject(name: string, filters: ProjectFilter[]): Promise<Project> {
  return apiFetch<Project>(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      filters: filters.length > 0 ? filters : undefined,
    }),
  });
}

export async function updateProject(id: string, data: Partial<Omit<Project, "id">>): Promise<Project> {
  return apiFetch<Project>(`${BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  const r = await fetch(`${BASE}/api/projects/${id}`, { method: "DELETE" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new ApiError(r.status, text || `HTTP ${r.status}`);
  }
}

export async function fetchProjectFilterValues(id: string, label?: string): Promise<string[]> {
  const q = label ? `?label=${encodeURIComponent(label)}` : "";
  return apiFetch<string[]>(`${BASE}/api/projects/${id}/filter-values${q}`);
}

/** Значения лейбла из VictoriaMetrics (без id проекта — для нового проекта) */
export async function fetchMetricLabelValues(label: string): Promise<string[]> {
  return apiFetch<string[]>(
    `${BASE}/api/config/metric-label-values?label=${encodeURIComponent(label)}`,
  );
}

export async function fetchProjectServices(id: string): Promise<ServicesResponse> {
  return apiFetch<ServicesResponse>(`${BASE}/api/projects/${id}/services`);
}

export async function fetchProjectLayout(id: string): Promise<Layout> {
  return apiFetch<Layout>(`${BASE}/api/projects/${id}/layout`);
}

export async function saveProjectLayout(id: string, layout: Layout): Promise<void> {
  await apiFetch(`${BASE}/api/projects/${id}/layout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
}

// ---------------------------------------------------------------------------
// Config API
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<AppConfig> {
  return apiFetch<AppConfig>(`${BASE}/api/config`);
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await apiFetch(`${BASE}/api/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
}

/** Превью селектора probe_success (как на сервере). Пары фильтра проекта — как в /api/projects/{id}/services. */
export async function previewMetricSelector(body: {
  probe_jobs: ProbeJob[];
  metric_filter_rules?: MetricFilterRule[];
  project_filter_pairs?: { label: string; value: string }[];
}): Promise<MetricSelectorPreview> {
  return apiFetch<MetricSelectorPreview>(`${BASE}/api/config/preview-selector`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function testDatasource(url: string): Promise<boolean> {
  const r = await fetch(`${BASE}/api/config/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) return false;
  const data = await r.json();
  return data.ok === true;
}

export async function discoverJobs(): Promise<DiscoveredJob[]> {
  return apiFetch<DiscoveredJob[]>(`${BASE}/api/config/discover/jobs`).catch(() => []);
}

/** Список job по явному URL (без сохранения конфига). */
export async function discoverJobsForUrl(
  url: string,
  labelMap?: AppConfig["label_map"],
): Promise<DiscoveredJob[]> {
  return apiFetch<DiscoveredJob[]>(`${BASE}/api/config/discover/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      ...(labelMap ? { label_map: labelMap } : {}),
    }),
  }).catch(() => []);
}

export async function discoverLabels(): Promise<string[]> {
  return apiFetch<string[]>(`${BASE}/api/config/discover/labels`).catch(() => []);
}

/** Список лейблов probe_success по явному URL (без сохранения конфига). */
export async function discoverLabelsForUrl(url: string): Promise<string[]> {
  return apiFetch<string[]>(`${BASE}/api/config/discover/labels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  }).catch(() => []);
}

// ---------------------------------------------------------------------------
// Icons API
// ---------------------------------------------------------------------------

export interface CustomIcon {
  name: string;
  url: string;
}

export async function fetchIcons(): Promise<CustomIcon[]> {
  const data = await apiFetch<{ icons: CustomIcon[] }>(`${BASE}/api/icons`);
  return data.icons;
}

export async function uploadIcon(name: string, file: File): Promise<CustomIcon> {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  return apiFetch<CustomIcon>(`${BASE}/api/icons`, { method: "POST", body: form });
}

export async function deleteIcon(name: string): Promise<void> {
  const r = await fetch(`${BASE}/api/icons/${name}`, { method: "DELETE" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new ApiError(r.status, text || `HTTP ${r.status}`);
  }
}

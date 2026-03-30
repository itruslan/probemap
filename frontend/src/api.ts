const BASE = import.meta.env.VITE_API_URL ?? "";

class ApiError extends Error {
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

export interface ZoneStatus {
  success: 0 | 1 | null;
  duration_ms: number | null;
  probe_types: string[];
}

export interface Port {
  port: string;
  status: "ok" | "warn" | "down" | "unknown";
  probe_types: string[];
  zones: Record<string, ZoneStatus>;
}

export interface Service {
  id: string;
  name: string;
  ports: Port[];
}

export interface ServicesResponse {
  services: Service[];
  zones: string[];
}

// ---------------------------------------------------------------------------
// Layout types
// ---------------------------------------------------------------------------

export interface ServiceConfig {
  icon?: string;
  description?: string;
  actions?: ServiceAction[];
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
  type?: "service" | "custom" | "group";
  label?: string;
  kind?: string;
  icon?: string;
  width?: number;
  height?: number;
  color?: string;
  group?: string;
  zIndex?: number;
  description?: string;
  actions?: ServiceAction[];
}

export interface Group {
  id: string;
  label: string;
  type: "vm" | "kubernetes";
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
  zone: string;
  module: string;
  url: string | null;
}

export interface AppConfig {
  datasource: Datasource | null;
  probe_jobs: ProbeJob[];
  label_map: LabelMap;
}

export interface DiscoveredJob {
  job: string;
  zones: string[];
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
}

// ---------------------------------------------------------------------------
// Legacy service / layout API (no project)
// ---------------------------------------------------------------------------

export async function fetchServices(): Promise<ServicesResponse> {
  return apiFetch<ServicesResponse>(`${BASE}/api/services`);
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

export async function createProject(name: string, filter: ProjectFilter | null): Promise<Project> {
  return apiFetch<Project>(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filter }),
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

export async function fetchProjectFilterValues(id: string): Promise<string[]> {
  return apiFetch<string[]>(`${BASE}/api/projects/${id}/filter-values`);
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

export async function discoverLabels(): Promise<string[]> {
  return apiFetch<string[]>(`${BASE}/api/config/discover/labels`).catch(() => []);
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

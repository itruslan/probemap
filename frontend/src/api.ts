const BASE = import.meta.env.VITE_API_URL ?? "";

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
  const r = await fetch(`${BASE}/api/services`);
  return r.json();
}

export async function fetchLayout(): Promise<Layout> {
  const r = await fetch(`${BASE}/api/layout`);
  return r.json();
}

export async function saveLayout(layout: Layout): Promise<void> {
  await fetch(`${BASE}/api/layout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
}

// ---------------------------------------------------------------------------
// Project API
// ---------------------------------------------------------------------------

export async function fetchProjects(): Promise<Project[]> {
  const r = await fetch(`${BASE}/api/projects`);
  return r.json();
}

export async function createProject(name: string, filter: ProjectFilter | null): Promise<Project> {
  const r = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, filter }),
  });
  return r.json();
}

export async function updateProject(id: string, data: Partial<Omit<Project, "id">>): Promise<Project> {
  const r = await fetch(`${BASE}/api/projects/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteProject(id: string): Promise<void> {
  await fetch(`${BASE}/api/projects/${id}`, { method: "DELETE" });
}

export async function fetchProjectFilterValues(id: string): Promise<string[]> {
  const r = await fetch(`${BASE}/api/projects/${id}/filter-values`);
  return r.json();
}

export async function fetchProjectServices(id: string): Promise<ServicesResponse> {
  const r = await fetch(`${BASE}/api/projects/${id}/services`);
  return r.json();
}

export async function fetchProjectLayout(id: string): Promise<Layout> {
  const r = await fetch(`${BASE}/api/projects/${id}/layout`);
  return r.json();
}

export async function saveProjectLayout(id: string, layout: Layout): Promise<void> {
  await fetch(`${BASE}/api/projects/${id}/layout`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(layout),
  });
}

// ---------------------------------------------------------------------------
// Config API
// ---------------------------------------------------------------------------

export async function fetchConfig(): Promise<AppConfig> {
  const r = await fetch(`${BASE}/api/config`);
  return r.json();
}

export async function saveConfig(cfg: AppConfig): Promise<void> {
  await fetch(`${BASE}/api/config`, {
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
  const data = await r.json();
  return data.ok === true;
}

export async function discoverJobs(): Promise<DiscoveredJob[]> {
  const r = await fetch(`${BASE}/api/config/discover/jobs`);
  if (!r.ok) return [];
  return r.json();
}

export async function discoverLabels(): Promise<string[]> {
  const r = await fetch(`${BASE}/api/config/discover/labels`);
  if (!r.ok) return [];
  return r.json();
}

// ---------------------------------------------------------------------------
// Icons API
// ---------------------------------------------------------------------------

export interface CustomIcon {
  name: string;
  url: string;
}

export async function fetchIcons(): Promise<CustomIcon[]> {
  const r = await fetch(`${BASE}/api/icons`);
  const data = await r.json();
  return data.icons;
}

export async function uploadIcon(name: string, file: File): Promise<CustomIcon> {
  const form = new FormData();
  form.append("name", name);
  form.append("file", file);
  const r = await fetch(`${BASE}/api/icons`, { method: "POST", body: form });
  return r.json();
}

export async function deleteIcon(name: string): Promise<void> {
  await fetch(`${BASE}/api/icons/${name}`, { method: "DELETE" });
}

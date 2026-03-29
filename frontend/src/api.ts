const BASE = import.meta.env.VITE_API_URL ?? "";

export interface ZoneStatus {
  success: 0 | 1 | null;
  duration_ms: number | null;
}

export interface Port {
  port: string;
  status: "ok" | "warn" | "down" | "unknown";
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

export interface Layout {
  nodes: LayoutNode[];
  groups: Group[];
  edges: Edge[];
}

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  group?: string;
}

export interface Group {
  id: string;
  label: string;
  type: "vm" | "kubernetes";
}

export interface Edge {
  from: { service: string; port: string };
  to: { service: string; port: string };
  label?: string;
}

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

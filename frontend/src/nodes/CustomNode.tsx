import { type NodeProps } from "@xyflow/react";
import { AllHandles } from "./handles";

const ICONS: Record<string, string> = {
  client: "👤",
  external: "🌐",
  internet: "☁️",
  database: "🗄️",
  custom: "📦",
};

export interface CustomNodeData {
  label: string;
  kind: string;
}

export function CustomNode({ data }: NodeProps) {
  const d = data as unknown as CustomNodeData;
  const icon = ICONS[d.kind] ?? ICONS.custom;

  return (
    <div
      style={{
        background: "#f8fafc",
        border: "1.5px dashed #94a3b8",
        borderRadius: 8,
        padding: "8px 14px",
        minWidth: 100,
        textAlign: "center",
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        position: "relative",
      }}
    >
      <AllHandles />
      <div style={{ fontSize: 20, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 12, color: "#475569", fontWeight: 500 }}>{d.label}</div>
    </div>
  );
}

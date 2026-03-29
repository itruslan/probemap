import { Handle, type NodeProps, Position } from "@xyflow/react";
import type { Port, ZoneStatus } from "../api";
import { useState } from "react";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warn: "#f97316",
  down: "#ef4444",
  unknown: "#9ca3af",
};

function ZoneTooltip({ zones }: { zones: Record<string, ZoneStatus> }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: "50%",
        transform: "translateX(-50%)",
        background: "#1e293b",
        color: "#f1f5f9",
        borderRadius: 6,
        padding: "6px 10px",
        fontSize: 12,
        whiteSpace: "nowrap",
        zIndex: 100,
        pointerEvents: "none",
        boxShadow: "0 2px 8px rgba(0,0,0,.4)",
      }}
    >
      {Object.entries(zones).map(([zone, s]) => (
        <div key={zone}>
          <span style={{ color: s.success === 1 ? "#22c55e" : "#ef4444" }}>
            {s.success === 1 ? "✓" : "✗"}
          </span>{" "}
          {zone}{" "}
          {s.duration_ms != null && (
            <span style={{ color: "#94a3b8" }}>{s.duration_ms}ms</span>
          )}
        </div>
      ))}
    </div>
  );
}

function PortDot({ port }: { port: Port }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Handle
        type="source"
        position={Position.Right}
        id={port.port}
        style={{
          position: "static",
          transform: "none",
          width: 12,
          height: 12,
          background: STATUS_COLOR[port.status],
          border: "2px solid #fff",
          cursor: "crosshair",
        }}
      />
      <span style={{ fontSize: 11, color: "#64748b" }}>:{port.port}</span>
      {hover && <ZoneTooltip zones={port.zones} />}
    </div>
  );
}

export interface ServiceNodeData {
  label: string;
  ports: Port[];
}

export function ServiceNode({ data }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px solid #cbd5e1",
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 140,
        boxShadow: "0 1px 4px rgba(0,0,0,.1)",
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: "#0f172a" }}>
        {d.label}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {d.ports.map((p) => (
          <PortDot key={p.port} port={p} />
        ))}
      </div>
    </div>
  );
}

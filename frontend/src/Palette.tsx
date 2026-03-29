import { useState } from "react";
import type { Service } from "./api";

export interface CustomStencil {
  kind: string;
  label: string;
}

const STENCILS: CustomStencil[] = [
  { kind: "client",   label: "Клиент" },
  { kind: "internet", label: "Интернет" },
];

const ICONS: Record<string, string> = {
  client: "👤",
  external: "🌐",
  internet: "☁️",
  database: "🗄️",
  custom: "📦",
};

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  onDragStart: (service: Service) => void;
  onDragStartCustom: (stencil: CustomStencil) => void;
  onAddCustom: (stencil: CustomStencil) => void;
  onAddGroup: () => void;
}

export function Palette({ services, onCanvas, onDragStart, onDragStartCustom, onAddCustom, onAddGroup }: PaletteProps) {
  const [customLabel, setCustomLabel] = useState("");

  return (
    <div
      style={{
        width: 180,
        borderRight: "1px solid #e2e8f0",
        padding: "12px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "#f8fafc",
        overflowY: "auto",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 4, paddingLeft: 4 }}>
        СЕРВИСЫ
      </div>
      {services.map((svc) => {
        const placed = onCanvas.has(svc.id);
        return (
          <div
            key={svc.id}
            draggable={!placed}
            onDragStart={() => onDragStart(svc)}
            style={{
              padding: "6px 10px",
              borderRadius: 6,
              background: placed ? "#f1f5f9" : "#fff",
              border: "1.5px solid #e2e8f0",
              cursor: placed ? "default" : "grab",
              fontSize: 13,
              color: placed ? "#94a3b8" : "#0f172a",
              userSelect: "none",
            }}
          >
            {svc.name}
          </div>
        );
      })}

      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "10px 0 4px", paddingLeft: 4 }}>
        ОБЛАСТИ
      </div>
      <div
        onClick={onAddGroup}
        style={{
          padding: "6px 10px",
          borderRadius: 6,
          background: "#fff",
          border: "2px dashed #cbd5e1",
          cursor: "pointer",
          fontSize: 13,
          color: "#64748b",
          userSelect: "none",
          display: "flex",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span>▭</span> Добавить область
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", margin: "10px 0 4px", paddingLeft: 4 }}>
        ОБЪЕКТЫ
      </div>
      {STENCILS.map((s) => (
        <div
          key={s.kind}
          draggable
          onDragStart={() => onDragStartCustom(s)}
          onDoubleClick={() => onAddCustom(s)}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            background: "#fff",
            border: "1.5px dashed #cbd5e1",
            cursor: "grab",
            fontSize: 13,
            color: "#475569",
            userSelect: "none",
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <span>{ICONS[s.kind]}</span>
          {s.label}
        </div>
      ))}

      <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
        <input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          placeholder="Своё название..."
          style={{
            flex: 1,
            padding: "5px 8px",
            borderRadius: 6,
            border: "1.5px solid #e2e8f0",
            fontSize: 12,
            outline: "none",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && customLabel.trim()) {
              onAddCustom({ kind: "external", label: customLabel.trim() });
              setCustomLabel("");
            }
          }}
        />
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", paddingLeft: 4 }}>
        ↑ Enter чтобы добавить
      </div>
    </div>
  );
}

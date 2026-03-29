import type { Service } from "./api";

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  onDragStart: (service: Service) => void;
}

export function Palette({ services, onCanvas, onDragStart }: PaletteProps) {
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
    </div>
  );
}

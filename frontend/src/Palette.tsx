import { useState } from "react";
import type { Service } from "./api";

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  onDragStart: (service: Service) => void;
  onToggleService: (service: Service) => void;
}

export function Palette({ services, onCanvas, onDragStart, onToggleService }: PaletteProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(true);

  const filtered = services
    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  const onCanvasCount = services.filter((s) => onCanvas.has(s.id)).length;

  return (
    <div
      style={{
        width: 200,
        borderRight: "1px solid #e2e8f0",
        padding: "12px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: "#f8fafc",
        overflowY: "auto",
      }}
    >
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 4px 4px 8px",
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8" }}>СЕРВИСЫ</span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>{onCanvasCount}/{services.length}</span>
        <span style={{ fontSize: 10, color: "#94a3b8" }}>{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск..."
            style={{
              margin: "0 4px",
              padding: "5px 8px",
              borderRadius: 6,
              border: "1.5px solid #e2e8f0",
              fontSize: 12,
              outline: "none",
              width: "calc(100% - 8px)",
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {filtered.map((svc) => {
              const active = onCanvas.has(svc.id);
              return (
                <div
                  key={svc.id}
                  draggable={!active}
                  onDragStart={() => onDragStart(svc)}
                  style={{
                    padding: "5px 8px",
                    borderRadius: 6,
                    background: active ? "#eff6ff" : "#fff",
                    borderLeft: active ? "3px solid #3b82f6" : "3px solid #cbd5e1",
                    fontSize: 12,
                    color: "#0f172a",
                    userSelect: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    transition: "background 0.15s",
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                    {svc.name}
                  </span>
                  <button
                    onClick={() => onToggleService(svc)}
                    title={active ? "Убрать с карты" : "Добавить на карту"}
                    style={{
                      flexShrink: 0,
                      width: 18, height: 18,
                      borderRadius: "50%",
                      border: "none",
                      background: active ? "#fee2e2" : "#dcfce7",
                      color: active ? "#ef4444" : "#16a34a",
                      cursor: "pointer",
                      fontSize: 13, lineHeight: 1,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 0,
                    }}
                  >
                    {active ? "×" : "+"}
                  </button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ fontSize: 11, color: "#94a3b8", padding: "4px 8px" }}>Ничего не найдено</div>
            )}
          </div>
        </>
      )}

      <div style={{ marginTop: "auto", paddingTop: 8, fontSize: 10, color: "#cbd5e1", textAlign: "center", lineHeight: 1.4 }}>
        ПКМ на холсте<br />для добавления объектов
      </div>
    </div>
  );
}

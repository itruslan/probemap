import { useState } from "react";
import type { Service } from "./api";

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  onDragStart: (service: Service) => void;
  onToggleService: (service: Service) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Подсветка узла на карте при наведении (только если узел из мониторинга уже на карте) */
  onHoverChange: (id: string | null) => void;
}

export function Palette({
  services,
  onCanvas,
  onDragStart,
  onToggleService: _onToggleService,
  selectedId,
  onSelect,
  onHoverChange,
}: PaletteProps) {
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const filtered = services
    .filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aOn = onCanvas.has(a.id);
      const bOn = onCanvas.has(b.id);
      if (aOn !== bOn) return aOn ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    });

  const handleMouseEnter = (svc: Service) => {
    setHoveredId(svc.id);
    if (onCanvas.has(svc.id)) onHoverChange(svc.id);
    else onHoverChange(null);
  };

  const handleMouseLeave = () => {
    setHoveredId(null);
    onHoverChange(null);
  };

  // Клик фиксирует выделение на карте; повторный клик по той же строке снимает
  const handleClick = (svc: Service) => {
    if (!onCanvas.has(svc.id)) return;
    if (selectedId === svc.id) {
      onSelect(null);
    } else {
      onSelect(svc.id);
    }
  };

  const handlePaletteLeave = () => {
    setHoveredId(null);
    onHoverChange(null);
  };

  return (
    <aside className="palette-sidebar" onMouseLeave={handlePaletteLeave}>
      <div className="palette-sidebar__header">
        <span className="palette-sidebar__title">Узлы</span>
        <span className="palette-sidebar__count">{services.length}</span>
      </div>

      <input
        className="palette-sidebar__search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск…"
        type="search"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="palette-sidebar__list">
        {filtered.map((svc) => {
          const active = onCanvas.has(svc.id);
          const selected = active && selectedId === svc.id;
          const hovered = hoveredId === svc.id;

          const rowClass = [
            "palette-row",
            !active && "palette-row--missing",
            active && "palette-row--on-canvas",
            active && hovered && "palette-row--hover",
            active && selected && "palette-row--selected",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={svc.id}
              draggable
              onDragStart={() => onDragStart(svc)}
              onClick={() => handleClick(svc)}
              onMouseEnter={() => handleMouseEnter(svc)}
              onMouseLeave={handleMouseLeave}
              className={rowClass}
            >
              {svc.name}
              {!active && hovered && (
                <span style={{
                  position: "absolute", right: 8, top: 0, bottom: 0,
                  display: "flex", alignItems: "center",
                  fontSize: 10, color: "#ef4444", fontWeight: 500,
                  pointerEvents: "none",
                }}>
                  отсутствует на карте
                </span>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="palette-sidebar__empty">Ничего не найдено</div>
        )}
      </div>

      <p className="palette-sidebar__hint">
        Список из мониторинга. ПКМ на карте — добавить узел или область
      </p>
    </aside>
  );
}

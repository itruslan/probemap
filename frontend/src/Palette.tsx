import { memo, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import type { Service } from "./api";
import { useI18n } from "./i18n";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warn: "#f97316",
  down: "#ef4444",
  unknown: "#9ca3af",
};

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  /** Добавить сервис из мониторинга на карту */
  onAddService: (service: Service) => void;
  /** Добавить пустой кастомный объект на карту */
  onAddObject: () => void;
  /** Добавить generic-область на карту */
  onAddArea: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Подсветка сервиса на карте при наведении */
  onHoverChange: (id: string | null) => void;
  /** Данные устарели — без добавления */
  readOnly?: boolean;
  /** service id → status string (ok|warn|down|unknown) */
  statusMap?: Record<string, string>;
}

export const Palette = memo(function Palette({
  services,
  onCanvas,
  onAddService,
  onAddObject,
  onAddArea,
  readOnly = false,
  selectedId,
  onSelect,
  onHoverChange,
  statusMap,
}: PaletteProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const sortSvc = (a: Service, b: Service) => {
    const aOn = onCanvas.has(a.id);
    const bOn = onCanvas.has(b.id);
    if (aOn !== bOn) return aOn ? -1 : 1;
    return a.name.localeCompare(b.name, "ru");
  };

  const filtered = services.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = {
    service: filtered.filter((s) => (s.probe_kind ?? "service") === "service").sort(sortSvc),
    resource: filtered.filter((s) => s.probe_kind === "resource").sort(sortSvc),
  };
  const hasMultipleGroups = grouped.service.length > 0 && grouped.resource.length > 0;

  const handleMouseEnter = (svc: Service) => {
    setHoveredId(svc.id);
    if (onCanvas.has(svc.id)) onHoverChange(svc.id);
    else onHoverChange(null);
  };

  const handleMouseLeave = () => {
    setHoveredId(null);
    onHoverChange(null);
  };

  const handleClick = (svc: Service) => {
    if (!onCanvas.has(svc.id)) return;
    if (selectedId === svc.id) onSelect(null);
    else onSelect(svc.id);
  };

  const handlePaletteLeave = () => {
    setHoveredId(null);
    onHoverChange(null);
  };

  return (
    <aside
      className="palette-sidebar"
      onMouseLeave={handlePaletteLeave}
      style={readOnly ? { opacity: 0.72 } : undefined}
    >
      {/* Быстрое добавление: Область + Объект */}
      <div className="palette-sidebar__tabs">
        <button
          type="button"
          disabled={readOnly}
          className="palette-sidebar__tab"
          onClick={onAddArea}
          title={t("paletteArea")}
        >
          <FaPlus size={9} aria-hidden style={{ marginRight: 4, verticalAlign: "middle" }} />
          {t("paletteArea")}
        </button>
        <button
          type="button"
          disabled={readOnly}
          className="palette-sidebar__tab"
          onClick={onAddObject}
          title={t("paletteObject")}
        >
          <FaPlus size={9} aria-hidden style={{ marginRight: 4, verticalAlign: "middle" }} />
          {t("paletteObject")}
        </button>
      </div>

      {/* Поиск по сервисам */}
      <input
        className="palette-sidebar__search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        type="search"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="palette-sidebar__section-header palette-sidebar__section-header--with-count">
        {t("servicesTitle")}
        <span className="palette-sidebar__count">{services.length}</span>
      </div>

      <div className="palette-sidebar__list">
        {filtered.length === 0 && (
          <div className="palette-sidebar__empty">{t("nothingFound")}</div>
        )}
        {(["service", "resource"] as const).map((kind) => {
          const group = grouped[kind];
          if (group.length === 0) return null;
          return (
            <div key={kind}>
              {hasMultipleGroups && (
                <div className="palette-sidebar__section-header">
                  {kind === "service" ? t("paletteSectionServices") : t("paletteSectionResources")}
                </div>
              )}
              {group.map((svc) => {
                const active = onCanvas.has(svc.id);
                const selected = active && selectedId === svc.id;
                const hovered = hoveredId === svc.id;
                const statusColor = STATUS_COLOR[statusMap?.[svc.id] ?? "unknown"] ?? STATUS_COLOR.unknown;

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
                    onClick={() => handleClick(svc)}
                    onMouseEnter={() => handleMouseEnter(svc)}
                    onMouseLeave={handleMouseLeave}
                    className={rowClass}
                    style={selected ? { "--palette-row-accent": statusColor } as never : undefined}
                  >
                    <span className="palette-row__name">{svc.name}</span>
                    {!active && !readOnly && (
                      <button
                        type="button"
                        className="probemap-btn palette-row__add"
                        aria-label={t("paletteAdd")}
                        title={t("paletteAdd")}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddService(svc);
                        }}
                      >
                        <FaPlus size={11} aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
});

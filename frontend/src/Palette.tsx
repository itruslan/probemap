import { useEffect, useRef, useState } from "react";
import { FaCircleQuestion, FaPlus } from "react-icons/fa6";
import type { Service } from "./api";
import { useI18n } from "./i18n";
import { HoverTooltip } from "./Tooltip";
import { useIsDraggingOnCanvas } from "./DragContext";

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  /** Добавить сервис на карту (тот же путь, что выбор сервиса в ПКМ) */
  onAddService: (service: Service) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Подсветка сервиса на карте при наведении (только если сервис из мониторинга уже на карте) */
  onHoverChange: (id: string | null) => void;
  /** Данные устарели — без перетаскивания и добавления */
  readOnly?: boolean;
}

export function Palette({
  services,
  onCanvas,
  onAddService,
  readOnly = false,
  selectedId,
  onSelect,
  onHoverChange,
}: PaletteProps) {
  const { t } = useI18n();
  const dragging = useIsDraggingOnCanvas();
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [servicesHelpTarget, setServicesHelpTarget] = useState<HTMLElement | null>(null);
  const servicesHelpHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearServicesHelpHideTimer = () => {
    if (servicesHelpHideTimer.current) {
      clearTimeout(servicesHelpHideTimer.current);
      servicesHelpHideTimer.current = null;
    }
  };

  const showServicesHelp = (el: HTMLElement) => {
    if (dragging) return;
    clearServicesHelpHideTimer();
    setServicesHelpTarget(el);
  };

  const scheduleHideServicesHelp = () => {
    clearServicesHelpHideTimer();
    servicesHelpHideTimer.current = setTimeout(() => {
      setServicesHelpTarget(null);
      servicesHelpHideTimer.current = null;
    }, 220);
  };

  useEffect(() => () => clearServicesHelpHideTimer(), []);
  useEffect(() => {
    if (!dragging) return;
    clearServicesHelpHideTimer();
    setServicesHelpTarget(null);
  }, [dragging]);

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
    <aside
      className="palette-sidebar"
      onMouseLeave={handlePaletteLeave}
      style={readOnly ? { opacity: 0.72 } : undefined}
    >
      <div className="palette-sidebar__header">
        <span className="palette-sidebar__title-wrap">
          <span className="palette-sidebar__title">{t("servicesTitle")}</span>
          <button
            type="button"
            className="probemap-btn palette-sidebar__help"
            aria-label={t("servicesPaletteHelpAria")}
            onMouseEnter={(e) => showServicesHelp(e.currentTarget)}
            onMouseLeave={scheduleHideServicesHelp}
          >
            <FaCircleQuestion aria-hidden className="palette-sidebar__help-icon" />
          </button>
        </span>
        <span className="palette-sidebar__count">{services.length}</span>
      </div>

      <input
        className="palette-sidebar__search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        type="search"
        autoComplete="off"
        spellCheck={false}
      />

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

      {servicesHelpTarget && !dragging && (
        <HoverTooltip
          targetEl={servicesHelpTarget}
          label={t("monitoringHint")}
          multiline
          placement="below"
          onInteractiveEnter={clearServicesHelpHideTimer}
          onInteractiveLeave={scheduleHideServicesHelp}
        />
      )}
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { FaCircleQuestion } from "react-icons/fa6";
import type { Service } from "./api";
import { useI18n } from "./i18n";
import { HoverTooltip } from "./Tooltip";

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  onDragStart: (service: Service) => void;
  /** Добавить сервис на карту (тот же путь, что выбор сервиса в ПКМ) */
  onAddService: (service: Service) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Подсветка узла на карте при наведении (только если узел из мониторинга уже на карте) */
  onHoverChange: (id: string | null) => void;
  /** Данные устарели — без перетаскивания и добавления */
  readOnly?: boolean;
}

export function Palette({
  services,
  onCanvas,
  onDragStart,
  onAddService,
  readOnly = false,
  selectedId,
  onSelect,
  onHoverChange,
}: PaletteProps) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [nodesHelpTarget, setNodesHelpTarget] = useState<HTMLElement | null>(null);
  const nodesHelpHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearNodesHelpHideTimer = () => {
    if (nodesHelpHideTimer.current) {
      clearTimeout(nodesHelpHideTimer.current);
      nodesHelpHideTimer.current = null;
    }
  };

  const showNodesHelp = (el: HTMLElement) => {
    clearNodesHelpHideTimer();
    setNodesHelpTarget(el);
  };

  const scheduleHideNodesHelp = () => {
    clearNodesHelpHideTimer();
    nodesHelpHideTimer.current = setTimeout(() => {
      setNodesHelpTarget(null);
      nodesHelpHideTimer.current = null;
    }, 220);
  };

  useEffect(() => () => clearNodesHelpHideTimer(), []);

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
    <aside
      className="palette-sidebar"
      onMouseLeave={handlePaletteLeave}
      style={readOnly ? { opacity: 0.72 } : undefined}
    >
      <div className="palette-sidebar__header">
        <span className="palette-sidebar__title-wrap">
          <span className="palette-sidebar__title">{t("nodesTitle")}</span>
          <button
            type="button"
            className="palette-sidebar__help"
            aria-label={t("nodesPaletteHelpAria")}
            onMouseEnter={(e) => showNodesHelp(e.currentTarget)}
            onMouseLeave={scheduleHideNodesHelp}
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
              draggable={!readOnly}
              onDragStart={() => {
                if (!readOnly) onDragStart(svc);
              }}
              onClick={() => handleClick(svc)}
              onMouseEnter={() => handleMouseEnter(svc)}
              onMouseLeave={handleMouseLeave}
              className={rowClass}
            >
              <span className="palette-row__name">{svc.name}</span>
              {!active && !readOnly && (
                <button
                  type="button"
                  className="palette-row__add"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddService(svc);
                  }}
                >
                  {t("paletteAdd")}
                </button>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="palette-sidebar__empty">{t("nothingFound")}</div>
        )}
      </div>

      {nodesHelpTarget && (
        <HoverTooltip
          targetEl={nodesHelpTarget}
          label={t("monitoringHint")}
          multiline
          placement="below"
          onInteractiveEnter={clearNodesHelpHideTimer}
          onInteractiveLeave={scheduleHideNodesHelp}
        />
      )}
    </aside>
  );
}

import { useEffect, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import type { Service } from "./api";
import { useI18n, type I18nKey } from "./i18n";
import { KIND_GROUPS, NODE_KINDS, type NodeKindDef } from "./nodeKinds";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warn: "#f97316",
  down: "#ef4444",
  unknown: "#9ca3af",
};

// i18n key for each group key
const KIND_GROUP_I18N: Record<string, string> = {
  actor: "kindGroupActor",
  network: "kindGroupNetwork",
  entry: "kindGroupEntry",
  cluster: "kindGroupCluster",
  service: "kindGroupService",
  managed: "kindGroupManaged",
  other: "kindGroupOther",
};

interface PaletteProps {
  services: Service[];
  onCanvas: Set<string>;
  /** Добавить сервис на карту (тот же путь, что выбор сервиса в ПКМ) */
  onAddService: (service: Service) => void;
  /** Добавить произвольный компонент на карту */
  onAddComponent: (kindDef: NodeKindDef) => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Подсветка сервиса на карте при наведении (только если сервис из мониторинга уже на карте) */
  onHoverChange: (id: string | null) => void;
  /** Данные устарели — без перетаскивания и добавления */
  readOnly?: boolean;
  /** service id → status string (ok|warn|down|unknown) */
  statusMap?: Record<string, string>;
}

type Tab = "monitoring" | "objects";

export function Palette({
  services,
  onCanvas,
  onAddService,
  onAddComponent,
  readOnly = false,
  selectedId,
  onSelect,
  onHoverChange,
  statusMap,
}: PaletteProps) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>("monitoring");
  const [search, setSearch] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // Reset search when switching tabs
  useEffect(() => {
    setSearch("");
  }, [tab]);

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

  // Objects tab: kinds visible in context menu, excluding "service" group
  const visibleKinds = NODE_KINDS.filter((k) => !k.menuHidden && k.group !== "service");
  const visibleGroups = KIND_GROUPS.filter(
    (g) => g.key !== "service" && g.key !== "managed" && visibleKinds.some((k) => k.group === g.key)
  );

  const objectSearch = search.toLowerCase();
  const filteredKinds = (group: string) =>
    visibleKinds.filter(
      (k) => k.group === group && k.label[lang as "ru" | "en"].toLowerCase().includes(objectSearch)
    );

  return (
    <aside
      className="palette-sidebar"
      onMouseLeave={handlePaletteLeave}
      style={readOnly ? { opacity: 0.72 } : undefined}
    >
      {/* Tab switcher */}
      <div className="palette-sidebar__tabs">
        <button
          type="button"
          className={`palette-sidebar__tab${tab === "monitoring" ? " palette-sidebar__tab--active" : ""}`}
          onClick={() => setTab("monitoring")}
        >
          {t("paletteTabMonitoring")}
        </button>
        <button
          type="button"
          className={`palette-sidebar__tab${tab === "objects" ? " palette-sidebar__tab--active" : ""}`}
          onClick={() => setTab("objects")}
        >
          {t("paletteTabObjects")}
        </button>
      </div>

      {tab === "monitoring" && (
        <>
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

        </>
      )}

      {tab === "objects" && (
        <>
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
            {visibleGroups.every((g) => filteredKinds(g.key).length === 0) && (
              <div className="palette-sidebar__empty">{t("nothingFound")}</div>
            )}
            {visibleGroups.map((g) => {
              const kinds = filteredKinds(g.key);
              if (kinds.length === 0) return null;
              const i18nKey = KIND_GROUP_I18N[g.key];
              return (
                <div key={g.key}>
                  <div className="palette-sidebar__section-header">
                    {i18nKey ? t(i18nKey as I18nKey) : g.label[lang as "ru" | "en"]}
                  </div>
                  {kinds.map((kindDef) => (
                    <button
                      key={kindDef.kind}
                      type="button"
                      disabled={readOnly}
                      className="palette-row palette-row--missing palette-row--kind"
                      onClick={() => onAddComponent(kindDef)}
                    >
                      <span className="palette-row__name">{kindDef.label[lang as "ru" | "en"]}</span>
                      <span className="palette-row__add" aria-hidden>
                        <FaPlus size={11} />
                      </span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}

import {
  Handle,
  Position,
  useReactFlow,
  useUpdateNodeInternals,
  type NodeProps,
} from "@xyflow/react";
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchIcons,
  type CustomIcon,
  type Port,
  type ServiceAction,
} from "../api";
import { portProbeChips } from "../probeDisplay";
import { IconRenderer } from "../IconRenderer";
import { AllHandles } from "./handles";
import { useColliding } from "../CollisionContext";
import { useIsDraggingOnCanvas } from "../DragContext";
import { HoverTooltip } from "../Tooltip";
import {
  useProbeSources,
  useServices,
  useEndpointLabel,
} from "../ServicesContext";
import { DEFAULT_SERVICE_ICON_NAME, ALL_ICONS } from "../icons";
import { useI18n } from "../i18n";
import { TrashIcon } from "../TrashIcon";
import { ServiceLabelsSection } from "../ServiceLabelsSection";
import { DeleteButton } from "./DeleteButton";
import { isMonitoringOptional, getGroupVisual } from "../nodeKinds";
import { useTrace } from "../TraceContext";
import { CONTAINER_CARD_H } from "./ContainerNode";
import { useContainerDrop } from "../ContainerDropContext";

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--probemap-status-ok)",
  warn: "var(--probemap-status-warn)",
  down: "var(--probemap-danger)",
  unknown: "var(--probemap-status-unknown)",
};

/** Handle порта — тот же ромбик, что у AllHandles; left: -17 выносит его на
 *  левую границу ноды (padding ноды 12px + половина ромба), напротив строки порта */
const PORT_HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  left: -17,
  background: "var(--probemap-blue)",
  border: "1.5px solid var(--probemap-bg)",
  opacity: 0,
  transition: "opacity 0.15s, background 0.15s, width 0.15s, height 0.15s",
};

function aggStatus(ports: Port[]): string {
  if (!ports?.length) return "unknown";
  if (ports.some((p) => p.status === "down")) return "down";
  if (ports.some((p) => p.status === "warn")) return "warn";
  if (ports.every((p) => p.status === "ok")) return "ok";
  return "unknown";
}

/** Тип пробы — тем же цветом статуса, что и бейдж порта */
function ProbeTypeBadge({
  type,
  statusColor,
}: {
  type: string;
  statusColor: string;
}) {
  const c = statusColor;
  const label = type.toUpperCase();
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 4px",
        borderRadius: 4,
        background: c + "18",
        color: c,
        border: `1px solid ${c}44`,
        letterSpacing: "0.04em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {label}
    </span>
  );
}

function portSortKey(port: string): number {
  const n = parseInt(port, 10);
  return Number.isFinite(n) ? n : 999_999;
}

function kindKeyForBadge(kind: string): string {
  return kind.toLowerCase();
}

export interface ServiceNodeData extends Record<string, unknown> {
  label: string;
  ports: Port[];
  /** Semantic type: "service", "vpn-gateway", "managed-db", etc. */
  kind?: string;
  icon?: string;
  description?: string;
  actions?: ServiceAction[];
  /** Не учитывать источники пробы (значение лейбла probe_source) */
  ignored_sources?: string[];
  /** Endpoint/URL узла — ручной ввод или значение лейбла метрики */
  endpoint?: string | null;
}

export const ServiceNode = memo(function ServiceNode({ data, id }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  const { updateNodeData } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();

  /** Владелец port-handle: первый чип каждого порта (дедуп — handle id должен
   *  быть уникален в ноде; icmp/unknown без порта handle не получают). */
  const portHandleOwner = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of d.ports ?? []) {
      const pk = `${p.port}-${p.job ?? ""}-${p.module ?? ""}`;
      if (p.port && p.port !== "unknown" && !m.has(p.port)) m.set(p.port, pk);
    }
    return m;
  }, [d.ports]);

  /** xyflow кэширует позиции handles — пересчитать при изменении набора портов */
  const portHandleSig = useMemo(
    () => Array.from(portHandleOwner.keys()).join(","),
    [portHandleOwner],
  );
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, portHandleSig, updateNodeInternals]);

  const services = useServices();
  const probeSourcesGlobal = useProbeSources();
  const endpointLabel = useEndpointLabel();
  const { t } = useI18n();
  const { tracedNodeId, toggleTrace, canEdit } = useTrace();
  const isTraced = tracedNodeId === id;

  const nodeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  /** Режим правки endpoint: blur с поля ввода не должен закрывать блок при переносе фокуса на выпадающий список лейблов. */
  const endpointEditBoxRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Панель «МОНИТОРИНГ» при наведении — не сразу, чтобы не мешать при движении по карте */
  const SERVICE_PANEL_SHOW_DELAY_MS = 1000;

  const [visible, setVisible] = useState(false);
  const [locked, setLocked] = useState(false);

  const [editingIcon, setEditingIcon] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [addingAction, setAddingAction] = useState(false);
  const [newActionIcon, setNewActionIcon] = useState("FaGlobe");
  const [actionTooltip, setActionTooltip] = useState<{
    label: string;
    el: HTMLElement;
  } | null>(null);
  const [sourceTooltip, setSourceTooltip] = useState<{
    label: string;
    el: HTMLElement;
  } | null>(null);
  const [blackboxDotTooltip, setBlackboxDotTooltip] = useState<{
    label: string;
    el: HTMLElement;
  } | null>(null);
  const [newActionLabel, setNewActionLabel] = useState("");
  const [newActionUrl, setNewActionUrl] = useState("");

  const inContainer = !!(d as ServiceNodeData & { containerNode?: string }).containerNode;
  const containerDrop = useContainerDrop();
  const isDisplaced = inContainer && containerDrop?.displacedNodeId === id && !containerDrop?.reorderMode;
  const colliding = useColliding(id);
  const dragging = useIsDraggingOnCanvas();
  const portAgg = aggStatus(d.ports ?? []);

  const catalogLabels = useMemo(
    () => services.find((s) => s.id === id)?.labels,
    [services, id],
  );

  /** Endpoint из глобального лейбла (Settings → endpoint_label). Активен, если лейбл задан и у сервиса есть его значение. */
  const autoEndpoint =
    endpointLabel && catalogLabels
      ? (catalogLabels[endpointLabel] ?? null)
      : null;
  /** Итоговый endpoint: ручной ввод приоритетнее авто. */
  const effectiveEndpoint = d.endpoint || autoEndpoint;

  // Строка на пару порт×зона×job×module; тип пробы для зоны без серии — из агрегата порта (не «TCP» по умолчанию)
  const ignoredSources = useMemo(
    () => new Set((d.ignored_sources ?? []).filter(Boolean)),
    [d.ignored_sources],
  );

  const probeRowsAll = useMemo(
    () =>
      (d.ports ?? []).flatMap((p) =>
        Object.entries(p.sources ?? {}).map(([source, s]) => {
          const zt = s.probe_types ?? [];
          const mergedTypes = zt.length > 0 ? zt : (p.probe_types ?? []);
          return {
            port: p.port,
            job: p.job ?? null,
            module: p.module ?? null,
            source,
            success: s.success,
            duration_ms: s.duration_ms ?? undefined,
            probe_types: mergedTypes,
          };
        }),
      ),
    [d.ports],
  );

  const probeRows = useMemo(
    () =>
      probeRowsAll
        .filter((r) => !ignoredSources.has(r.source))
        .sort((a, b) => {
          const dj = (a.job ?? "").localeCompare(b.job ?? "", "ru");
          if (dj !== 0) return dj;
          const dm = (a.module ?? "").localeCompare(b.module ?? "", "ru");
          if (dm !== 0) return dm;
          const dp = portSortKey(a.port) - portSortKey(b.port);
          if (dp !== 0) return dp;
          return a.source.localeCompare(b.source, "ru");
        }),
    [probeRowsAll, ignoredSources],
  );

  // По источнику (instance): есть ли явный fail (0) и/или ok (1). Нет серии у части blackbox — не «провал».
  const { sourceAgg, hasAnyFail, hasAnyOk } = useMemo(() => {
    const m = new Map<string, { hasOk: boolean; hasFail: boolean }>();
    let anyFail = false;
    let anyOk = false;
    for (const row of probeRows) {
      const cur = m.get(row.source) ?? { hasOk: false, hasFail: false };
      if (row.success === 1) { cur.hasOk = true; anyOk = true; }
      if (row.success === 0) { cur.hasFail = true; anyFail = true; }
      m.set(row.source, cur);
    }
    return { sourceAgg: m, hasAnyFail: anyFail, hasAnyOk: anyOk };
  }, [probeRows]);
  const totalPresent = sourceAgg.size;
  const okPresent = Array.from(sourceAgg.values()).filter(
    (st) => st.hasOk && !st.hasFail,
  ).length;

  /** Нет метрик с части экспортёров не ухудшает цвет: красный только при явном 0; зелёный — все имеющиеся пробы ок. */
  const probeRollupStatus: "ok" | "warn" | "down" | "unknown" =
    hasAnyFail && hasAnyOk
      ? "warn"
      : hasAnyFail
        ? "down"
        : hasAnyOk
          ? "ok"
          : "unknown";

  const status = probeRollupStatus !== "unknown" ? probeRollupStatus : portAgg;

  const expectedBbList = (probeSourcesGlobal ?? []).filter(Boolean);
  const ignoredExpected = expectedBbList.filter((s) =>
    ignoredSources.has(s),
  ).length;
  const expectedBb = Math.max(0, expectedBbList.length - ignoredExpected);
  const presentBb = sourceAgg.size;

  /** Список blackbox (instance), в том же порядке что и в API; иначе — из фактических источников по узлу */
  const blackboxOrder = useMemo(() => {
    const fromCfg = (probeSourcesGlobal ?? []).filter(Boolean);
    if (fromCfg.length > 0) return fromCfg;
    return Array.from(sourceAgg.keys()).sort((a, b) =>
      a.localeCompare(b, "ru"),
    );
  }, [probeSourcesGlobal, sourceAgg]);

  // Статус "offline" определяем по наличию портов/проб, а не по id узла.
  const offline = (d.ports ?? []).length === 0;

  // Узел без мониторинга: kind из группы actor/network/other — для таких объектов
  // "нет мониторинга" нормальное состояние, а не "unknown".
  const unmonitored = offline && isMonitoringOptional(d.kind);

  const groupVisual = getGroupVisual(d.kind);

  // Fixed card width 200px; label area ≈ 156px (minus padding 24 + icon 14 + gap 6).
  // Scale font-size down proportionally if label doesn't fit; floor at 70% (≈9px).
  const LABEL_AVAIL_PX = 156;
  const labelFontPct = Math.min(
    100,
    Math.max(70, Math.floor((100 * LABEL_AVAIL_PX) / (d.label.length * 6.5))),
  );

  const dotStatusKey = offline ? "unknown" : status;

  const nodeTint = unmonitored
    ? {
        border: "var(--probemap-border)",
        ring: "var(--probemap-border-strong)",
        bg: "var(--probemap-bg)",
      }
    : offline
      ? {
          border: "var(--probemap-border-strong)",
          ring: "var(--probemap-text-muted)",
          bg: "var(--probemap-bg-subtle)",
        }
      : status === "ok"
        ? {
            border: "var(--probemap-status-ok-border)",
            ring: "var(--probemap-status-ok-ring)",
            bg: "var(--probemap-status-ok-bg)",
          }
        : status === "warn"
          ? {
              border: "var(--probemap-status-warn-border)",
              ring: "var(--probemap-status-warn-ring)",
              bg: "var(--probemap-status-warn-bg)",
            }
          : status === "down"
            ? {
                border: "var(--probemap-status-down-border)",
                ring: "var(--probemap-status-down-ring)",
                bg: "var(--probemap-status-down-bg)",
              }
            : {
                border: "var(--probemap-border-strong)",
                ring: "var(--probemap-text-muted)",
                bg: "var(--probemap-bg)",
              };

  const clearShowPanelTimer = () => {
    if (showPanelTimer.current) {
      clearTimeout(showPanelTimer.current);
      showPanelTimer.current = null;
    }
  };

  const show = () => {
    if (dragging) return;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    clearShowPanelTimer();
    showPanelTimer.current = setTimeout(() => {
      setVisible(true);
      showPanelTimer.current = null;
    }, SERVICE_PANEL_SHOW_DELAY_MS);
  };

  const hide = () => {
    clearShowPanelTimer();
    if (locked) return;
    hideTimer.current = setTimeout(() => setVisible(false), 150);
  };

  useEffect(() => {
    if (!dragging) return;
    // Во время drag не показываем hover-панель и тултипы
    clearShowPanelTimer();
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
    setActionTooltip(null);
    setSourceTooltip(null);
    setBlackboxDotTooltip(null);
  }, [dragging]);

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    clearShowPanelTimer();
    if (locked) {
      setLocked(false);
      setVisible(false);
      setEditingDesc(false);
      setEditingEndpoint(false);
      setAddingAction(false);
      setEditingIcon(false);
    } else {
      setLocked(true);
      setVisible(true);
    }
  };

  useEffect(
    () => () => {
      clearShowPanelTimer();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (editingIcon || addingAction) {
      fetchIcons()
        .then(setCustomIcons)
        .catch(() => {});
    }
  }, [editingIcon, addingAction]);

  useEffect(() => {
    if (!locked) return;
    const onMouse = (e: MouseEvent) => {
      if (
        e.target instanceof globalThis.Node &&
        panelRef.current?.contains(e.target)
      )
        return;
      if (
        e.target instanceof globalThis.Node &&
        nodeRef.current?.contains(e.target)
      )
        return;
      // Don't close when clicking inside a portaled modal (e.g. delete-confirm dialog)
      if (
        e.target instanceof Element &&
        e.target.closest("[data-probemap-modal]")
      )
        return;
      setLocked(false);
      setVisible(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLocked(false);
        setVisible(false);
      } else if ((e.key === "Backspace" || e.key === "Delete") && canEdit) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if ((e.target as HTMLElement).isContentEditable) return;
        document.dispatchEvent(
          new CustomEvent("delete-node-request", { detail: { id, label: d.label ?? id } }),
        );
      }
    };
    document.addEventListener("mousedown", onMouse, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouse, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [locked]);

  const commitDesc = (val: string) => {
    updateNodeData(id, { description: val });
    setEditingDesc(false);
  };

  const commitEndpointEdit = () => {
    updateNodeData(id, { endpoint: endpointDraft.trim() || null });
    setEditingEndpoint(false);
  };

  /** Без отложенной проверки клик по списку снимает фокус с input и мгновенный onBlur закрывает весь блок. */
  const onEndpointInputBlur = () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (
        endpointEditBoxRef.current &&
        active &&
        endpointEditBoxRef.current.contains(active)
      )
        return;
      commitEndpointEdit();
    }, 0);
  };

  const addAction = () => {
    if (!newActionUrl.trim()) return;
    const actions: ServiceAction[] = [
      ...(d.actions ?? []),
      {
        icon: newActionIcon,
        label: newActionLabel.trim() || newActionUrl.trim(),
        url: newActionUrl.trim(),
      },
    ];
    updateNodeData(id, { actions });
    setAddingAction(false);
    setNewActionLabel("");
    setNewActionUrl("");
    setNewActionIcon("FaGlobe");
  };

  const removeAction = (i: number) => {
    updateNodeData(id, {
      actions: (d.actions ?? []).filter((_, idx) => idx !== i),
    });
  };

  const panelW = 280;
  const liveRect = visible
    ? (nodeRef.current?.getBoundingClientRect() ?? null)
    : null;
  const panelStyle = liveRect
    ? (() => {
        const gap = 24;
        const left =
          window.innerWidth - liveRect.right - gap >= panelW
            ? liveRect.right + gap
            : liveRect.left - panelW - gap;
        const nodeCenter = liveRect.top + liveRect.height / 2;
        const top = Math.max(8, nodeCenter - 105);
        return {
          position: "fixed" as const,
          top,
          left: Math.max(8, left),
          width: panelW,
        };
      })()
    : {};

  // After each render, clamp the panel inside the viewport — runs before browser paint
  // so the user never sees an out-of-bounds position.
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
  });

  const panel =
    visible && liveRect
      ? [
          createPortal(
            <div
              ref={panelRef}
              onMouseEnter={() => {
                if (hideTimer.current) clearTimeout(hideTimer.current);
              }}
              onMouseLeave={hide}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                ...panelStyle,
                zIndex: 3000,
                background: "var(--probemap-modal-bg)",
                border: "1.5px solid var(--probemap-border)",
                borderRadius: 10,
                boxShadow: "0 4px 16px rgba(0,0,0,.1)",
                padding: "12px 14px",
                fontSize: 12,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: editingIcon ? 6 : 10,
                }}
              >
                <button
                  type="button"
                  title={t("changeIconTitle")}
                  onClick={() => {
                    if (canEdit) setEditingIcon((v) => !v);
                  }}
                  style={{
                    flexShrink: 0,
                    background: editingIcon
                      ? "var(--probemap-interactive-hover-bg)"
                      : "transparent",
                    border: `1.5px solid ${editingIcon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                    borderRadius: 6,
                    padding: 3,
                    cursor: canEdit ? "pointer" : "default",
                    color: "var(--probemap-text-muted)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconRenderer
                    name={d.icon ?? DEFAULT_SERVICE_ICON_NAME}
                    size={16}
                  />
                </button>
                {editingLabel ? (
                  <input
                    autoFocus
                    defaultValue={d.label}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v) updateNodeData(id, { label: v });
                      setEditingLabel(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingLabel(false);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--probemap-text)",
                      background: "transparent",
                      border: "none",
                      borderBottom:
                        "1.5px solid var(--probemap-interactive-hover-border)",
                      outline: "none",
                      boxShadow:
                        "0 0 0 2px var(--probemap-interactive-hover-border, #6366f1)33",
                      padding: 0,
                      letterSpacing: "-0.01em",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--probemap-text)",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      letterSpacing: "-0.01em",
                      flex: 1,
                      cursor: "text",
                    }}
                    title={d.label}
                    onDoubleClick={() => { if (canEdit) setEditingLabel(true); }}
                  >
                    {d.label}
                  </div>
                )}
                {(
                  <button
                    type="button"
                    title={
                      isTraced ? t("pathTraceClearAria") : t("pathTraceAria")
                    }
                    onClick={() => toggleTrace(id)}
                    style={{
                      flexShrink: 0,
                      padding: "2px 6px",
                      borderRadius: 6,
                      fontSize: 10,
                      fontWeight: 600,
                      border: `1.5px solid ${isTraced ? "var(--probemap-trace-accent)" : "var(--probemap-border)"}`,
                      background: isTraced
                        ? "var(--probemap-trace-accent)"
                        : "transparent",
                      color: isTraced ? "#fff" : "var(--probemap-text-faint)",
                      cursor: "pointer",
                      letterSpacing: "0.02em",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {t("pathTraceLabel")}
                  </button>
                )}
              </div>
              {editingIcon && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 3,
                    marginBottom: 10,
                  }}
                >
                  {ALL_ICONS.map((entry) => (
                    <button
                      key={entry.icon}
                      type="button"
                      title={entry.label}
                      onClick={() => {
                        updateNodeData(id, { icon: entry.icon });
                        setEditingIcon(false);
                      }}
                      style={{
                        width: 22,
                        height: 22,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 4,
                        padding: 0,
                        flexShrink: 0,
                        cursor: "pointer",
                        border: `1.5px solid ${(d.icon ?? DEFAULT_SERVICE_ICON_NAME) === entry.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                        background:
                          (d.icon ?? DEFAULT_SERVICE_ICON_NAME) === entry.icon
                            ? "var(--probemap-interactive-hover-bg)"
                            : "transparent",
                        color: "var(--probemap-text-muted)",
                      }}
                    >
                      <IconRenderer name={entry.icon} size={11} />
                    </button>
                  ))}
                  {customIcons.map((ci) => {
                    const name = `custom:${ci.name}`;
                    return (
                      <button
                        key={name}
                        type="button"
                        title={ci.name}
                        onClick={() => {
                          updateNodeData(id, { icon: name });
                          setEditingIcon(false);
                        }}
                        style={{
                          width: 22,
                          height: 22,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 4,
                          padding: 0,
                          flexShrink: 0,
                          cursor: "pointer",
                          border: `1.5px solid ${(d.icon ?? DEFAULT_SERVICE_ICON_NAME) === name ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                          background:
                            (d.icon ?? DEFAULT_SERVICE_ICON_NAME) === name
                              ? "var(--probemap-interactive-hover-bg)"
                              : "transparent",
                        }}
                      >
                        <IconRenderer name={name} size={15} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Probes */}
              {!unmonitored && (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 10,
                      marginBottom: 7,
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 700,
                        color: "var(--probemap-text-faint)",
                        fontSize: 10,
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t("monitoringTitle")}
                    </div>
                    {totalPresent > 0 && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          color:
                            STATUS_COLOR[status] ??
                            "var(--probemap-text-faint)",
                        }}
                      >
                        {t("monitoringSummary")
                          .replace("{ok}", String(okPresent))
                          .replace("{total}", String(totalPresent))}
                      </div>
                    )}
                  </div>
                  {expectedBb > 0 && (
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--probemap-text-faint)",
                        marginBottom: 8,
                        marginTop: -4,
                      }}
                    >
                      {t("monitoringSourcesCoverage")
                        .replace("{present}", String(presentBb))
                        .replace("{expected}", String(expectedBb))}
                    </div>
                  )}
                </>
              )}

              {!unmonitored && probeRows.length > 0
                ? probeRows.map((row) => {
                    const chips = portProbeChips(
                      row.port,
                      row.probe_types,
                      d.label,
                      row.module,
                    );
                    const rowStatusColor =
                      row.success === 1
                        ? STATUS_COLOR.ok
                        : row.success === 0
                          ? STATUS_COLOR.down
                          : STATUS_COLOR.unknown;
                    const dotColor = rowStatusColor;
                    return (
                      <div
                        key={`${row.port}-${row.source}-${row.job ?? ""}-${row.module ?? ""}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "10px minmax(0, 1fr) minmax(0, 1fr) 4.25rem",
                          alignItems: "center",
                          columnGap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <div
                          title={
                            row.success == null
                              ? t("noData")
                              : row.success === 1
                                ? t("ok")
                                : t("fail")
                          }
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            justifySelf: "center",
                            background: dotColor,
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                            flexWrap: "wrap",
                            minWidth: 0,
                          }}
                        >
                          {chips.portText && (
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "ui-monospace, monospace",
                                fontWeight: 600,
                                color: "var(--probemap-text-secondary)",
                                letterSpacing: "-0.02em",
                              }}
                            >
                              {chips.portText}
                            </span>
                          )}
                          <ProbeTypeBadge
                            type={kindKeyForBadge(chips.kind)}
                            statusColor={rowStatusColor}
                          />
                        </div>
                        <span
                          style={{
                            color: "var(--probemap-text)",
                            fontSize: 12,
                            minWidth: 0,
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            display: "block",
                            // Плавное затухание конца строки вместо «…»
                            WebkitMaskImage:
                              "linear-gradient(to right, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
                            maskImage:
                              "linear-gradient(to right, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
                          }}
                          onMouseEnter={(e) => {
                            const label = [row.source, row.module]
                              .filter(Boolean)
                              .join(" · ");
                            if (!label) return;
                            if (dragging) return;
                            setSourceTooltip({ label, el: e.currentTarget });
                          }}
                          onMouseLeave={() => setSourceTooltip(null)}
                          title={undefined}
                        >
                          {row.source}
                        </span>
                        <span
                          style={{
                            color: "var(--probemap-text-faint)",
                            fontSize: 11,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {row.duration_ms != null
                            ? `${row.duration_ms}ms`
                            : "—"}
                        </span>
                      </div>
                    );
                  })
                : !unmonitored && (
                    <div
                      style={{
                        color: "var(--probemap-text-faint)",
                        marginBottom: 4,
                      }}
                    >
                      {t("noData")}
                    </div>
                  )}

              {/* Endpoint */}
              <div
                style={{
                  height: 1,
                  background: "var(--probemap-bg-subtle)",
                  margin: "10px 0 8px",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: 6,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: "var(--probemap-text-faint)",
                    fontSize: 10,
                    letterSpacing: "0.06em",
                  }}
                >
                  {t("endpointTitle")}
                </div>
                {autoEndpoint && !d.endpoint && (
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--probemap-text-faint)",
                      background: "var(--probemap-bg-subtle)",
                      border: "1px solid var(--probemap-border)",
                      borderRadius: 4,
                      padding: "0 4px",
                      letterSpacing: "0.03em",
                    }}
                  >
                    {endpointLabel}
                  </span>
                )}
                {d.endpoint && autoEndpoint && (
                  <span
                    style={{
                      fontSize: 9,
                      color: "var(--probemap-text-faint)",
                      background: "var(--probemap-bg-subtle)",
                      border: "1px solid var(--probemap-border)",
                      borderRadius: 4,
                      padding: "0 4px",
                      letterSpacing: "0.03em",
                      cursor: "pointer",
                    }}
                    title={autoEndpoint}
                    onClick={() => {
                      updateNodeData(id, { endpoint: null });
                    }}
                  >
                    ✕ override
                  </span>
                )}
              </div>
              {editingEndpoint ? (
                <div
                  ref={endpointEditBoxRef}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <input
                    autoFocus
                    value={endpointDraft}
                    onChange={(e) => setEndpointDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        commitEndpointEdit();
                      }
                      if (e.key === "Escape") setEditingEndpoint(false);
                    }}
                    onBlur={onEndpointInputBlur}
                    placeholder={autoEndpoint ?? t("endpointPlaceholder")}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border:
                        "1.5px solid var(--probemap-interactive-hover-border)",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 12,
                      outline: "none",
                      color: "var(--probemap-text)",
                      background: "var(--probemap-input-bg)",
                    }}
                  />
                  {catalogLabels && Object.keys(catalogLabels).length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value)
                          setEndpointDraft(
                            catalogLabels[e.target.value] ?? e.target.value,
                          );
                      }}
                      style={{
                        border: "1.5px solid var(--probemap-border)",
                        borderRadius: 5,
                        padding: "3px 6px",
                        fontSize: 11,
                        outline: "none",
                        color: "var(--probemap-text)",
                        background: "var(--probemap-input-bg)",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">{t("endpointPickLabel")}</option>
                      {Object.entries(catalogLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {k}: {v}
                        </option>
                      ))}
                    </select>
                  )}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--probemap-text-faint)",
                      }}
                    >
                      {t("descriptionSaveHintBefore")}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: 3,
                          background: "var(--probemap-interactive-hover-bg)",
                          color: "var(--probemap-blue)",
                          border:
                            "1px solid var(--probemap-interactive-hover-border)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Enter
                      </span>
                      {t("descriptionSaveHintAfter")}
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={
                    canEdit
                      ? () => {
                          setEndpointDraft(d.endpoint ?? "");
                          setEditingEndpoint(true);
                        }
                      : undefined
                  }
                  style={{
                    cursor: canEdit ? "pointer" : "default",
                    color: effectiveEndpoint
                      ? "var(--probemap-text)"
                      : "var(--probemap-text-faint)",
                    minHeight: 18,
                    fontSize: 12,
                    wordBreak: "break-all",
                    padding: "2px 0",
                  }}
                >
                  {effectiveEndpoint ? (
                    (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--probemap-text)",
                            textDecoration: "underline",
                            textDecorationColor: "var(--probemap-text-faint)",
                            wordBreak: "break-all",
                          }}
                        >
                          {effectiveEndpoint}
                        </span>
                        <button
                          type="button"
                          title={t("endpointOpenInNewTab")}
                          onClick={(e) => {
                            e.stopPropagation();
                            const u = effectiveEndpoint.trim();
                            const href = /^https?:\/\//i.test(u)
                              ? u
                              : `https://${u}`;
                            window.open(href, "_blank", "noopener,noreferrer");
                          }}
                          style={{
                            flexShrink: 0,
                            border: "1px solid var(--probemap-border)",
                            background: "var(--probemap-bg-subtle)",
                            borderRadius: 4,
                            padding: "0 5px",
                            fontSize: 11,
                            cursor: "pointer",
                            color: "var(--probemap-text-muted)",
                            lineHeight: 1.4,
                          }}
                        >
                          ↗
                        </button>
                      </div>
                    )
                  ) : canEdit ? (
                    t("endpointClickToAdd")
                  ) : (
                    t("emDash")
                  )}
                </div>
              )}

              {/* Description */}
              <div
                style={{
                  height: 1,
                  background: "var(--probemap-bg-subtle)",
                  margin: "10px 0 8px",
                }}
              />
              <div
                style={{
                  fontWeight: 700,
                  color: "var(--probemap-text-faint)",
                  marginBottom: 6,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                }}
              >
                {t("descriptionTitle")}
              </div>
              {editingDesc ? (
                <div>
                  <textarea
                    autoFocus
                    value={descDraft.slice(0, 120)}
                    onChange={(e) => setDescDraft(e.target.value.slice(0, 120))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        commitDesc(descDraft);
                      }
                      if (e.key === "Escape") setEditingDesc(false);
                    }}
                    onBlur={() => commitDesc(descDraft)}
                    placeholder={t("descriptionPlaceholder")}
                    rows={2}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      border:
                        "1.5px solid var(--probemap-interactive-hover-border)",
                      borderRadius: 5,
                      padding: "4px 8px",
                      fontSize: 12,
                      outline: "none",
                      color: "var(--probemap-text)",
                      background: "var(--probemap-input-bg)",
                      resize: "vertical",
                      lineHeight: 1.4,
                      fontFamily: "inherit",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginTop: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        color: "var(--probemap-text-faint)",
                      }}
                    >
                      {t("descriptionSaveHintBefore")}
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: "1px 4px",
                          borderRadius: 3,
                          background: "var(--probemap-interactive-hover-bg)",
                          color: "var(--probemap-blue)",
                          border:
                            "1px solid var(--probemap-interactive-hover-border)",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                        }}
                      >
                        Enter
                      </span>
                      {t("descriptionSaveHintAfter")}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color:
                          descDraft.length >= 110
                            ? "var(--probemap-danger)"
                            : descDraft.length >= 100
                              ? "var(--probemap-status-warn)"
                              : "var(--probemap-text-faint)",
                        fontWeight: descDraft.length >= 100 ? 600 : 400,
                      }}
                    >
                      {descDraft.length}/120
                    </span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={
                    canEdit
                      ? () => {
                          setDescDraft(d.description ?? "");
                          setEditingDesc(true);
                        }
                      : undefined
                  }
                  style={{
                    cursor: canEdit ? "text" : "default",
                    color: d.description
                      ? "var(--probemap-text)"
                      : "var(--probemap-text-faint)",
                    minHeight: 18,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    padding: "2px 0",
                  }}
                >
                  {d.description ||
                    (canEdit ? t("descriptionClickToAdd") : t("emDash"))}
                </div>
              )}

              {/* Actions */}
              <div
                style={{
                  height: 1,
                  background: "var(--probemap-bg-subtle)",
                  margin: "10px 0 8px",
                }}
              />
              <div
                style={{
                  fontWeight: 700,
                  color: "var(--probemap-text-faint)",
                  marginBottom: 8,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                }}
              >
                {t("actionsTitle")}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  alignItems: "flex-start",
                }}
              >
                {(d.actions ?? []).map((action, i) => (
                  <div
                    key={i}
                    style={{ position: "relative" }}
                    onMouseEnter={(e) => {
                      if (!canEdit) return;
                      const b =
                        e.currentTarget.querySelector<HTMLElement>(".rm-act");
                      if (b) b.style.display = "flex";
                    }}
                    onMouseLeave={(e) => {
                      const b =
                        e.currentTarget.querySelector<HTMLElement>(".rm-act");
                      if (b) b.style.display = "none";
                    }}
                  >
                    <a
                      href={action.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="probemap-node-action-link"
                      onMouseEnter={(e) => {
                        if (dragging) return;
                        setActionTooltip({
                          label: t("actionOpenTo").replace(
                            "{label}",
                            action.label,
                          ),
                          el: e.currentTarget,
                        });
                      }}
                      onMouseLeave={() => setActionTooltip(null)}
                    >
                      <IconRenderer name={action.icon} size={14} />
                    </a>
                    {canEdit && (
                      <button
                        className="rm-act probemap-btn probemap-btn--map-delete"
                        type="button"
                        onClick={() => removeAction(i)}
                        style={{
                          display: "none",
                          position: "absolute",
                          top: -4,
                          right: -4,
                          width: 14,
                          height: 14,
                        }}
                      >
                        <TrashIcon variantOnRed size={8} />
                      </button>
                    )}
                  </div>
                ))}

                {canEdit &&
                  (addingAction ? (
                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                        paddingTop: 2,
                      }}
                    >
                      <div
                        style={{ display: "flex", flexWrap: "wrap", gap: 3 }}
                      >
                        {ALL_ICONS.map((entry) => (
                          <button
                            key={entry.icon}
                            type="button"
                            title={entry.label}
                            onClick={() => setNewActionIcon(entry.icon)}
                            style={{
                              width: 22,
                              height: 22,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: 4,
                              padding: 0,
                              flexShrink: 0,
                              cursor: "pointer",
                              border: `1.5px solid ${newActionIcon === entry.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                              background:
                                newActionIcon === entry.icon
                                  ? "var(--probemap-interactive-hover-bg)"
                                  : "transparent",
                              color: "var(--probemap-text-muted)",
                            }}
                          >
                            <IconRenderer name={entry.icon} size={11} />
                          </button>
                        ))}
                        {customIcons.map((ci) => {
                          const name = `custom:${ci.name}`;
                          return (
                            <button
                              key={name}
                              type="button"
                              title={ci.name}
                              onClick={() => setNewActionIcon(name)}
                              style={{
                                width: 22,
                                height: 22,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 4,
                                padding: 0,
                                flexShrink: 0,
                                cursor: "pointer",
                                border: `1.5px solid ${newActionIcon === name ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                                background:
                                  newActionIcon === name
                                    ? "var(--probemap-interactive-hover-bg)"
                                    : "transparent",
                              }}
                            >
                              <IconRenderer name={name} size={15} />
                            </button>
                          );
                        })}
                      </div>
                      <input
                        placeholder={t("actionNamePlaceholder")}
                        value={newActionLabel}
                        onChange={(e) => setNewActionLabel(e.target.value)}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          border: "1.5px solid var(--probemap-border)",
                          borderRadius: 5,
                          padding: "4px 8px",
                          fontSize: 12,
                          outline: "none",
                          color: "var(--probemap-text)",
                          background: "var(--probemap-input-bg)",
                        }}
                      />
                      <div style={{ display: "flex", gap: 6 }}>
                        <input
                          autoFocus
                          placeholder={t("actionUrlPlaceholder")}
                          value={newActionUrl}
                          onChange={(e) => setNewActionUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addAction();
                            if (e.key === "Escape") setAddingAction(false);
                          }}
                          style={{
                            flex: 1,
                            border: "1.5px solid var(--probemap-border)",
                            borderRadius: 5,
                            padding: "4px 8px",
                            fontSize: 12,
                            outline: "none",
                            color: "var(--probemap-text)",
                            background: "var(--probemap-input-bg)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={addAction}
                          className="probemap-btn probemap-btn--primary probemap-btn--xs"
                        >
                          {t("uiOk")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingAction(false)}
                          className="probemap-btn probemap-btn--ghost probemap-btn--xs"
                          style={{ padding: "4px 8px" }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingAction(true)}
                      className="probemap-btn-dashed-icon"
                    >
                      +
                    </button>
                  ))}
              </div>

              <ServiceLabelsSection labels={catalogLabels} />

              {/* Delete from canvas */}
              {canEdit && <DeleteButton nodeId={id} label={d.label} />}
            </div>,
            document.body,
          ),
          actionTooltip && (
            <HoverTooltip
              key="atip"
              label={actionTooltip.label}
              targetEl={actionTooltip.el}
            />
          ),
          sourceTooltip && (
            <HoverTooltip
              key="stip"
              label={sourceTooltip.label}
              targetEl={sourceTooltip.el}
            />
          ),
        ]
      : null;

  return (
    <div ref={nodeRef} onMouseEnter={show} onMouseLeave={hide}>
      <div
        onClick={handleNodeClick}
        style={{
          background: isDisplaced ? "var(--probemap-interactive-hover-bg)" : "var(--probemap-modal-bg)",
          border: `1.5px solid ${isDisplaced ? "var(--probemap-blue)" : nodeTint.border}`,
          borderRadius: groupVisual.borderRadius,
          padding: groupVisual.accentColor ? "8px 12px 8px 15px" : "8px 12px",
          width: inContainer ? undefined : 200,
          /* В контейнере — компактная карточка фикс. высоты; на карте высота
             авто (вертикальный список портов) и overflow visible, чтобы
             ромбики port-handles на левой границе не обрезались */
          height: inContainer ? CONTAINER_CARD_H : undefined,
          minHeight: inContainer ? undefined : CONTAINER_CARD_H,
          overflow: inContainer ? "hidden" : "visible",
          boxSizing: "border-box" as const,
          fontSize: 13,
          boxShadow: "var(--probemap-node-card-shadow)",
          position: "relative",
          cursor: "pointer",
          outline:
            !colliding && locked ? `2px solid ${nodeTint.ring}` : undefined,
          outlineOffset: "1px",
          opacity: colliding ? 0.5 : isDisplaced ? 0.6 : 1,
          transition: "opacity 0.1s, outline 0.1s, background 0.1s, border-color 0.1s",
        }}
      >
        {groupVisual.accentColor && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: groupVisual.accentColor,
              opacity: 0.75,
              pointerEvents: "none",
              borderTopLeftRadius: groupVisual.borderRadius,
              borderBottomLeftRadius: groupVisual.borderRadius,
            }}
          />
        )}
        {isDisplaced && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "var(--probemap-blue)",
              opacity: 0.15,
              borderRadius: groupVisual.borderRadius,
              pointerEvents: "none",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom:
              effectiveEndpoint ||
              (d.ports ?? []).length > 0 ||
              blackboxOrder.length > 0
                ? 5
                : 0,
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              title={t("changeIconTitle")}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--probemap-text-muted)",
                display: "flex",
                borderRadius: 4,
              }}
            >
              <IconRenderer
                name={d.icon ?? DEFAULT_SERVICE_ICON_NAME}
                size={14}
              />
            </button>
            {!unmonitored && (
              <div
                style={{
                  position: "absolute",
                  bottom: -1,
                  right: -1,
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background:
                    STATUS_COLOR[dotStatusKey] ?? STATUS_COLOR.unknown,
                  border: "1.5px solid var(--probemap-status-dot-border)",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: `${labelFontPct}%`,
              color: "var(--probemap-text)",
              flex: 1,
              minWidth: 0,
              userSelect: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={d.label}
          >
            {d.label}
          </span>
        </div>

        {effectiveEndpoint && (
          <div
            style={{
              fontSize: 10,
              color: "var(--probemap-text-faint)",
              marginBottom: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 160,
            }}
            title={effectiveEndpoint}
          >
            {effectiveEndpoint}
          </div>
        )}

        {((d.ports ?? []).length > 0 || blackboxOrder.length > 0) && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              minWidth: 0,
            }}
          >
            {(d.ports ?? []).length > 0 ? (
              <div
                style={{
                  /* На карте — вертикальный список (строка на порт, ромбик-handle
                     у края ноды); в контейнере — компактные инлайн-чипы */
                  display: "flex",
                  flexDirection: inContainer ? "row" : "column",
                  flexWrap: inContainer ? "wrap" : undefined,
                  gap: inContainer ? 6 : 4,
                  alignItems: inContainer ? "center" : "stretch",
                  flex: "1 1 auto",
                  minWidth: 0,
                }}
              >
                {(d.ports ?? []).map((p) => {
                  const chips = portProbeChips(
                    p.port,
                    p.probe_types,
                    d.label,
                    p.module,
                  );
                  const c = STATUS_COLOR[p.status] ?? STATUS_COLOR.unknown;
                  const pk = `${p.port}-${p.job ?? ""}-${p.module ?? ""}`;
                  const hasPortHandle =
                    !inContainer && portHandleOwner.get(p.port) === pk;
                  return (
                    <div
                      key={pk}
                      style={{
                        position: "relative",
                        display: "flex",
                        gap: 3,
                        alignItems: "center",
                      }}
                    >
                      {/* Handle порта: ребро цепляется к конкретному порту
                          (sourceHandle/targetHandle = `port-<port>` в layout).
                          Пара source+target как в AllHandles (Loose mode). */}
                      {hasPortHandle && (
                        <>
                          <Handle
                            type="source"
                            position={Position.Left}
                            id={`port-${p.port}`}
                            style={PORT_HANDLE_STYLE}
                            className="react-flow__handle-visibility"
                          />
                          <Handle
                            type="target"
                            position={Position.Left}
                            id={`port-${p.port}`}
                            style={{
                              ...PORT_HANDLE_STYLE,
                              opacity: 0,
                              pointerEvents: "none",
                            }}
                          />
                        </>
                      )}
                      {chips.portText && (
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: "ui-monospace, monospace",
                            fontWeight: 600,
                            padding: "1px 4px",
                            borderRadius: 4,
                            background: c + "18",
                            color: c,
                            border: `1px solid ${c}44`,
                          }}
                        >
                          {chips.portText}
                        </span>
                      )}
                      <ProbeTypeBadge
                        type={kindKeyForBadge(chips.kind)}
                        statusColor={c}
                      />
                      {/* Точки-источники этого порта (per-port статус) */}
                      {!inContainer && (
                        <div
                          style={{
                            display: "flex",
                            gap: 4,
                            alignItems: "center",
                            marginLeft: "auto",
                            flexShrink: 0,
                          }}
                        >
                          {blackboxOrder
                            .filter((src) => !ignoredSources.has(src))
                            .map((src) => {
                              const s = p.sources?.[src]?.success;
                              const dotBg =
                                s === 1
                                  ? "var(--probemap-status-ok)"
                                  : s === 0
                                    ? "var(--probemap-danger)"
                                    : "var(--probemap-status-unknown)";
                              return (
                                <span
                                  key={src}
                                  title={src}
                                  style={{
                                    width: 6,
                                    height: 6,
                                    borderRadius: "50%",
                                    background: dotBg,
                                  }}
                                />
                              );
                            })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ flex: "1 1 auto", minWidth: 0 }} />
            )}
            {blackboxOrder.length > 0 &&
              (inContainer || (d.ports ?? []).length === 0) && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 5,
                  alignItems: "center",
                  flexShrink: 0,
                  marginLeft: "auto",
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {blackboxOrder
                  .filter((src) => !ignoredSources.has(src))
                  .map((src) => {
                    const st = sourceAgg.get(src);
                    const dotBg = !st
                      ? "var(--probemap-status-unknown)"
                      : st.hasFail
                        ? "var(--probemap-danger)"
                        : st.hasOk
                          ? "var(--probemap-status-ok)"
                          : "var(--probemap-status-unknown)";
                    return (
                      <div
                        key={src}
                        onMouseEnter={(e) => {
                          if (dragging) return;
                          setBlackboxDotTooltip({
                            label: src,
                            el: e.currentTarget,
                          });
                        }}
                        onMouseLeave={() => setBlackboxDotTooltip(null)}
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: "50%",
                          background: dotBg,
                          border:
                            "1.5px solid var(--probemap-status-dot-border)",
                          boxShadow: "0 0 0 1px rgba(15,23,42,0.14)",
                          flexShrink: 0,
                          cursor: "default",
                        }}
                      />
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>
      <AllHandles />

      {panel}

      {blackboxDotTooltip && (
        <HoverTooltip
          label={blackboxDotTooltip.label}
          targetEl={blackboxDotTooltip.el}
        />
      )}
    </div>
  );
});

import { useReactFlow, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Port, ServiceAction } from "../api";
import { portProbeChips } from "../probeDisplay";
import { IconRenderer } from "../IconRenderer";
import { AllHandles } from "./handles";
import { useColliding } from "../CollisionContext";
import { useIsDraggingOnCanvas } from "../DragContext";
import { HoverTooltip } from "../Tooltip";
import { useProbeSources, useServices } from "../ServicesContext";
import { DEFAULT_SERVICE_ICON_NAME, ALL_ICONS } from "../icons";
import { useI18n } from "../i18n";
import { TrashIcon } from "../TrashIcon";
import { ServiceLabelsSection } from "../ServiceLabelsSection";
import { DeleteButton } from "./DeleteButton";
import { isMonitoringOptional, getGroupVisual } from "../nodeKinds";
import { useTrace } from "../TraceContext";

const STATUS_COLOR: Record<string, string> = {
  ok: "var(--probemap-status-ok)",
  warn: "var(--probemap-status-warn)",
  down: "var(--probemap-danger)",
  unknown: "var(--probemap-status-unknown)",
};

function aggStatus(ports: Port[]): string {
  if (!ports?.length) return "unknown";
  if (ports.some((p) => p.status === "down")) return "down";
  if (ports.some((p) => p.status === "warn")) return "warn";
  if (ports.every((p) => p.status === "ok")) return "ok";
  return "unknown";
}

/** Тип пробы — тем же цветом статуса, что и бейдж порта */
function ProbeTypeBadge({ type, statusColor }: { type: string; statusColor: string }) {
  const c = statusColor;
  const label = type.toUpperCase();
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 4,
      background: c + "18",
      color: c,
      border: `1px solid ${c}44`,
      letterSpacing: "0.04em",
      fontVariantNumeric: "tabular-nums",
    }}>
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

export interface ServiceNodeData {
  label: string;
  ports: Port[];
  /** Резерв: привязка к id в каталоге, если id узла не совпадает с каталогом */
  matchServiceId?: string | null;
  /** Semantic type: "service", "vpn-gateway", "managed-db", etc. */
  kind?: string;
  icon?: string;
  description?: string;
  actions?: ServiceAction[];
  /** Не учитывать источники пробы (значение лейбла probe_source) */
  ignored_sources?: string[];
}

export function ServiceNode({ data, id }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  const { updateNodeData } = useReactFlow();
  const services = useServices();
  const probeSourcesGlobal = useProbeSources();
  const { t } = useI18n();
  const { tracedNodeId, toggleTrace } = useTrace();
  const isTraced = tracedNodeId === id;

  const nodeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPanelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Панель «МОНИТОРИНГ» при наведении — не сразу, чтобы не мешать при движении по карте */
  const SERVICE_PANEL_SHOW_DELAY_MS = 1000;

  const [visible, setVisible] = useState(false);
  const [locked, setLocked] = useState(false);

  const [editingIcon, setEditingIcon] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [addingAction, setAddingAction] = useState(false);
  const [newActionIcon, setNewActionIcon] = useState("FaGlobe");
  const [actionTooltip, setActionTooltip] = useState<{ label: string; el: HTMLElement } | null>(null);
  const [sourceTooltip, setSourceTooltip] = useState<{ label: string; el: HTMLElement } | null>(null);
  const [blackboxDotTooltip, setBlackboxDotTooltip] = useState<{ label: string; el: HTMLElement } | null>(null);
  const [newActionLabel, setNewActionLabel] = useState("");
  const [newActionUrl, setNewActionUrl] = useState("");

  const colliding = useColliding(id);
  const dragging = useIsDraggingOnCanvas();
  const portAgg = aggStatus(d.ports ?? []);

  const svcId = d.matchServiceId ?? id;
  const catalogLabels = useMemo(
    () => services.find((s) => s.id === svcId)?.labels,
    [services, svcId],
  );

  // Строка на пару порт×зона×job×module; тип пробы для зоны без серии — из агрегата порта (не «TCP» по умолчанию)
  const ignoredSources = useMemo(() => new Set((d.ignored_sources ?? []).filter(Boolean)), [d.ignored_sources]);

  const probeRowsAll = (d.ports ?? []).flatMap((p) =>
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
  );
  const probeRows = probeRowsAll.filter((r) => !ignoredSources.has(r.source));

  probeRows.sort((a, b) => {
    const dj = (a.job ?? "").localeCompare(b.job ?? "", "ru");
    if (dj !== 0) return dj;
    const dm = (a.module ?? "").localeCompare(b.module ?? "", "ru");
    if (dm !== 0) return dm;
    const dp = portSortKey(a.port) - portSortKey(b.port);
    if (dp !== 0) return dp;
    return a.source.localeCompare(b.source, "ru");
  });

  // По источнику (instance): есть ли явный fail (0) и/или ok (1). Нет серии у части blackbox — не «провал».
  const sourceAgg = (() => {
    const m = new Map<string, { hasOk: boolean; hasFail: boolean }>();
    for (const row of probeRows) {
      const cur = m.get(row.source) ?? { hasOk: false, hasFail: false };
      if (row.success === 1) cur.hasOk = true;
      if (row.success === 0) cur.hasFail = true;
      m.set(row.source, cur);
    }
    return m;
  })();

  const hasAnyFail = probeRows.some((r) => r.success === 0);
  const hasAnyOk = probeRows.some((r) => r.success === 1);
  const totalPresent = sourceAgg.size;
  const okPresent = Array.from(sourceAgg.values()).filter((st) => st.hasOk && !st.hasFail).length;

  /** Нет метрик с части экспортёров не ухудшает цвет: красный только при явном 0; зелёный — все имеющиеся пробы ок. */
  const probeRollupStatus: "ok" | "warn" | "down" | "unknown" =
    hasAnyFail && hasAnyOk ? "warn"
      : hasAnyFail ? "down"
        : hasAnyOk ? "ok"
          : "unknown";

  const status = probeRollupStatus !== "unknown" ? probeRollupStatus : portAgg;

  const expectedBbList = (probeSourcesGlobal ?? []).filter(Boolean);
  const ignoredExpected = expectedBbList.filter((s) => ignoredSources.has(s)).length;
  const expectedBb = Math.max(0, expectedBbList.length - ignoredExpected);
  const presentBb = sourceAgg.size;

  /** Список blackbox (instance), в том же порядке что и в API; иначе — из фактических источников по узлу */
  const blackboxOrder = (() => {
    const fromCfg = (probeSourcesGlobal ?? []).filter(Boolean);
    if (fromCfg.length > 0) return fromCfg;
    return Array.from(sourceAgg.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  })();

  // Для компонентов статус "offline" определяем по наличию портов/проб, а не по id узла.
  // Это позволяет binding через `matchServiceId` показывать live-статус.
  const offline = (d.ports ?? []).length === 0;

  // Узел без мониторинга: kind из группы actor/network/other + нет привязки matchServiceId.
  // Для таких объектов "нет мониторинга" — нормальное состояние, а не "unknown".
  const unmonitored = offline && isMonitoringOptional(d.kind) && !d.matchServiceId;

  const groupVisual = getGroupVisual(d.kind);

  const dotStatusKey = offline ? "unknown" : status;

  const nodeTint = unmonitored
    ? { border: "var(--probemap-border)", bg: "var(--probemap-bg)" }
    : offline
    ? { border: "var(--probemap-border-strong)", bg: "var(--probemap-bg-subtle)" }
    : status === "ok"
      ? { border: "var(--probemap-status-ok-border)", bg: "var(--probemap-status-ok-bg)" }
      : status === "warn"
        ? { border: "var(--probemap-status-warn-border)", bg: "var(--probemap-status-warn-bg)" }
        : status === "down"
          ? { border: "var(--probemap-status-down-border)", bg: "var(--probemap-status-down-bg)" }
          : { border: "var(--probemap-border-strong)", bg: "var(--probemap-bg)" };

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
    if (!locked) return;
    const onMouse = (e: MouseEvent) => {
      if (e.target instanceof globalThis.Node && panelRef.current?.contains(e.target)) return;
      if (e.target instanceof globalThis.Node && nodeRef.current?.contains(e.target)) return;
      setLocked(false);
      setVisible(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setLocked(false); setVisible(false); }
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

  const addAction = () => {
    if (!newActionUrl.trim()) return;
    const actions: ServiceAction[] = [
      ...(d.actions ?? []),
      { icon: newActionIcon, label: newActionLabel.trim() || newActionUrl.trim(), url: newActionUrl.trim() },
    ];
    updateNodeData(id, { actions });
    setAddingAction(false);
    setNewActionLabel(""); setNewActionUrl(""); setNewActionIcon("FaGlobe");
  };

  const removeAction = (i: number) => {
    updateNodeData(id, { actions: (d.actions ?? []).filter((_, idx) => idx !== i) });
  };

  const panelW = 280;
  const liveRect = visible ? nodeRef.current?.getBoundingClientRect() ?? null : null;
  const panelStyle = liveRect ? (() => {
    const gap = 24;
    const left = window.innerWidth - liveRect.right - gap >= panelW
      ? liveRect.right + gap
      : liveRect.left - panelW - gap;
    const nodeCenter = liveRect.top + liveRect.height / 2;
    const panelH = 420;
    const top = Math.max(8, Math.min(nodeCenter - panelH / 4, window.innerHeight - panelH - 8));
    return {
      position: "fixed" as const,
      top,
      left: Math.max(8, left),
      width: panelW,
    };
  })() : {};

  const panel = visible && liveRect ? [
    createPortal(
    <div
      ref={locked ? panelRef : undefined}
      onMouseEnter={() => { if (hideTimer.current) clearTimeout(hideTimer.current); }}
      onMouseLeave={hide}
      onMouseDown={(e) => e.stopPropagation()}
      style={{
        ...panelStyle,
        zIndex: 3000,
        background: "var(--probemap-modal-bg)",
        border: `1.5px solid ${locked ? "var(--probemap-interactive-hover-border)" : "var(--probemap-border)"}`,
        borderRadius: 10,
        boxShadow: locked ? "0 6px 24px rgba(59,130,246,.18)" : "0 4px 16px rgba(0,0,0,.1)",
        padding: "12px 14px",
        fontSize: 12,
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: editingIcon ? 6 : 10 }}>
        <button
          type="button"
          title={t("changeIconTitle")}
          onClick={() => { if (locked) setEditingIcon((v) => !v); }}
          style={{
            flexShrink: 0, background: editingIcon ? "var(--probemap-interactive-hover-bg)" : "transparent",
            border: `1.5px solid ${editingIcon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
            borderRadius: 6, padding: 3, cursor: locked ? "pointer" : "default",
            color: "var(--probemap-text-muted)", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <IconRenderer name={d.icon ?? DEFAULT_SERVICE_ICON_NAME} size={16} />
        </button>
        <div
          style={{
            fontSize: 13, fontWeight: 700, color: "var(--probemap-text)",
            minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            letterSpacing: "-0.01em", flex: 1,
          }}
          title={d.label}
        >
          {d.label}
        </div>
        {locked && (
          <button
            type="button"
            title={isTraced ? t("pathTraceClearAria") : t("pathTraceAria")}
            onClick={() => toggleTrace(id)}
            style={{
              flexShrink: 0, padding: "2px 6px", borderRadius: 999, fontSize: 10, fontWeight: 600,
              border: `1.5px solid ${isTraced ? "var(--probemap-trace-accent)" : "var(--probemap-border)"}`,
              background: isTraced ? "var(--probemap-trace-accent)" : "transparent",
              color: isTraced ? "#fff" : "var(--probemap-text-faint)",
              cursor: "pointer", letterSpacing: "0.02em",
              transition: "all 0.15s ease",
            }}
          >
            {t("pathTraceLabel")}
          </button>
        )}
      </div>
      {editingIcon && locked && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
          {ALL_ICONS.map((entry) => (
            <button
              key={entry.icon}
              type="button"
              title={entry.label}
              onClick={() => { updateNodeData(id, { icon: entry.icon }); setEditingIcon(false); }}
              style={{
                width: 22, height: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: 4, padding: 0, flexShrink: 0, cursor: "pointer",
                border: `1.5px solid ${(d.icon ?? DEFAULT_SERVICE_ICON_NAME) === entry.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                background: (d.icon ?? DEFAULT_SERVICE_ICON_NAME) === entry.icon ? "var(--probemap-interactive-hover-bg)" : "transparent",
                color: "var(--probemap-text-muted)",
              }}
            >
              <IconRenderer name={entry.icon} size={11} />
            </button>
          ))}
        </div>
      )}

      {/* Probes */}
      {!unmonitored && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
            <div style={{ fontWeight: 700, color: "var(--probemap-text-faint)", fontSize: 10, letterSpacing: "0.06em" }}>{t("monitoringTitle")}</div>
            {totalPresent > 0 && (
              <div style={{
                fontSize: 11,
                fontWeight: 700,
                color: STATUS_COLOR[status] ?? "var(--probemap-text-faint)",
              }}>
                {t("monitoringSummary").replace("{ok}", String(okPresent)).replace("{total}", String(totalPresent))}
              </div>
            )}
          </div>
          {expectedBb > 0 && (
            <div style={{ fontSize: 10, color: "var(--probemap-text-faint)", marginBottom: 8, marginTop: -4 }}>
              {t("monitoringSourcesCoverage").replace("{present}", String(presentBb)).replace("{expected}", String(expectedBb))}
            </div>
          )}
        </>
      )}

      {/* Фаза 4: привязка компонента к каталожному сервису мониторинга */}
      {locked && (d.kind ?? "service") !== "service" && services.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--probemap-text-faint)", marginBottom: 6, letterSpacing: "0.06em" }}>
            {t("monitoringBindingTitle")}
          </div>
          <select
            value={d.matchServiceId ?? ""}
            onChange={(e) => {
              const next = e.target.value || null;
              const svc = next ? services.find((s) => s.id === next) ?? null : null;
              updateNodeData(id, {
                matchServiceId: next,
                // Проставляем порты сразу, чтобы UI показывал статусы без ожидания следующего refresh-цикла.
                ports: svc ? svc.ports : [],
              });
            }}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "7px 10px",
              borderRadius: 6,
              fontSize: 13,
              border: "1.5px solid var(--probemap-border)",
              outline: "none",
              color: "var(--probemap-text)",
              background: "var(--probemap-input-bg)",
            }}
          >
            <option value="">{t("monitoringBindingNone")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--probemap-text-faint)", lineHeight: 1.35 }}>
            {t("monitoringBindingHelp")}
          </div>
        </div>
      )}

      {blackboxOrder.length > 0 && locked && (
        <div style={{ marginBottom: 8, marginTop: -2 }}>
          <div style={{ fontSize: 10, color: "var(--probemap-text-faint)", marginBottom: 6 }}>
            {t("monitoringSourcesToggleHint")}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {blackboxOrder.map((src) => {
              const ignored = ignoredSources.has(src);
              return (
                <button
                  key={src}
                  type="button"
                  className={`probemap-btn probemap-btn--xs ${ignored ? "probemap-btn--ghost" : "probemap-btn--slate"}`}
                  onClick={() => {
                    const next = new Set(Array.from(ignoredSources));
                    if (next.has(src)) next.delete(src);
                    else next.add(src);
                    updateNodeData(id, { ignored_sources: Array.from(next).sort((a, b) => a.localeCompare(b, "ru")) });
                  }}
                  title={ignored ? t("monitoringIgnoreSourceOff") : t("monitoringIgnoreSourceOn")}
                  style={{
                    padding: "3px 6px",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: 10,
                    textDecoration: ignored ? "line-through" : "none",
                    opacity: ignored ? 0.65 : 1,
                  }}
                >
                  {src}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!unmonitored && probeRows.length > 0 ? probeRows.map((row) => {
        const chips = portProbeChips(row.port, row.probe_types, d.label, row.module);
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
              gridTemplateColumns: "10px minmax(0, 1fr) minmax(0, 1fr) 4.25rem",
              alignItems: "center",
              columnGap: 8,
              marginBottom: 6,
            }}
          >
            <div
              title={row.success == null ? t("noData") : row.success === 1 ? t("ok") : t("fail")}
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                justifySelf: "center",
                background: dotColor,
              }}
            />
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap", minWidth: 0 }}>
              {chips.portText && (
                <span style={{
                  fontSize: 10, fontFamily: "ui-monospace, monospace", fontWeight: 600,
                  color: "var(--probemap-text-secondary)", letterSpacing: "-0.02em",
                }}>
                  {chips.portText}
                </span>
              )}
              <ProbeTypeBadge type={kindKeyForBadge(chips.kind)} statusColor={rowStatusColor} />
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
                WebkitMaskImage: "linear-gradient(to right, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
                maskImage: "linear-gradient(to right, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
              }}
              onMouseEnter={(e) => {
                const label = [row.source, row.module].filter(Boolean).join(" · ");
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
              {row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
            </span>
          </div>
        );
      }) : (!unmonitored && (
        <div style={{ color: "var(--probemap-text-faint)", marginBottom: 4 }}>
          {t("noData")}
        </div>
      ))}

      {/* Description */}
      <div style={{ height: 1, background: "var(--probemap-bg-subtle)", margin: "10px 0 8px" }} />
      <div style={{ fontWeight: 700, color: "var(--probemap-text-faint)", marginBottom: 6, fontSize: 10, letterSpacing: "0.06em" }}>{t("descriptionTitle")}</div>
      {locked && editingDesc ? (
        <div>
          <textarea autoFocus value={descDraft.slice(0, 120)}
            onChange={(e) => setDescDraft(e.target.value.slice(0, 120))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDesc(descDraft); } if (e.key === "Escape") setEditingDesc(false); }}
            onBlur={() => commitDesc(descDraft)}
            placeholder={t("descriptionPlaceholder")}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid var(--probemap-interactive-hover-border)", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "var(--probemap-text)", background: "var(--probemap-input-bg)", resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "var(--probemap-text-faint)" }}>
              {t("descriptionSaveHintBefore")}
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: "var(--probemap-interactive-hover-bg)", color: "var(--probemap-blue)", border: "1px solid var(--probemap-interactive-hover-border)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Enter</span>
              {t("descriptionSaveHintAfter")}
            </span>
            <span style={{
              fontSize: 10,
              color: descDraft.length >= 110 ? "var(--probemap-danger)" : descDraft.length >= 100 ? "var(--probemap-status-warn)" : "var(--probemap-text-faint)",
              fontWeight: descDraft.length >= 100 ? 600 : 400,
            }}>
              {descDraft.length}/120
            </span>
          </div>
        </div>
      ) : (
        <div
          onClick={locked ? () => { setDescDraft(d.description ?? ""); setEditingDesc(true); } : undefined}
          style={{ cursor: locked ? "text" : "default", color: d.description ? "var(--probemap-text)" : "var(--probemap-text-faint)", minHeight: 18, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "2px 0" }}
        >
          {d.description || (locked ? t("descriptionClickToAdd") : t("emDash"))}
        </div>
      )}

      {/* Actions */}
      <div style={{ height: 1, background: "var(--probemap-bg-subtle)", margin: "10px 0 8px" }} />
      <div style={{ fontWeight: 700, color: "var(--probemap-text-faint)", marginBottom: 8, fontSize: 10, letterSpacing: "0.06em" }}>{t("actionsTitle")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
        {(d.actions ?? []).map((action, i) => (
          <div key={i} style={{ position: "relative" }}
            onMouseEnter={(e) => { if (!locked) return; const b = e.currentTarget.querySelector<HTMLElement>(".rm-act"); if (b) b.style.display = "flex"; }}
            onMouseLeave={(e) => { const b = e.currentTarget.querySelector<HTMLElement>(".rm-act"); if (b) b.style.display = "none"; }}
          >
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              className="probemap-node-action-link"
              onMouseEnter={(e) => {
                if (dragging) return;
                setActionTooltip({ label: t("actionOpenTo").replace("{label}", action.label), el: e.currentTarget });
              }}
              onMouseLeave={() => setActionTooltip(null)}
            >
              <IconRenderer name={action.icon} size={14} />
            </a>
            {locked && (
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

        {locked && (addingAction ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, paddingTop: 2 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {ALL_ICONS.map((entry) => (
                <button
                  key={entry.icon}
                  type="button"
                  title={entry.label}
                  onClick={() => setNewActionIcon(entry.icon)}
                  style={{
                    width: 22, height: 22,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 4, padding: 0, flexShrink: 0, cursor: "pointer",
                    border: `1.5px solid ${newActionIcon === entry.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                    background: newActionIcon === entry.icon ? "var(--probemap-interactive-hover-bg)" : "transparent",
                    color: "var(--probemap-text-muted)",
                  }}
                >
                  <IconRenderer name={entry.icon} size={11} />
                </button>
              ))}
            </div>
            <input
              placeholder={t("actionNamePlaceholder")}
              value={newActionLabel}
              onChange={(e) => setNewActionLabel(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid var(--probemap-border)", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "var(--probemap-text)", background: "var(--probemap-input-bg)" }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus
                placeholder={t("actionUrlPlaceholder")}
                value={newActionUrl}
                onChange={(e) => setNewActionUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addAction(); if (e.key === "Escape") setAddingAction(false); }}
                style={{ flex: 1, border: "1.5px solid var(--probemap-border)", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "var(--probemap-text)", background: "var(--probemap-input-bg)" }}
              />
              <button type="button" onClick={addAction} className="probemap-btn probemap-btn--primary probemap-btn--xs">
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
          <button type="button" onClick={() => setAddingAction(true)} className="probemap-btn-dashed-icon">
            +
          </button>
        ))}
      </div>

      <ServiceLabelsSection labels={catalogLabels} />

      {/* Delete from canvas */}
      {locked && <DeleteButton nodeId={id} label={d.label} />}
    </div>,
    document.body
    ),
    actionTooltip && <HoverTooltip key="atip" label={actionTooltip.label} targetEl={actionTooltip.el} />,
    sourceTooltip && <HoverTooltip key="stip" label={sourceTooltip.label} targetEl={sourceTooltip.el} />,
] : null;

  return (
    <div ref={nodeRef} onMouseEnter={show} onMouseLeave={hide}>
      <div
        onClick={handleNodeClick}
        style={{
          background: nodeTint.bg,
          border: `1.5px solid ${nodeTint.border}`,
          borderRadius: groupVisual.borderRadius,
          padding: groupVisual.accentColor ? "8px 12px 8px 15px" : "8px 12px",
          minWidth: groupVisual.minWidth,
          boxShadow: "var(--probemap-node-card-shadow)",
          position: "relative", cursor: "pointer",
          outline: !colliding && locked ? "2px solid var(--probemap-interactive-hover-border)" : undefined,
          opacity: colliding ? 0.5 : 1,
          transition: "opacity 0.1s, outline 0.1s",
        }}
      >
        <AllHandles />
        {groupVisual.accentColor && (
          <div style={{
            position: "absolute",
            left: 0, top: 0, bottom: 0,
            width: 3,
            background: groupVisual.accentColor,
            opacity: 0.75,
            pointerEvents: "none",
            borderTopLeftRadius: groupVisual.borderRadius,
            borderBottomLeftRadius: groupVisual.borderRadius,
          }} />
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: ((d.ports ?? []).length > 0 || blackboxOrder.length > 0) ? 5 : 0 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              title={t("changeIconTitle")}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--probemap-text-muted)", display: "flex", borderRadius: 4 }}
            >
              <IconRenderer name={d.icon ?? DEFAULT_SERVICE_ICON_NAME} size={14} />
            </button>
            {!unmonitored && <div style={{ position: "absolute", bottom: -1, right: -1, width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[dotStatusKey] ?? STATUS_COLOR.unknown, border: "1.5px solid var(--probemap-status-dot-border)", pointerEvents: "none" }} />}
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", flex: "1 1 auto", minWidth: 0 }}>
                {(d.ports ?? []).map((p) => {
                  const chips = portProbeChips(p.port, p.probe_types, d.label, p.module);
                  const c = STATUS_COLOR[p.status] ?? STATUS_COLOR.unknown;
                  const pk = `${p.port}-${p.job ?? ""}-${p.module ?? ""}`;
                  return (
                    <div key={pk} style={{ display: "flex", gap: 3, alignItems: "center", flexWrap: "wrap" }}>
                      {chips.portText && (
                        <span style={{
                          fontSize: 10, fontFamily: "ui-monospace, monospace", fontWeight: 600,
                          padding: "1px 4px", borderRadius: 4,
                          background: c + "18",
                          color: c,
                          border: `1px solid ${c}44`,
                        }}>
                          {chips.portText}
                        </span>
                      )}
                      <ProbeTypeBadge type={kindKeyForBadge(chips.kind)} statusColor={c} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ flex: "1 1 auto", minWidth: 0 }} />
            )}
            {blackboxOrder.length > 0 && (
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center", flexShrink: 0, marginLeft: "auto" }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {blackboxOrder.filter((src) => !ignoredSources.has(src)).map((src) => {
                  const st = sourceAgg.get(src);
                  const dotBg =
                    !st ? "var(--probemap-status-unknown)"
                      : st.hasFail ? "var(--probemap-danger)"
                        : st.hasOk ? "var(--probemap-status-ok)"
                          : "var(--probemap-status-unknown)";
                  return (
                    <div
                      key={src}
                      onMouseEnter={(e) => { if (dragging) return; setBlackboxDotTooltip({ label: src, el: e.currentTarget }); }}
                      onMouseLeave={() => setBlackboxDotTooltip(null)}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: dotBg,
                        border: "1.5px solid var(--probemap-status-dot-border)",
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

      {panel}



      {blackboxDotTooltip && (
        <HoverTooltip label={blackboxDotTooltip.label} targetEl={blackboxDotTooltip.el} />
      )}
    </div>
  );
}

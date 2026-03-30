import { useReactFlow, useNodes, type Node, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Port, ServiceAction } from "../api";
import { portProbeChips } from "../probeDisplay";
import { IconRenderer } from "../IconRenderer";
import { AllHandles } from "./handles";
import { IconPicker } from "../IconPicker";
import { useColliding } from "../CollisionContext";
import { HoverTooltip } from "../Tooltip";
import { useProbeSources, useServices } from "../ServicesContext";
import { useI18n } from "../i18n";
import { TrashIcon } from "../TrashIcon";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warn: "#f97316",
  down: "#ef4444",
  unknown: "#9ca3af",
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
  /** Если это сервис-узел без метрик или “связанный” пользовательский узел — хранит id сервиса */
  matchServiceId?: string | null;
  icon?: string;
  description?: string;
  actions?: ServiceAction[];
}

/** Id сервисов, уже представленных другим узлом (узел с id из каталога или с matchServiceId). */
function occupiedServiceIds(nodes: Node[], excludeNodeId: string, catalogIds: Set<string>): Set<string> {
  const used = new Set<string>();
  for (const n of nodes) {
    if (n.type !== "service" || n.id === excludeNodeId) continue;
    const md = n.data as unknown as ServiceNodeData;
    if (md.matchServiceId) used.add(md.matchServiceId);
    else if (catalogIds.has(n.id)) used.add(n.id);
  }
  return used;
}

export function ServiceNode({ data, id }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  const { updateNodeData } = useReactFlow();
  const nodes = useNodes();
  const services = useServices();
  const probeSourcesGlobal = useProbeSources();
  const { t } = useI18n();

  const nodeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [visible, setVisible] = useState(false);
  const [locked, setLocked] = useState(false);

  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const [actionPickerAnchor, setActionPickerAnchor] = useState<{ x: number; y: number } | null>(null);
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
  const portAgg = aggStatus(d.ports ?? []);
  const isNoMetrics = (d.ports ?? []).length === 0;

  /** Для привязки: не показывать сервисы, уже занятые другим узлом; текущая привязка остаётся в списке. */
  const bindableServices = useMemo(() => {
    const catalogIds = new Set(services.map((s) => s.id));
    const used = occupiedServiceIds(nodes, id, catalogIds);
    const currentEffective = d.matchServiceId ?? (catalogIds.has(id) ? id : null);
    return services.filter(
      (svc) => !used.has(svc.id) || (currentEffective != null && svc.id === currentEffective),
    );
  }, [nodes, services, id, d.matchServiceId]);

  const bindToService = (serviceId: string | null) => {
    const svc = serviceId ? services.find((s) => s.id === serviceId) ?? null : null;
    updateNodeData(id, {
      matchServiceId: serviceId,
      label: svc?.name ?? d.label,
      ports: svc?.ports ?? [],
    });
  };

  // Строка на пару порт×зона×job×module; тип пробы для зоны без серии — из агрегата порта (не «TCP» по умолчанию)
  const probeRows = (d.ports ?? []).flatMap((p) =>
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

  const expectedBb = (probeSourcesGlobal ?? []).filter(Boolean).length;
  const presentBb = sourceAgg.size;

  /** Список blackbox (instance), в том же порядке что и в API; иначе — из фактических источников по узлу */
  const blackboxOrder = (() => {
    const fromCfg = (probeSourcesGlobal ?? []).filter(Boolean);
    if (fromCfg.length > 0) return fromCfg;
    return Array.from(sourceAgg.keys()).sort((a, b) => a.localeCompare(b, "ru"));
  })();

  const nodeTint = status === "ok"
    ? { border: "#22c55e66", bg: "#22c55e0f" }
    : status === "warn"
      ? { border: "#f9731666", bg: "#f973160f" }
      : status === "down"
        ? { border: "#ef444466", bg: "#ef44440f" }
        : { border: "#cbd5e1", bg: "#fff" };

  const show = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(true);
  };

  const hide = () => {
    if (locked) return;
    hideTimer.current = setTimeout(() => setVisible(false), 150);
  };

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked) {
      setLocked(false);
      setVisible(false);
      setEditingDesc(false);
      setAddingAction(false);
    } else {
      setLocked(true);
      setVisible(true);
    }
  };

  useEffect(() => {
    if (!locked) return;
    const onMouse = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (nodeRef.current?.contains(e.target as Node)) return;
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
        background: "#fff",
        border: `1.5px solid ${locked ? "#93c5fd" : "#e2e8f0"}`,
        borderRadius: 10,
        boxShadow: locked ? "0 6px 24px rgba(59,130,246,.18)" : "0 4px 16px rgba(0,0,0,.1)",
        padding: "12px 14px",
        fontSize: 12,
        position: "relative",
      }}
    >
      {/* Probes */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 7 }}>
        <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, letterSpacing: "0.06em" }}>{t("monitoringTitle")}</div>
        {totalPresent > 0 && (
          <div style={{
            fontSize: 11,
            fontWeight: 700,
            color: status === "ok" ? "#16a34a" : status === "down" ? "#ef4444" : status === "warn" ? "#f97316" : "#94a3b8",
          }}>
            {t("monitoringSummary").replace("{ok}", String(okPresent)).replace("{total}", String(totalPresent))}
          </div>
        )}
      </div>
      {expectedBb > 0 && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 8, marginTop: -4 }}>
          {t("monitoringSourcesCoverage").replace("{present}", String(presentBb)).replace("{expected}", String(expectedBb))}
        </div>
      )}
      {probeRows.length > 0 ? probeRows.map((row) => {
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
                  color: "#475569", letterSpacing: "-0.02em",
                }}>
                  {chips.portText}
                </span>
              )}
              <ProbeTypeBadge type={kindKeyForBadge(chips.kind)} statusColor={rowStatusColor} />
            </div>
            <span
              style={{
                color: "#0f172a",
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
                setSourceTooltip({ label, el: e.currentTarget });
              }}
              onMouseLeave={() => setSourceTooltip(null)}
              title={undefined}
            >
              {row.source}
            </span>
            <span
              style={{
                color: "#94a3b8",
                fontSize: 11,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {row.duration_ms != null ? `${row.duration_ms}ms` : "—"}
            </span>
          </div>
        );
      }) : (
        <div style={{ color: "#94a3b8", marginBottom: 4 }}>
          {t("noData")}
          {locked && isNoMetrics && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontWeight: 700, color: "#94a3b8", fontSize: 10, letterSpacing: "0.06em" }}>{t("bindTitle")}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.4 }}>{t("noMetricsText")}</div>
              <select
                value={d.matchServiceId ?? ""}
                onChange={(e) => bindToService(e.target.value ? e.target.value : null)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "6px 8px",
                  borderRadius: 7,
                  border: "1.5px solid #e2e8f0",
                  background: "#fff",
                  color: "#0f172a",
                  fontSize: 12,
                  outline: "none",
                }}
              >
                <option value="">{t("emDash")}</option>
                {bindableServices.map((svc) => (
                  <option key={svc.id} value={svc.id}>
                    {svc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0 8px" }} />
      <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 6, fontSize: 10, letterSpacing: "0.06em" }}>{t("descriptionTitle")}</div>
      {locked && editingDesc ? (
        <div>
          <textarea autoFocus value={descDraft.slice(0, 120)}
            onChange={(e) => setDescDraft(e.target.value.slice(0, 120))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDesc(descDraft); } if (e.key === "Escape") setEditingDesc(false); }}
            onBlur={() => commitDesc(descDraft)}
            placeholder={t("descriptionPlaceholder")}
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #93c5fd", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "#0f172a", resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>
              {t("descriptionSaveHintBefore")}
              <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f644", textTransform: "uppercase", letterSpacing: "0.04em" }}>Enter</span>
              {t("descriptionSaveHintAfter")}
            </span>
            <span style={{
              fontSize: 10,
              color: descDraft.length >= 110 ? "#ef4444" : descDraft.length >= 100 ? "#f97316" : "#94a3b8",
              fontWeight: descDraft.length >= 100 ? 600 : 400,
            }}>
              {descDraft.length}/120
            </span>
          </div>
        </div>
      ) : (
        <div
          onClick={locked ? () => { setDescDraft(d.description ?? ""); setEditingDesc(true); } : undefined}
          style={{ cursor: locked ? "text" : "default", color: d.description ? "#0f172a" : "#94a3b8", minHeight: 18, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "2px 0" }}
        >
          {d.description || (locked ? t("descriptionClickToAdd") : t("emDash"))}
        </div>
      )}

      {/* Actions */}
      <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0 8px" }} />
      <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 8, fontSize: 10, letterSpacing: "0.06em" }}>{t("actionsTitle")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
        {(d.actions ?? []).map((action, i) => (
          <div key={i} style={{ position: "relative" }}
            onMouseEnter={(e) => { if (!locked) return; const b = e.currentTarget.querySelector<HTMLElement>(".rm-act"); if (b) b.style.display = "flex"; }}
            onMouseLeave={(e) => { const b = e.currentTarget.querySelector<HTMLElement>(".rm-act"); if (b) b.style.display = "none"; }}
          >
            <a href={action.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 7, background: "#f8fafc", border: "1.5px solid #e2e8f0", color: "#475569", textDecoration: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.color = "#3b82f6"; setActionTooltip({ label: t("actionOpenTo").replace("{label}", action.label), el: e.currentTarget }); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; setActionTooltip(null); }}
            >
              <IconRenderer name={action.icon} size={14} />
            </a>
            {locked && (
              <button
                className="rm-act"
                type="button"
                onClick={() => removeAction(i)}
                style={{
                  display: "none",
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "none",
                  background: "#ef4444",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <TrashIcon variantOnRed size={8} />
              </button>
            )}
          </div>
        ))}

        {locked && (addingAction ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={(e) => setActionPickerAnchor({ x: e.clientX + 8, y: e.clientY })}
                style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 7, background: "#f8fafc", border: "1.5px solid #e2e8f0", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconRenderer name={newActionIcon} size={14} />
              </button>
              <input placeholder={t("actionNamePlaceholder")} value={newActionLabel} onChange={(e) => setNewActionLabel(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "#0f172a" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input autoFocus placeholder={t("actionUrlPlaceholder")} value={newActionUrl} onChange={(e) => setNewActionUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addAction(); if (e.key === "Escape") setAddingAction(false); }}
                style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "#0f172a" }} />
              <button onClick={addAction} style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: "#3b82f6", color: "#fff", fontSize: 12, cursor: "pointer" }}>{t("uiOk")}</button>
              <button onClick={() => setAddingAction(false)} style={{ padding: "4px 8px", borderRadius: 5, border: "1.5px solid #e2e8f0", background: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>✕</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddingAction(true)}
            style={{ width: 32, height: 32, borderRadius: 7, background: "none", border: "1.5px dashed #cbd5e1", color: "#94a3b8", cursor: "pointer", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#3b82f6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#94a3b8"; }}
          >+</button>
        ))}
      </div>

      {/* Delete from canvas */}
      {locked && (
        <button
          title={t("removeFromCanvas")}
          onClick={(e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent("delete-node-request", { detail: { id, label: d.label } }));
          }}
          style={{
            position: "absolute", bottom: 10, right: 10,
            width: 26, height: 26, borderRadius: 6,
            border: "none", background: "transparent",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 0,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <TrashIcon size={15} />
        </button>
      )}
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
          borderRadius: 8,
          padding: "8px 12px", minWidth: 140, boxShadow: "0 1px 4px rgba(0,0,0,.1)",
          position: "relative", cursor: "pointer",
          outline: colliding ? "2px solid #f97316" : locked ? "2px solid #93c5fd" : undefined,
          transition: "outline 0.1s",
        }}
      >
        {colliding && <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: "rgba(249,115,22,0.15)", pointerEvents: "none", zIndex: 10 }} />}
        <AllHandles />

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: ((d.ports ?? []).length > 0 || blackboxOrder.length > 0) ? 5 : 0 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setPickerAnchor({ x: e.clientX + 8, y: e.clientY }); }}
              title={t("changeIconTitle")}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#64748b", display: "flex", borderRadius: 4 }}
            >
              <IconRenderer name={d.icon ?? "FaDisplay"} size={14} />
            </button>
            <div style={{ position: "absolute", bottom: -1, right: -1, width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[status], border: "1.5px solid #fff", pointerEvents: "none" }} />
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "#0f172a",
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
                {blackboxOrder.map((src) => {
                  const st = sourceAgg.get(src);
                  const dotBg =
                    !st ? "#9ca3af"
                      : st.hasFail ? "#ef4444"
                        : st.hasOk ? "#22c55e"
                          : "#9ca3af";
                  return (
                    <div
                      key={src}
                      onMouseEnter={(e) => setBlackboxDotTooltip({ label: src, el: e.currentTarget })}
                      onMouseLeave={() => setBlackboxDotTooltip(null)}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: dotBg,
                        border: "1.5px solid #fff",
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

      {pickerAnchor && (
        <IconPicker anchorX={pickerAnchor.x} anchorY={pickerAnchor.y}
          onSelect={(name) => { updateNodeData(id, { icon: name }); setPickerAnchor(null); }}
          onClose={() => setPickerAnchor(null)} />
      )}
      {actionPickerAnchor && (
        <IconPicker anchorX={actionPickerAnchor.x} anchorY={actionPickerAnchor.y}
          onSelect={(name) => { setNewActionIcon(name); setActionPickerAnchor(null); }}
          onClose={() => setActionPickerAnchor(null)} />
      )}
      {blackboxDotTooltip && (
        <HoverTooltip label={blackboxDotTooltip.label} targetEl={blackboxDotTooltip.el} />
      )}
    </div>
  );
}

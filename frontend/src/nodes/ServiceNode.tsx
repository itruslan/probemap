import { useReactFlow, type NodeProps } from "@xyflow/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Port, ServiceAction } from "../api";
import { IconRenderer } from "../IconRenderer";
import { AllHandles } from "./handles";
import { IconPicker } from "../IconPicker";
import { useColliding } from "../CollisionContext";
import { HoverTooltip } from "../Tooltip";

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  warn: "#f97316",
  down: "#ef4444",
  unknown: "#9ca3af",
};

const PROBE_COLOR: Record<string, string> = {
  http:  "#3b82f6",
  tcp:   "#8b5cf6",
  icmp:  "#eab308",
  udp:   "#f97316",
  dns:   "#22c55e",
};

function aggStatus(ports: Port[]): string {
  if (!ports?.length) return "unknown";
  if (ports.some((p) => p.status === "down")) return "down";
  if (ports.some((p) => p.status === "warn")) return "warn";
  if (ports.every((p) => p.status === "ok")) return "ok";
  return "unknown";
}

function ProbeTypeBadge({ type, active }: { type: string; active: boolean }) {
  const color = PROBE_COLOR[type] ?? "#64748b";
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
      background: active ? color + "22" : "#f1f5f9",
      color: active ? color : "#94a3b8",
      border: `1px solid ${active ? color + "44" : "#e2e8f0"}`,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
    }}>
      {type}
    </span>
  );
}

export interface ServiceNodeData {
  label: string;
  ports: Port[];
  icon?: string;
  description?: string;
  actions?: ServiceAction[];
}

export function ServiceNode({ data, id }: NodeProps) {
  const d = data as unknown as ServiceNodeData;
  const { updateNodeData } = useReactFlow();

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
  const [newActionLabel, setNewActionLabel] = useState("");
  const [newActionUrl, setNewActionUrl] = useState("");

  const colliding = useColliding(id);
  const status = aggStatus(d.ports ?? []);

  // all probe types across all ports (for badge row)
  const allProbeTypes = [...new Set((d.ports ?? []).flatMap((p) => p.probe_types ?? []))].sort();

  // aggregate zones across all ports
  const probes = new Map<string, { ok: boolean; duration_ms?: number; probe_types: string[] }>();
  for (const port of d.ports ?? []) {
    for (const [zone, s] of Object.entries(port.zones ?? {})) {
      const ok = s.success === 1;
      const existing = probes.get(zone);
      const types = [...new Set([...(existing?.probe_types ?? []), ...(s.probe_types ?? [])])];
      if (!existing || (existing.ok && !ok)) {
        probes.set(zone, { ok, duration_ms: s.duration_ms ?? undefined, probe_types: types });
      } else {
        probes.set(zone, { ...existing, probe_types: types });
      }
    }
  }

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

  const panel = visible && liveRect ? [createPortal(
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
      <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 7, fontSize: 10, letterSpacing: "0.06em" }}>MONITORING</div>
      {probes.size > 0 ? [...probes.entries()].map(([zone, s]) => (
        <div
          key={zone}
          style={{
            display: "grid",
            gridTemplateColumns: "10px minmax(0, 1fr) auto 4.25rem",
            alignItems: "center",
            columnGap: 8,
            marginBottom: 5,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              justifySelf: "center",
              background: s.ok ? "#22c55e" : "#ef4444",
            }}
          />
          <span style={{ color: "#0f172a", fontSize: 12, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{zone}</span>
          <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {allProbeTypes.map((type) => (
              <ProbeTypeBadge key={type} type={type} active={s.probe_types.includes(type)} />
            ))}
          </div>
          <span
            style={{
              color: "#94a3b8",
              fontSize: 11,
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {s.duration_ms != null ? `${s.duration_ms}ms` : "—"}
          </span>
        </div>
      )) : <div style={{ color: "#94a3b8", marginBottom: 4 }}>Нет данных</div>}

      {/* Description */}
      <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0 8px" }} />
      <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 6, fontSize: 10, letterSpacing: "0.06em" }}>DESCRIPTION</div>
      {locked && editingDesc ? (
        <div>
          <textarea autoFocus value={descDraft.slice(0, 120)}
            onChange={(e) => setDescDraft(e.target.value.slice(0, 120))}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitDesc(descDraft); } if (e.key === "Escape") setEditingDesc(false); }}
            onBlur={() => commitDesc(descDraft)}
            placeholder="Описание..."
            rows={2}
            style={{ width: "100%", boxSizing: "border-box", border: "1.5px solid #93c5fd", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "#0f172a", resize: "vertical", lineHeight: 1.4, fontFamily: "inherit" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
            <span style={{ fontSize: 10, color: "#94a3b8" }}>
              Нажмите <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: "#3b82f622", color: "#3b82f6", border: "1px solid #3b82f644", textTransform: "uppercase", letterSpacing: "0.04em" }}>Enter</span> для сохранения
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
          {d.description || (locked ? "Нажмите, чтобы добавить описание..." : "—")}
        </div>
      )}

      {/* Actions */}
      <div style={{ height: 1, background: "#f1f5f9", margin: "10px 0 8px" }} />
      <div style={{ fontWeight: 700, color: "#94a3b8", marginBottom: 8, fontSize: 10, letterSpacing: "0.06em" }}>ACTIONS</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "flex-start" }}>
        {(d.actions ?? []).map((action, i) => (
          <div key={i} style={{ position: "relative" }}
            onMouseEnter={(e) => { if (!locked) return; const b = e.currentTarget.querySelector<HTMLElement>(".rm-act"); if (b) b.style.display = "flex"; }}
            onMouseLeave={(e) => { const b = e.currentTarget.querySelector<HTMLElement>(".rm-act"); if (b) b.style.display = "none"; }}
          >
            <a href={action.url} target="_blank" rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, height: 32, borderRadius: 7, background: "#f8fafc", border: "1.5px solid #e2e8f0", color: "#475569", textDecoration: "none" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.color = "#3b82f6"; setActionTooltip({ label: `Перейти к ${action.label}`, el: e.currentTarget }); }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f8fafc"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.color = "#475569"; setActionTooltip(null); }}
            >
              <IconRenderer name={action.icon} size={14} />
            </a>
            {locked && <button className="rm-act" onClick={() => removeAction(i)} style={{ display: "none", position: "absolute", top: -4, right: -4, width: 14, height: 14, borderRadius: "50%", border: "none", background: "#ef4444", color: "#fff", fontSize: 8, cursor: "pointer", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>}
          </div>
        ))}

        {locked && (addingAction ? (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <button onClick={(e) => setActionPickerAnchor({ x: e.clientX + 8, y: e.clientY })}
                style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 7, background: "#f8fafc", border: "1.5px solid #e2e8f0", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <IconRenderer name={newActionIcon} size={14} />
              </button>
              <input placeholder="Название" value={newActionLabel} onChange={(e) => setNewActionLabel(e.target.value)}
                style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "#0f172a" }} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input autoFocus placeholder="https://..." value={newActionUrl} onChange={(e) => setNewActionUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addAction(); if (e.key === "Escape") setAddingAction(false); }}
                style={{ flex: 1, border: "1.5px solid #e2e8f0", borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none", color: "#0f172a" }} />
              <button onClick={addAction} style={{ padding: "4px 10px", borderRadius: 5, border: "none", background: "#3b82f6", color: "#fff", fontSize: 12, cursor: "pointer" }}>ОК</button>
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
          title="Удалить с карты"
          onClick={(e) => {
            e.stopPropagation();
            document.dispatchEvent(new CustomEvent("delete-node-request", { detail: { id, label: d.label } }));
          }}
          style={{
            position: "absolute", bottom: 10, right: 10,
            width: 26, height: 26, borderRadius: 6,
            border: "none", background: "transparent",
            color: "#ef4444", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, transition: "background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#fef2f2"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      )}
    </div>,
    document.body
  ),
  actionTooltip && <HoverTooltip key="atip" label={actionTooltip.label} targetEl={actionTooltip.el} />,
] : null;

  return (
    <div ref={nodeRef} onMouseEnter={show} onMouseLeave={hide}>
      <div
        onClick={handleNodeClick}
        style={{
          background: "#fff", border: "1.5px solid #cbd5e1", borderRadius: 8,
          padding: "8px 12px", minWidth: 140, boxShadow: "0 1px 4px rgba(0,0,0,.1)",
          position: "relative", cursor: "pointer",
          outline: colliding ? "2px solid #f97316" : locked ? "2px solid #93c5fd" : undefined,
          transition: "outline 0.1s",
        }}
      >
        {colliding && <div style={{ position: "absolute", inset: 0, borderRadius: 8, background: "rgba(249,115,22,0.15)", pointerEvents: "none", zIndex: 10 }} />}
        <AllHandles />

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: (d.ports ?? []).length ? 5 : 0 }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setPickerAnchor({ x: e.clientX + 8, y: e.clientY }); }}
              title="Сменить иконку"
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#64748b", display: "flex", borderRadius: 4 }}
            >
              <IconRenderer name={d.icon ?? "FaDisplay"} size={14} />
            </button>
            <div style={{ position: "absolute", bottom: -1, right: -1, width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[status], border: "1.5px solid #fff", pointerEvents: "none" }} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "#0f172a", flex: 1, userSelect: "none" }}>{d.label}</span>
        </div>

        {(d.ports ?? []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {(d.ports ?? []).map((p) => (
              <span key={p.port} style={{
                fontSize: 10, padding: "1px 5px", borderRadius: 4,
                background: STATUS_COLOR[p.status] + "18",
                color: STATUS_COLOR[p.status],
                border: `1px solid ${STATUS_COLOR[p.status]}33`,
                fontFamily: "monospace",
              }}>:{p.port}</span>
            ))}
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
    </div>
  );
}

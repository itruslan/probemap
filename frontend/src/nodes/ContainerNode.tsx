import { useReactFlow, useStore, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AllHandles } from "./handles";
import { useContainerDrop } from "../ContainerDropContext";
import { useTrace } from "../TraceContext";
import { useI18n } from "../i18n";
import { IconRenderer } from "../IconRenderer";
import { ALL_ICONS } from "../icons";
import { DeleteButton } from "./DeleteButton";

// ── Layout constants (exported for TopologyCanvas) ───────────────────────────
export const CONTAINER_WIDTH    = 256;
export const CONTAINER_INNER_W  = 208; // WIDTH - 2 * SIDE_PAD
export const CONTAINER_SIDE_PAD = 24;
export const CONTAINER_HEADER_H = 46;
export const CONTAINER_TOP_PAD  = 10;
export const CONTAINER_BOTTOM_PAD = 10;
export const CONTAINER_CARD_H   = 72;
export const CONTAINER_CARD_GAP = 6;

export function containerHeight(n: number): number {
  if (n === 0) return CONTAINER_HEADER_H + 64 + CONTAINER_BOTTOM_PAD;
  return (
    CONTAINER_HEADER_H +
    CONTAINER_TOP_PAD +
    n * CONTAINER_CARD_H +
    (n - 1) * CONTAINER_CARD_GAP +
    CONTAINER_BOTTOM_PAD
  );
}

/** Absolute Y of slot i within container (relative to container top). */
export function slotTopInContainer(i: number): number {
  return CONTAINER_HEADER_H + CONTAINER_TOP_PAD + i * (CONTAINER_CARD_H + CONTAINER_CARD_GAP);
}

// ── Data type ────────────────────────────────────────────────────────────────
export interface ContainerNodeData extends Record<string, unknown> {
  label: string;
  icon?: string;
  path?: string;
  description?: string;
  endpoint?: string;
  items: string[]; // ordered list of member service/object node IDs
}

// ── Component ────────────────────────────────────────────────────────────────
export const ContainerNode = memo(function ContainerNode({ id, data }: NodeProps) {
  const d = data as unknown as ContainerNodeData;
  const { updateNode, updateNodeData, flowToScreenPosition, getNode } = useReactFlow();
  const transform = useStore((s) => s.transform); // re-render on pan/zoom
  const { canEdit } = useTrace();
  const { t } = useI18n();
  const pendingDrop = useContainerDrop();

  // ── Label editing ──────────────────────────────────────────────────────────
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState(d.label || t("defaultContainerLabel"));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLabel(d.label || t("defaultContainerLabel")); }, [d.label, t]);

  // ── Hover panel ────────────────────────────────────────────────────────────
  const nodeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [locked, setLocked] = useState(false);
  const [editingIcon, setEditingIcon] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState("");

  const show = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    showTimer.current = setTimeout(() => { setPanelVisible(true); showTimer.current = null; }, 600);
  };
  const hide = () => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    if (locked) return;
    hideTimer.current = setTimeout(() => { setPanelVisible(false); setEditingIcon(false); }, 200);
  };

  const handleNodeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (locked) {
      setLocked(false);
      setPanelVisible(false);
      setEditingIcon(false);
      setEditingEndpoint(false);
      setEditingDesc(false);
    } else {
      setLocked(true);
      setPanelVisible(true);
      if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    }
  };

  // Close on outside mousedown when locked
  useEffect(() => {
    if (!locked) return;
    const onMouse = (e: MouseEvent) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      const rfWrapper = nodeRef.current?.closest(".react-flow__node");
      if (e.target instanceof Node && rfWrapper?.contains(e.target)) return;
      if (e.target instanceof Element && e.target.closest("[data-probemap-modal]")) return;
      setLocked(false);
      setPanelVisible(false);
      setEditingIcon(false);
      setEditingEndpoint(false);
      setEditingDesc(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLocked(false);
        setPanelVisible(false);
        setEditingIcon(false);
        setEditingEndpoint(false);
        setEditingDesc(false);
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
  }, [locked, canEdit, id, d.label]);

  const panelW = 260;
  const liveRect = panelVisible ? (nodeRef.current?.getBoundingClientRect() ?? null) : null;
  const panelStyle = liveRect
    ? (() => {
        const gap = 20;
        const left = window.innerWidth - liveRect.right - gap >= panelW
          ? liveRect.right + gap
          : liveRect.left - panelW - gap;
        const top = Math.max(8, liveRect.top + liveRect.height / 2 - 80);
        return { position: "fixed" as const, top, left: Math.max(8, left), width: panelW };
      })()
    : {};

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
  });

  // ── Container size sync (fixed card heights) ───────────────────────────────
  useEffect(() => {
    const h = containerHeight(d.items.length);
    updateNode(id, { style: { width: CONTAINER_WIDTH, height: h } });
    d.items.forEach((itemId, idx) => {
      updateNode(itemId, { position: { x: CONTAINER_SIDE_PAD, y: slotTopInContainer(idx) } });
    });
  }, [id, d.items, updateNode]);

  const isDropTarget = pendingDrop?.containerId === id;

  // Build slot visual positions — relative to container-node__body (after the header)
  const slots: number[] = [];
  if (isDropTarget) {
    for (let i = 0; i <= d.items.length; i++) {
      slots.push(slotTopInContainer(i) - CONTAINER_HEADER_H);
    }
  }

  const panel = panelVisible && liveRect
    ? createPortal(
        <div
          ref={panelRef}
          onMouseEnter={() => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } }}
          onMouseLeave={hide}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            ...panelStyle,
            zIndex: 3000,
            background: "var(--probemap-modal-bg)",
            border: "1.5px solid var(--probemap-border)",
            borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,.1)",
            padding: "12px 14px 46px",
            fontSize: 12,
            boxSizing: "border-box",
          }}
        >
          {/* Header: icon picker + label */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: editingIcon ? 6 : 10 }}>
            <button
              type="button"
              title={t("changeIconTitle")}
              onClick={() => { if (canEdit) setEditingIcon((v) => !v); }}
              style={{
                flexShrink: 0,
                background: editingIcon ? "var(--probemap-interactive-hover-bg)" : "transparent",
                border: `1.5px solid ${editingIcon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                borderRadius: 6,
                padding: 3,
                cursor: canEdit ? "pointer" : "default",
                color: "var(--probemap-text-muted)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {d.icon
                ? <IconRenderer name={d.icon} size={16} />
                : <span style={{ fontSize: 16, lineHeight: 1 }}>📦</span>
              }
            </button>
            <div
              style={{
                fontSize: 13, fontWeight: 700, color: "var(--probemap-text)",
                flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", letterSpacing: "-0.01em",
              }}
            >
              {label}
            </div>
          </div>

          {/* Icon picker grid */}
          {editingIcon && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 10 }}>
              {/* Emoji reset option */}
              <button
                type="button"
                title="📦"
                onClick={() => { updateNodeData(id, { icon: undefined }); setEditingIcon(false); }}
                style={{
                  width: 22, height: 22, display: "flex", alignItems: "center",
                  justifyContent: "center", borderRadius: 4, padding: 0, flexShrink: 0,
                  cursor: "pointer", fontSize: 13,
                  border: `1.5px solid ${!d.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                  background: !d.icon ? "var(--probemap-interactive-hover-bg)" : "transparent",
                }}
              >
                📦
              </button>
              {ALL_ICONS.map((entry) => (
                <button
                  key={entry.icon}
                  type="button"
                  title={entry.label}
                  onClick={() => { updateNodeData(id, { icon: entry.icon }); setEditingIcon(false); }}
                  style={{
                    width: 22, height: 22, display: "flex", alignItems: "center",
                    justifyContent: "center", borderRadius: 4, padding: 0, flexShrink: 0,
                    cursor: "pointer",
                    border: `1.5px solid ${d.icon === entry.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                    background: d.icon === entry.icon ? "var(--probemap-interactive-hover-bg)" : "transparent",
                    color: "var(--probemap-text-muted)",
                  }}
                >
                  <IconRenderer name={entry.icon} size={11} />
                </button>
              ))}
            </div>
          )}

          {/* Endpoint */}
          <div style={{ height: 1, background: "var(--probemap-bg-subtle)", margin: "0 0 8px" }} />
          <div style={{ fontWeight: 700, color: "var(--probemap-text-faint)", marginBottom: 6, fontSize: 10, letterSpacing: "0.06em" }}>
            {t("endpointTitle")}
          </div>
          {editingEndpoint ? (
            <input
              autoFocus
              value={endpointDraft}
              onChange={(e) => setEndpointDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  updateNodeData(id, { endpoint: endpointDraft.trim() || undefined });
                  setEditingEndpoint(false);
                }
                if (e.key === "Escape") setEditingEndpoint(false);
                e.stopPropagation();
              }}
              onBlur={() => {
                updateNodeData(id, { endpoint: endpointDraft.trim() || undefined });
                setEditingEndpoint(false);
              }}
              placeholder={t("endpointPlaceholder")}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                width: "100%", boxSizing: "border-box",
                border: "1.5px solid var(--probemap-interactive-hover-border)",
                borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none",
                color: "var(--probemap-text)", background: "var(--probemap-input-bg)",
              }}
            />
          ) : (
            <div
              onClick={canEdit ? () => { setEndpointDraft(d.endpoint ?? ""); setEditingEndpoint(true); } : undefined}
              style={{
                cursor: canEdit ? "pointer" : "default",
                color: d.endpoint ? "var(--probemap-text)" : "var(--probemap-text-faint)",
                minHeight: 18, fontSize: 12, wordBreak: "break-all", padding: "2px 0",
              }}
            >
              {d.endpoint ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ textDecoration: "underline", textDecorationColor: "var(--probemap-text-faint)", wordBreak: "break-all" }}>
                    {d.endpoint}
                  </span>
                  <button
                    type="button"
                    title={t("endpointOpenInNewTab")}
                    onClick={(e) => {
                      e.stopPropagation();
                      const u = d.endpoint!.trim();
                      window.open(/^https?:\/\//i.test(u) ? u : `https://${u}`, "_blank", "noopener,noreferrer");
                    }}
                    style={{
                      flexShrink: 0, border: "1px solid var(--probemap-border)",
                      background: "var(--probemap-bg-subtle)", borderRadius: 4,
                      padding: "0 5px", fontSize: 11, cursor: "pointer",
                      color: "var(--probemap-text-muted)", lineHeight: 1.4,
                    }}
                  >↗</button>
                </div>
              ) : canEdit ? t("endpointClickToAdd") : t("emDash")}
            </div>
          )}

          {/* Description */}
          <div style={{ height: 1, background: "var(--probemap-bg-subtle)", margin: "10px 0 8px" }} />
          <div style={{ fontWeight: 700, color: "var(--probemap-text-faint)", marginBottom: 6, fontSize: 10, letterSpacing: "0.06em" }}>
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
                    updateNodeData(id, { description: descDraft.trim() || undefined });
                    setEditingDesc(false);
                  }
                  if (e.key === "Escape") setEditingDesc(false);
                  e.stopPropagation();
                }}
                onBlur={() => { updateNodeData(id, { description: descDraft.trim() || undefined }); setEditingDesc(false); }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                placeholder={t("descriptionPlaceholder")}
                rows={2}
                style={{
                  width: "100%", boxSizing: "border-box",
                  border: "1.5px solid var(--probemap-interactive-hover-border)",
                  borderRadius: 5, padding: "4px 8px", fontSize: 12, outline: "none",
                  color: "var(--probemap-text)", background: "var(--probemap-input-bg)",
                  resize: "vertical", lineHeight: 1.4, fontFamily: "inherit",
                }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 2 }}>
                <span style={{ fontSize: 10, color: descDraft.length >= 100 ? "var(--probemap-danger)" : "var(--probemap-text-faint)" }}>
                  {descDraft.length}/120
                </span>
              </div>
            </div>
          ) : (
            <div
              onClick={canEdit ? () => { setDescDraft(d.description ?? ""); setEditingDesc(true); } : undefined}
              style={{
                cursor: canEdit ? "text" : "default",
                color: d.description ? "var(--probemap-text)" : "var(--probemap-text-faint)",
                minHeight: 18, lineHeight: 1.5, whiteSpace: "pre-wrap",
                wordBreak: "break-word", padding: "2px 0",
              }}
            >
              {d.description || (canEdit ? t("descriptionClickToAdd") : t("emDash"))}
            </div>
          )}

          {canEdit && <DeleteButton nodeId={id} label={d.label ?? id} />}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <AllHandles />
      {panel}

      <div
        ref={nodeRef}
        className="container-node"
        onMouseEnter={show}
        onMouseLeave={hide}
        onClick={handleNodeClick}
      >
        {/* Header */}
        <div className="container-node__header">
          <div className="container-node__icon">
            {d.icon ? <IconRenderer name={d.icon} size={14} /> : "📦"}
          </div>
          {editingLabel ? (
            <input
              ref={inputRef}
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                const v = label.trim() || t("defaultContainerLabel");
                setLabel(v);
                updateNodeData(id, { label: v });
                setEditingLabel(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") inputRef.current?.blur();
                if (e.key === "Escape") {
                  setLabel(d.label || t("defaultContainerLabel"));
                  setEditingLabel(false);
                }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              className="container-node__label-input"
            />
          ) : (
            <span
              className="container-node__label"
              onDoubleClick={() => { if (canEdit) setEditingLabel(true); }}
              title={canEdit ? t("doubleClickToEdit") : undefined}
            >
              {label}
            </span>
          )}
          {d.items.length > 0 && (
            <span className="container-node__count">{d.items.length}</span>
          )}
        </div>

        {/* Body */}
        <div
          className="container-node__body"
          style={{
            minHeight: d.items.length === 0 ? 64 : undefined,
            height: d.items.length > 0
              ? containerHeight(d.items.length) - CONTAINER_HEADER_H
              : undefined,
            overflow: isDropTarget ? "visible" : undefined,
          }}
        >
          {d.items.length === 0 && !isDropTarget && (
            <div className="container-node__empty">
              {t("containerEmpty")}
            </div>
          )}

          {/* Slot indicators — thin line at insert position */}
          {isDropTarget && slots.map((topY, i) => {
            const isActive = pendingDrop?.insertIndex === i;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  top: topY - 2,
                  left: CONTAINER_SIDE_PAD,
                  width: CONTAINER_INNER_W,
                  height: isActive ? 3 : 0,
                  background: "var(--probemap-blue)",
                  borderRadius: 2,
                  boxShadow: isActive ? "0 0 8px var(--probemap-blue)" : "none",
                  transition: "height 0.1s",
                  pointerEvents: "none",
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Drop label — portal into body so it renders above all ReactFlow nodes */}
      {isDropTarget && pendingDrop && (() => {
        const node = getNode(id);
        if (!node) return null;
        void transform; // depend on pan/zoom for re-render
        const slotY = CONTAINER_HEADER_H + slots[pendingDrop.insertIndex] + 4;
        const screen = flowToScreenPosition({ x: node.position.x + CONTAINER_SIDE_PAD, y: node.position.y + slotY });
        return createPortal(
          <div
            style={{
              position: "fixed",
              top: screen.y,
              left: screen.x,
              zIndex: 9999,
              fontSize: 10,
              fontWeight: 700,
              color: "var(--probemap-bg)",
              background: "var(--probemap-blue)",
              padding: "2px 7px",
              borderRadius: 4,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              letterSpacing: "0.02em",
              boxShadow: "0 2px 8px rgba(0,0,0,.2)",
            }}
          >
            ↓ {pendingDrop.nodeLabel}
          </div>,
          document.body,
        );
      })()}
    </>
  );
});

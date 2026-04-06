import { useReactFlow, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useRef, useState } from "react";
import { AllHandles } from "./handles";
import { useContainerDrop } from "../ContainerDropContext";
import { useTrace } from "../TraceContext";
import { useI18n } from "../i18n";

// ── Layout constants (exported for TopologyCanvas) ───────────────────────────
export const CONTAINER_WIDTH    = 256;
export const CONTAINER_INNER_W  = 224; // WIDTH - 2 * SIDE_PAD
export const CONTAINER_SIDE_PAD = 16;
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

/** Absolute Y of slot i within container body (relative to container top). */
export function slotTopInContainer(i: number): number {
  return CONTAINER_HEADER_H + CONTAINER_TOP_PAD + i * (CONTAINER_CARD_H + CONTAINER_CARD_GAP);
}

// ── Data type ────────────────────────────────────────────────────────────────
export interface ContainerNodeData {
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
  const { updateNode, updateNodeData } = useReactFlow();
  const { canEdit } = useTrace();
  const { t } = useI18n();
  const pendingDrop = useContainerDrop();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label || t("defaultContainerLabel"));
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep local label state in sync when data changes externally
  useEffect(() => { setLabel(d.label || t("defaultContainerLabel")); }, [d.label, t]);

  // Sync node size whenever item count changes
  useEffect(() => {
    const h = containerHeight(d.items.length);
    updateNode(id, {
      style: { width: CONTAINER_WIDTH, height: h },
    });
  }, [id, d.items.length, updateNode]);

  const isDropTarget = pendingDrop?.containerId === id;

  // Build slot visual positions (body-relative Y in px)
  const slots: number[] = [];
  if (isDropTarget) {
    for (let i = 0; i <= d.items.length; i++) {
      slots.push(slotTopInContainer(i));
    }
  }

  return (
    <>
      <AllHandles />

      <div className="container-node">
        {/* Header */}
        <div className="container-node__header">
          <div className="container-node__icon">
            {d.icon ?? "📦"}
          </div>
          {editing ? (
            <input
              ref={inputRef}
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                const v = label.trim() || t("defaultContainerLabel");
                setLabel(v);
                updateNodeData(id, { label: v });
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") inputRef.current?.blur();
                if (e.key === "Escape") {
                  setLabel(d.label || t("defaultContainerLabel"));
                  setEditing(false);
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
              onDoubleClick={() => { if (canEdit) setEditing(true); }}
              title={canEdit ? t("doubleClickToEdit") : undefined}
            >
              {label}
            </span>
          )}
          {d.items.length > 0 && (
            <span className="container-node__count">{d.items.length}</span>
          )}
        </div>

        {/* Body area: empty placeholder OR slot overlays during drag-over */}
        <div
          className="container-node__body"
          style={{ minHeight: d.items.length === 0 ? 64 : undefined }}
        >
          {d.items.length === 0 && !isDropTarget && (
            <div className="container-node__empty">
              {t("containerEmpty")}
            </div>
          )}

          {/* Slot overlays — only during drag-over */}
          {isDropTarget && slots.map((topY, i) => (
            <div
              key={i}
              className={[
                "container-node__slot",
                pendingDrop?.insertIndex === i ? "container-node__slot--active" : "",
              ].join(" ")}
              style={{
                position: "absolute",
                top: topY,
                left: CONTAINER_SIDE_PAD,
                width: CONTAINER_INNER_W,
                height: CONTAINER_CARD_H,
              }}
            >
              {pendingDrop?.insertIndex === i && (
                <span className="container-node__slot-label">
                  ↓ {pendingDrop.nodeLabel}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Tooltip on hover */}
        {(d.description || d.path || d.endpoint) && (
          <div className="container-node__tooltip">
            {d.icon && (
              <div className="container-node__tooltip-icon">{d.icon}</div>
            )}
            {d.path && (
              <div className="container-node__tooltip-row">
                <span className="container-node__tooltip-key">{t("tooltipPath")}</span>
                <span className="container-node__tooltip-val">{d.path}</span>
              </div>
            )}
            {d.description && (
              <div className="container-node__tooltip-row">
                <span className="container-node__tooltip-key">{t("tooltipDescription")}</span>
                <span className="container-node__tooltip-val">{d.description}</span>
              </div>
            )}
            {d.endpoint && (
              <div className="container-node__tooltip-row">
                <span className="container-node__tooltip-key">{t("tooltipEndpoint")}</span>
                <span className="container-node__tooltip-val">{d.endpoint}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
});

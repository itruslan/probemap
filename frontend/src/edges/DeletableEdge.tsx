import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { memo, useMemo, useState } from "react";
import { FaPen } from "react-icons/fa6";
import type { LayoutEdgeData } from "../api";
import { useI18n } from "../i18n";
import { TrashIcon } from "../TrashIcon";
import { useEdgeInteraction } from "./edgeInteractionContext";

const ARROW = 7;
/** Distance from handle center to the outer tip of the rotated diamond (8×8px, border-radius 2, rotate 45°). */
const DIAMOND_TIP = 5;
/** Extra px so `getSmoothStepPath` stroke does not anti-alias past the arrow base (V1 / TODO). */
const STROKE_JOIN_PAD = 0.75;

/** Maps protocol string → SVG strokeDasharray (undefined = solid). */
function protocolDash(protocol: string | undefined): string | undefined {
  if (!protocol) return undefined;
  const p = protocol.toLowerCase();
  if (p === "icmp" || p === "ping") return "6 3";
  if (p === "tcp" || p === "udp") return "8 3 2 3";
  return undefined; // http, https, dns, grpc, etc. — solid
}

function arrowPoints(x: number, y: number, pos?: Position): string {
  // Tip is placed at the outer corner of the diamond (DIAMOND_TIP px from handle center).
  // Base is ARROW px further from the node than the tip (same direction as edge approach).
  switch (pos) {
    case Position.Top: {
      const ty = y - DIAMOND_TIP;
      return `${x},${ty} ${x - ARROW / 2},${ty - ARROW} ${x + ARROW / 2},${ty - ARROW}`;
    }
    case Position.Bottom: {
      const ty = y + DIAMOND_TIP;
      return `${x},${ty} ${x - ARROW / 2},${ty + ARROW} ${x + ARROW / 2},${ty + ARROW}`;
    }
    case Position.Left: {
      const tx = x - DIAMOND_TIP;
      return `${tx},${y} ${tx - ARROW},${y - ARROW / 2} ${tx - ARROW},${y + ARROW / 2}`;
    }
    case Position.Right: {
      const tx = x + DIAMOND_TIP;
      return `${tx},${y} ${tx + ARROW},${y - ARROW / 2} ${tx + ARROW},${y + ARROW / 2}`;
    }
    default:
      return `${x},${y - DIAMOND_TIP} ${x},${y - DIAMOND_TIP - ARROW} ${x + ARROW * 0.6},${y - DIAMOND_TIP - ARROW}`;
  }
}

/** Offset the path endpoint so the line stops at the arrowhead base.
 *  Tip is DIAMOND_TIP px outside handle center; base is ARROW further back. */
function pathTarget(x: number, y: number, pos?: Position): [number, number] {
  const total = DIAMOND_TIP + ARROW + STROKE_JOIN_PAD;
  switch (pos) {
    case Position.Top:    return [x, y - total];
    case Position.Bottom: return [x, y + total];
    case Position.Left:   return [x - total, y];
    case Position.Right:  return [x + total, y];
    default:              return [x, y];
  }
}


function summarizeEdge(data: LayoutEdgeData | undefined, noMetaLabel: string): string {
  const d = data ?? {};
  const parts: string[] = [];
  if (d.protocol) parts.push(String(d.protocol));
  if (d.port) parts.push(String(d.port));
  if (d.description) {
    const s = String(d.description).trim();
    parts.push(s.length > 72 ? `${s.slice(0, 69)}…` : s);
  }
  if (parts.length === 0) return noMetaLabel;
  return parts.join(" · ");
}

export const DeletableEdge = memo(function DeletableEdge({
  id,
  data,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
}: EdgeProps<Edge<LayoutEdgeData>>) {
  const [hover, setHover] = useState(false);
  const { deleteElements } = useReactFlow();
  const { t } = useI18n();
  const { openEditor, editable } = useEdgeInteraction();

  const summary = useMemo(() => summarizeEdge(data, t("edgeNoMetadata")), [data, t]);

  const dashArray = protocolDash(data?.protocol);
  const edgeColor = (style?.stroke as string | undefined) ?? "var(--probemap-edge-default)";
  const edgeStyle = dashArray
    ? { ...style, strokeDasharray: dashArray }
    : style;

  const [ptX, ptY] = pathTarget(targetX, targetY, targetPosition);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX: ptX,
    targetY: ptY,
    targetPosition,
    borderRadius: 12,
  });

  const openEdit = () => {
    if (!editable) return;
    openEditor(id);
  };

  return (
    <>
      {/* Invisible wide line for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openEdit();
        }}
      />
      <BaseEdge path={edgePath} style={edgeStyle} />
      {/* Arrowhead drawn as polygon — always 90° to node */}
      <polygon points={arrowPoints(targetX, targetY, targetPosition)} fill={edgeColor} />
      <EdgeLabelRenderer>
        {hover && editable && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: "all",
              maxWidth: 280,
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1.5px solid var(--probemap-border)",
                background: "var(--probemap-bg)",
                boxShadow: "0 4px 14px rgba(15,23,42,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  lineHeight: 1.35,
                  color: "var(--probemap-text)",
                  flex: 1,
                  minWidth: 0,
                  wordBreak: "break-word",
                }}
                title={data?.description && data.description.length > 72 ? data.description : undefined}
              >
                {summary}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  className="probemap-btn probemap-btn--ghost probemap-btn--sm"
                  aria-label={t("edgeEditAria")}
                  title={t("edgeEditAria")}
                  disabled={!editable}
                  style={{ opacity: editable ? 1 : 0.45, cursor: editable ? "pointer" : "not-allowed" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    openEdit();
                  }}
                >
                  <FaPen size={11} />
                </button>
                <button
                  type="button"
                  className="probemap-btn probemap-btn--map-delete probemap-btn--map-delete--md"
                  aria-label={t("delete")}
                  title={t("delete")}
                  disabled={!editable}
                  style={{ opacity: editable ? 1 : 0.45, cursor: editable ? "pointer" : "not-allowed" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!editable) return;
                    deleteElements({ edges: [{ id }] });
                  }}
                >
                  <TrashIcon variantOnRed size={10} />
                </button>
              </div>
            </div>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
});

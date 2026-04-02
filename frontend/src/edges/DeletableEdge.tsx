import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  useReactFlow,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";
import { useMemo, useState } from "react";
import { FaPen } from "react-icons/fa6";
import type { LayoutEdgeData } from "../api";
import { useI18n } from "../i18n";
import { TrashIcon } from "../TrashIcon";
import { useEdgeInteraction } from "./edgeInteractionContext";

const ARROW = 7;

function arrowPoints(x: number, y: number, pos?: Position): string {
  switch (pos) {
    case Position.Top:
      return `${x},${y} ${x - ARROW / 2},${y - ARROW} ${x + ARROW / 2},${y - ARROW}`;
    case Position.Bottom:
      return `${x},${y} ${x - ARROW / 2},${y + ARROW} ${x + ARROW / 2},${y + ARROW}`;
    case Position.Left:
      return `${x},${y} ${x - ARROW},${y - ARROW / 2} ${x - ARROW},${y + ARROW / 2}`;
    case Position.Right:
      return `${x},${y} ${x + ARROW},${y - ARROW / 2} ${x + ARROW},${y + ARROW / 2}`;
    default:
      return `${x},${y} ${x},${y - ARROW} ${x + ARROW * 0.6},${y}`;
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

export function DeletableEdge({
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

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
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
      <BaseEdge path={edgePath} style={style} />
      {/* Arrowhead drawn as polygon — always 90° to node */}
      <polygon points={arrowPoints(targetX, targetY, targetPosition)} fill="#b1b1b7" />
      <EdgeLabelRenderer>
        {hover && (
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
}

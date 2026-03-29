import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useState } from "react";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  markerEnd,
  style,
}: EdgeProps) {
  const [hover, setHover] = useState(false);
  const { deleteElements } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <defs>
        <marker id="pm-arrow" markerWidth="6" markerHeight="10" refX="5.5" refY="5" orient="auto">
          <path d="M0,0 L0,10 L6,5 z" fill="#b1b1b7" />
        </marker>
      </defs>
      {/* Невидимая широкая линия для удобного hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <BaseEdge path={edgePath} markerEnd="url(#pm-arrow)" style={style} />
      <EdgeLabelRenderer>
        {hover && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            <button
              onClick={() => deleteElements({ edges: [{ id }] })}
              style={{
                width: 18,
                height: 18,
                borderRadius: "50%",
                border: "none",
                background: "#ef4444",
                color: "#fff",
                fontSize: 11,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                boxShadow: "0 1px 3px rgba(0,0,0,.3)",
              }}
            >
              ×
            </button>
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

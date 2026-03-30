import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  Position,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { useState } from "react";

const ARROW = 7;

function arrowPoints(x: number, y: number, pos?: Position): string {
  switch (pos) {
    case Position.Top:    return `${x},${y} ${x - ARROW / 2},${y - ARROW} ${x + ARROW / 2},${y - ARROW}`;
    case Position.Bottom: return `${x},${y} ${x - ARROW / 2},${y + ARROW} ${x + ARROW / 2},${y + ARROW}`;
    case Position.Left:   return `${x},${y} ${x - ARROW},${y - ARROW / 2} ${x - ARROW},${y + ARROW / 2}`;
    case Position.Right:  return `${x},${y} ${x + ARROW},${y - ARROW / 2} ${x + ARROW},${y + ARROW / 2}`;
    default:              return `${x},${y} ${x},${y - ARROW} ${x + ARROW * 0.6},${y}`;
  }
}

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
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
      {/* Invisible wide line for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      />
      <BaseEdge path={edgePath} style={style} />
      {/* Arrowhead drawn as polygon — always 90° to node */}
      <polygon
        points={arrowPoints(targetX, targetY, targetPosition)}
        fill="#b1b1b7"
      />
      <EdgeLabelRenderer>
        {hover && (
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
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

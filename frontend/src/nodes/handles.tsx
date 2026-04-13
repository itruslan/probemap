import { Handle, Position } from "@xyflow/react";

const STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  background: "var(--probemap-blue)",
  border: "1.5px solid var(--probemap-bg)",
  opacity: 0,
  transition: "opacity 0.15s, background 0.15s, width 0.15s, height 0.15s",
};

export function AllHandles() {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="top"    style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Right}  id="right"  style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Bottom} id="bottom" style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Left}   id="left"   style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="target" position={Position.Top}    id="top"    style={{ ...STYLE, opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Right}  id="right"  style={{ ...STYLE, opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={{ ...STYLE, opacity: 0, pointerEvents: "none" }} />
      <Handle type="target" position={Position.Left}   id="left"   style={{ ...STYLE, opacity: 0, pointerEvents: "none" }} />
    </>
  );
}

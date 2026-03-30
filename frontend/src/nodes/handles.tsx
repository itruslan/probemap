import { Handle, Position } from "@xyflow/react";

const STYLE: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "#94a3b8",
  border: "2px solid #fff",
  opacity: 0,
  transition: "opacity 0.15s",
};

export function AllHandles() {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="top"    style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Right}  id="right"  style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Bottom} id="bottom" style={STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Left}   id="left"   style={STYLE} className="react-flow__handle-visibility" />
    </>
  );
}

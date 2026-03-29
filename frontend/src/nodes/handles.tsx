import { Handle, Position } from "@xyflow/react";

const STYLE = {
  width: 8,
  height: 8,
  background: "#94a3b8",
  border: "2px solid #fff",
};

export function AllHandles() {
  return (
    <>
      <Handle type="source" position={Position.Top}    id="top"    style={STYLE} />
      <Handle type="source" position={Position.Right}  id="right"  style={STYLE} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={STYLE} />
      <Handle type="source" position={Position.Left}   id="left"   style={STYLE} />
    </>
  );
}

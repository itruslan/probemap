import { useReactFlow, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { IconRenderer } from "../IconRenderer";
import { AllHandles } from "./handles";
import { IconPicker } from "../IconPicker";
import { useColliding } from "../CollisionContext";

export interface CustomNodeData {
  label: string;
  kind: string;
  icon?: string;
}

export function CustomNode({ data, id }: NodeProps) {
  const d = data as unknown as CustomNodeData;
  const { updateNodeData } = useReactFlow();

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const colliding = useColliding(id);


  const commitLabel = (val: string) => {
    updateNodeData(id, { label: val });
    setEditing(false);
  };

  const openPicker = (e: React.MouseEvent) => {
    setPickerAnchor({ x: e.clientX + 8, y: e.clientY });
  };

  return (
    <div
      style={{
        background: "#fff",
        border: "1.5px dashed #94a3b8",
        borderRadius: 8,
        padding: "8px 12px",
        minWidth: 120,
        boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        position: "relative",
        outline: colliding ? "2px solid #f97316" : undefined,
        transition: "outline 0.1s",
      }}
    >
      {colliding && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 8,
          background: "rgba(249,115,22,0.15)", pointerEvents: "none", zIndex: 10,
        }} />
      )}
      <AllHandles />

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={openPicker}
          title="Сменить иконку"
          style={{
            background: "none", border: "none", padding: 0,
            cursor: "pointer", color: "#64748b", display: "flex",
            borderRadius: 4, flexShrink: 0,
          }}
        >
          <IconRenderer name={d.icon} size={14} />
        </button>

        {editing ? (
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => commitLabel(label)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitLabel(label);
              if (e.key === "Escape") { setLabel(d.label); setEditing(false); }
            }}
            style={{
              flex: 1, border: "none", borderBottom: "1.5px solid #94a3b8",
              background: "transparent", outline: "none",
              fontSize: 13, fontWeight: 600, color: "#0f172a",
            }}
          />
        ) : (
          <span
            onDoubleClick={() => { setLabel(d.label); setEditing(true); }}
            style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#0f172a", cursor: "text", userSelect: "none" }}
          >
            {d.label || <span style={{ color: "#94a3b8", fontWeight: 400 }}>Объект</span>}
          </span>
        )}

      </div>

      {pickerAnchor && (
        <IconPicker
          anchorX={pickerAnchor.x}
          anchorY={pickerAnchor.y}
          onSelect={(name) => { updateNodeData(id, { icon: name }); setPickerAnchor(null); }}
          onClose={() => setPickerAnchor(null)}
        />
      )}
    </div>
  );
}

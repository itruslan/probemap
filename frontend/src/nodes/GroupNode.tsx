import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { IconRenderer } from "../IconRenderer";
import { IconPicker } from "../IconPicker";

export interface GroupNodeData {
  label: string;
  color?: string;
  icon?: string;
}

const COLORS = [
  { bg: "rgba(241,245,249,0.6)", border: "#cbd5e1", label: "#64748b" },   // серый (default)
  { bg: "rgba(219,234,254,0.6)", border: "#93c5fd", label: "#1d4ed8" },   // синий
  { bg: "rgba(220,252,231,0.6)", border: "#86efac", label: "#15803d" },   // зелёный
  { bg: "rgba(254,243,199,0.6)", border: "#fcd34d", label: "#b45309" },   // жёлтый
  { bg: "rgba(252,231,243,0.6)", border: "#f9a8d4", label: "#9d174d" },   // розовый
  { bg: "rgba(237,233,254,0.6)", border: "#c4b5fd", label: "#6d28d9" },   // фиолетовый
];

export function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const { setNodes, getNodes, updateNodeData } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label || "Область");
  const [colorIdx, setColorIdx] = useState(() => {
    if (!d.color) return 0;
    const i = COLORS.findIndex((c) => c.bg === d.color);
    return i >= 0 ? i : 0;
  });
  const [showColors, setShowColors] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);


  const openPicker = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPickerAnchor({ x: e.clientX + 8, y: e.clientY });
  };

  const color = COLORS[colorIdx];

  const shiftZ = (delta: number) => {
    const allNodes = getNodes();
    const groups = allNodes
      .filter((n) => n.type === "group")
      .sort((a, b) => {
        const za = (a.style?.zIndex as number) ?? -1;
        const zb = (b.style?.zIndex as number) ?? -1;
        if (za !== zb) return za - zb;
        return a.id.localeCompare(b.id);
      });

    const curIdx = groups.findIndex((n) => n.id === id);
    const targetIdx = curIdx + delta;
    if (targetIdx < 0 || targetIdx >= groups.length) return;

    // Move current group to target position, shift others
    const reordered = [...groups];
    const [moved] = reordered.splice(curIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    // Reassign z-indices: all negative, ordered from back to front
    const zMap = new Map<string, number>();
    reordered.forEach((g, i) => zMap.set(g.id, -(reordered.length - i)));

    setNodes((nds) =>
      nds.map((n) => {
        const newZ = zMap.get(n.id);
        if (newZ !== undefined) return { ...n, style: { ...n.style, zIndex: newZ } };
        return n;
      })
    );
  };

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        lineStyle={{ borderColor: color.border }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: color.border }}
      />
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 10,
          border: `2px solid ${color.border}`,
          background: color.bg,
          backdropFilter: "blur(2px)",
          boxSizing: "border-box",
          position: "relative",
        }}
        onMouseEnter={() => setShowColors(true)}
        onMouseLeave={() => setShowColors(false)}
      >
        {/* Заголовок */}
        <div
          style={{
            position: "absolute", top: 4, left: 8,
            display: "flex", alignItems: "center", gap: 4,
            maxWidth: "calc(100% - 160px)",
          }}
        >
          {/* Иконка — кнопка для выбора */}
          <button
            onClick={openPicker}
            title={d.icon ? "Сменить иконку" : "Добавить иконку"}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              border: d.icon ? "none" : `1px dashed ${color.border}`,
              background: "transparent", cursor: "pointer", padding: 0,
              color: color.label,
            }}
          >
            {d.icon ? <IconRenderer name={d.icon} size={13} /> : <span style={{ fontSize: 10, lineHeight: 1 }}>+</span>}
          </button>

          {/* Название */}
          {editing ? (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => { d.label = label; setEditing(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { d.label = label; setEditing(false); } }}
              style={{
                background: "transparent", border: "none",
                borderBottom: `1.5px solid ${color.border}`,
                outline: "none", fontSize: 12, fontWeight: 600,
                color: color.label, width: 100,
              }}
            />
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              style={{ fontSize: 12, fontWeight: 600, color: color.label, cursor: "text", userSelect: "none" }}
            >
              {label}
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

        {/* Цветовые пресеты + кнопки слоёв */}
        {showColors && (
          <div
            style={{
              position: "absolute", top: 4, right: 6,
              display: "flex", gap: 4, alignItems: "center",
            }}
          >
            {COLORS.map((c, i) => (
              <div
                key={i}
                onClick={() => { setColorIdx(i); d.color = c.bg; }}
                style={{
                  width: 14, height: 14, borderRadius: "50%",
                  background: c.bg, border: `2px solid ${c.border}`,
                  cursor: "pointer",
                  outline: i === colorIdx ? `2px solid ${c.border}` : "none",
                  outlineOffset: 1,
                }}
              />
            ))}
            <div style={{ width: 1, height: 14, background: color.border, margin: "0 2px" }} />
            <button
              onClick={() => shiftZ(-1)}
              title="На слой назад"
              style={{
                height: 18, borderRadius: 4, border: `1px solid ${color.border}`,
                background: "rgba(255,255,255,0.8)", cursor: "pointer",
                fontSize: 9, lineHeight: 1, display: "flex", alignItems: "center",
                justifyContent: "center", padding: "0 4px", color: color.label,
              }}
            >
              back
            </button>
            <button
              onClick={() => shiftZ(1)}
              title="На слой вперёд"
              style={{
                height: 18, borderRadius: 4, border: `1px solid ${color.border}`,
                background: "rgba(255,255,255,0.8)", cursor: "pointer",
                fontSize: 9, lineHeight: 1, display: "flex", alignItems: "center",
                justifyContent: "center", padding: "0 4px", color: color.label,
              }}
            >
              front
            </button>
          </div>
        )}
      </div>
    </>
  );
}

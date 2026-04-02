import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { useI18n } from "../i18n";

export interface GroupNodeData {
  label: string;
  color?: string;
}

// Полупрозрачные цвета — акцент на рамке, не на заливке
const COLORS = [
  { bg: "rgba(241,245,249,0.22)", border: "#cbd5e1" }, // серый
  { bg: "rgba(219,234,254,0.22)", border: "#93c5fd" }, // синий
  { bg: "rgba(220,252,231,0.22)", border: "#86efac" }, // зелёный
  { bg: "rgba(254,243,199,0.22)", border: "#fcd34d" }, // жёлтый
  { bg: "rgba(252,231,243,0.22)", border: "#f9a8d4" }, // розовый
  { bg: "rgba(237,233,254,0.22)", border: "#c4b5fd" }, // фиолетовый
];

export function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const { setNodes, getNodes } = useReactFlow();
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label || t("defaultGroupLabel"));
  const [colorIdx, setColorIdx] = useState(() => {
    if (!d.color) return 0;
    const i = COLORS.findIndex((c) => c.bg === d.color);
    return i >= 0 ? i : 0;
  });
  const [showChrome, setShowChrome] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layerHint, setLayerHint] = useState<"back" | "front" | null>(null);

  const hasColor = !!d.color;
  const color = hasColor
    ? COLORS[colorIdx]
    : {
        bg: "transparent",
        border: "var(--probemap-border-strong)",
      };
  const labelColor = hasColor ? "var(--probemap-text)" : "var(--probemap-text-muted)";

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

    const reordered = [...groups];
    const [moved] = reordered.splice(curIdx, 1);
    reordered.splice(targetIdx, 0, moved);

    const zMap = new Map<string, number>();
    reordered.forEach((g, i) => zMap.set(g.id, -(reordered.length - i)));

    setNodes((nds) =>
      nds.map((n) => {
        const newZ = zMap.get(n.id);
        if (newZ !== undefined) return { ...n, style: { ...n.style, zIndex: newZ } };
        return n;
      }),
    );
  };

  const layerOrder = (() => {
    const groups = getNodes()
      .filter((n) => n.type === "group")
      .sort((a, b) => {
        const za = (a.style?.zIndex as number) ?? -1;
        const zb = (b.style?.zIndex as number) ?? -1;
        if (za !== zb) return za - zb;
        return a.id.localeCompare(b.id);
      });
    const idx = groups.findIndex((n) => n.id === id);
    return { idx, total: groups.length };
  })();

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
        onMouseEnter={() => setShowChrome(true)}
        onMouseLeave={() => {
          setShowChrome(false);
          setPaletteOpen(false);
          setLayerHint(null);
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 4,
            left: 8,
            display: "flex",
            alignItems: "center",
            maxWidth: "calc(100% - 160px)",
          }}
        >
          {/* Общая кнопка выбора цвета области */}
          <button
            type="button"
            onClick={() => setPaletteOpen((v) => !v)}
            title={t("groupColor")}
            className="probemap-btn probemap-btn--icon-tiny"
            style={{ marginRight: 6 }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: hasColor ? color.bg : "transparent",
                border: hasColor ? `1px solid ${color.border}` : "1px solid var(--probemap-border-strong)",
              }}
            />
          </button>
          {editing ? (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                d.label = label;
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  d.label = label;
                  setEditing(false);
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `1.5px solid ${color.border}`,
                outline: "none",
                fontSize: 12,
                fontWeight: 600,
                color: labelColor,
                width: "min(100%, 220px)",
              }}
            />
          ) : (
            <span
              onDoubleClick={() => setEditing(true)}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: labelColor,
                cursor: "text",
                userSelect: "none",
              }}
            >
              {label}
            </span>
          )}
        </div>

        {showChrome && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              display: "flex",
              gap: 4,
              alignItems: "center",
            }}
          >
            {/* Кнопки изменения слоя */}
            <button
              type="button"
              onClick={() => shiftZ(-1)}
              title={t("layerBack")}
              onMouseEnter={() => setLayerHint("back")}
              onMouseLeave={() => setLayerHint(null)}
              className="probemap-btn probemap-btn--icon-tiny"
              style={{ color: labelColor }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: `7px solid ${labelColor}`,
                }}
              />
            </button>
            <button
              type="button"
              onClick={() => shiftZ(1)}
              title={t("layerForward")}
              onMouseEnter={() => setLayerHint("front")}
              onMouseLeave={() => setLayerHint(null)}
              className="probemap-btn probemap-btn--icon-tiny"
              style={{ color: labelColor }}
            >
              <span
                aria-hidden
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderBottom: `7px solid ${labelColor}`,
                }}
              />
            </button>
          </div>
        )}

        {/* Палитра цветов, открывается из общей кнопки в левом верхнем углу */}
        {paletteOpen && (
          <div
            style={{
              position: "absolute",
              top: 28,
              left: 8,
              display: "flex",
              gap: 6,
              padding: "4px 6px",
              borderRadius: 8,
              background: "var(--probemap-bg)",
              boxShadow: "0 4px 18px rgba(15,23,42,0.24)",
              border: "1px solid var(--probemap-border)",
              zIndex: 10,
            }}
          >
            {COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setColorIdx(i);
                  d.color = c.bg;
                  setPaletteOpen(false);
                }}
                className="probemap-btn probemap-btn--color-swatch"
                style={{
                  border: `2px solid ${c.border}`,
                  background: c.bg,
                  outline: i === colorIdx ? `2px solid ${c.border}` : "none",
                  outlineOffset: 1,
                }}
                aria-label={t("groupColor")}
              />
            ))}
          </div>
        )}

        {/* Подпись к кнопкам слоёв — текст из i18n, в зависимости от языка */}
        {layerHint === "back" && (
          <div
            style={{
              position: "absolute",
              top: 26,
              right: 6,
              padding: "3px 6px",
              borderRadius: 6,
              background: "rgba(15,23,42,0.9)",
              color: "var(--probemap-tooltip-text)",
              fontSize: 10,
              lineHeight: 1.3,
              maxWidth: 180,
              boxShadow: "0 4px 14px rgba(15,23,42,0.5)",
              pointerEvents: "none",
            }}
          >
            {t("layerBack")}
          </div>
        )}
        {layerHint === "front" && (
          <div
            style={{
              position: "absolute",
              top: 26,
              right: 6,
              padding: "3px 6px",
              borderRadius: 6,
              background: "rgba(15,23,42,0.9)",
              color: "var(--probemap-tooltip-text)",
              fontSize: 10,
              lineHeight: 1.3,
              maxWidth: 190,
              boxShadow: "0 4px 14px rgba(15,23,42,0.5)",
              pointerEvents: "none",
            }}
          >
            {t("layerForward")}
          </div>
        )}

        {layerHint && (
          <div
            style={{
              position: "absolute",
              top: 4,
              right: 50,
              padding: "2px 6px",
              borderRadius: 999,
              background: "var(--probemap-bg)",
              border: "1px solid var(--probemap-border)",
              color: labelColor,
              fontSize: 10,
              lineHeight: 1.2,
              fontVariantNumeric: "tabular-nums",
              userSelect: "none",
              boxShadow: "0 4px 14px rgba(15,23,42,0.14)",
              pointerEvents: "none",
            }}
          >
            {t("layerOrder")
              .replace("{n}", layerOrder.idx >= 0 ? String(layerOrder.idx + 1) : "—")
              .replace("{total}", String(layerOrder.total))}
          </div>
        )}
      </div>
    </>
  );
}

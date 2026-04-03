import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { IconRenderer } from "../IconRenderer";
import { getGroupKindDef } from "../nodeKinds";
import { useServices } from "../ServicesContext";

/** Иначе React Flow перехватывает mousedown — начинается drag/selection, срабатывает mouseleave и палитра схлопывается. */
function stopFlowPointer(e: React.MouseEvent | React.PointerEvent) {
  e.stopPropagation();
}

export interface GroupNodeData {
  label: string;
  color?: string; // hex (#rrggbb) or empty/undefined = no color
  kind?: string;  // GROUP_KINDS key, e.g. "vm", "postgres-cluster"
  /** Для cluster-групп: лейбл и значение для авто-импорта нод по совпадению */
  clusterLabel?: string;
  clusterValue?: string;
}

// Пресеты: храним hex — bg/border выводятся динамически
const PRESETS = [
  { hex: "#cbd5e1" }, // серый
  { hex: "#93c5fd" }, // синий
  { hex: "#86efac" }, // зелёный
  { hex: "#fcd34d" }, // жёлтый
  { hex: "#f9a8d4" }, // розовый
  { hex: "#c4b5fd" }, // фиолетовый
];

// Легаси: старые раскладки хранили rgba-строку bg — мигрируем обратно в hex
const LEGACY_BG_TO_HEX: Record<string, string> = {
  "rgba(241,245,249,0.22)": "#cbd5e1",
  "rgba(219,234,254,0.22)": "#93c5fd",
  "rgba(220,252,231,0.22)": "#86efac",
  "rgba(254,243,199,0.22)": "#fcd34d",
  "rgba(252,231,243,0.22)": "#f9a8d4",
  "rgba(237,233,254,0.22)": "#c4b5fd",
};

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function resolveHex(raw: string | undefined): string {
  if (!raw) return "";
  if (raw.startsWith("#")) return raw;
  return LEGACY_BG_TO_HEX[raw] ?? "";
}

function colorFromHex(hex: string): { bg: string; border: string } {
  return { bg: hexToRgba(hex, 0.22), border: hex };
}

const HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: 999,
  background: "var(--probemap-interactive-hover-border)",
  border: "2px solid var(--probemap-bg)",
  opacity: 0,
  transition: "opacity 0.15s ease",
  zIndex: 10, // выше child-нод внутри группы
};

export function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const { setNodes, getNodes } = useReactFlow();
  const { t } = useI18n();
  const services = useServices();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label || t("defaultGroupLabel"));
  const [colorHex, setColorHex] = useState(() => resolveHex(d.color));
  const [showChrome, setShowChrome] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [localLabel, setLocalLabel] = useState(d.clusterLabel ?? "");
  const [localValue, setLocalValue] = useState(d.clusterValue ?? "");
  const [importResult, setImportResult] = useState<number | null>(null);
  const [layerHint, setLayerHint] = useState<"back" | "front" | null>(null);
  const chromeLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const importBtnRef = useRef<HTMLButtonElement>(null);
  const importRef = useRef<HTMLDivElement>(null);

  const kindDef = getGroupKindDef(d.kind);
  const hasHandles = kindDef?.hasHandles ?? false;

  const allLabelKeys = useMemo(() => {
    if (!hasHandles) return [];
    const keys = new Set<string>();
    for (const svc of services) {
      if (svc.labels) Object.keys(svc.labels).forEach((k) => keys.add(k));
    }
    return [...keys].sort();
  }, [services, hasHandles]);

  const clearChromeLeaveTimer = () => {
    if (chromeLeaveTimerRef.current) {
      clearTimeout(chromeLeaveTimerRef.current);
      chromeLeaveTimerRef.current = null;
    }
  };

  useEffect(() => () => clearChromeLeaveTimer(), []);

  // Закрывать палитру по клику вне неё
  useEffect(() => {
    if (!paletteOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        paletteRef.current?.contains(e.target as Node) ||
        colorBtnRef.current?.contains(e.target as Node)
      ) return;
      setPaletteOpen(false);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [paletteOpen]);

  // Закрывать попап импорта по клику вне него
  useEffect(() => {
    if (!importOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        importRef.current?.contains(e.target as Node) ||
        importBtnRef.current?.contains(e.target as Node)
      ) return;
      setImportOpen(false);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [importOpen]);

  const handleImport = () => {
    if (!localLabel || !localValue) return;
    d.clusterLabel = localLabel;
    d.clusterValue = localValue;

    const currentIds = new Set(getNodes().map((n) => n.id));
    const matching = services.filter(
      (svc) => svc.labels?.[localLabel] === localValue && !currentIds.has(svc.id),
    );

    setImportResult(matching.length);
    if (matching.length === 0) return;

    setNodes((nds) => {
      const existingIds = new Set(nds.map((n) => n.id));
      const toAdd = matching.filter((svc) => !existingIds.has(svc.id));
      return [
        ...nds,
        ...toAdd.map((svc, i) => ({
          id: svc.id,
          type: "service" as const,
          parentId: id,
          position: { x: 10 + (i % 2) * 150, y: 32 + Math.floor(i / 2) * 90 },
          data: {
            label: svc.name,
            ports: svc.ports,
            kind: svc.kind ?? "service",
            matchServiceId: null as string | null,
          },
        })),
      ];
    });
    setImportOpen(false);
  };

  const color = colorHex
    ? colorFromHex(colorHex)
    : { bg: "transparent", border: "var(--probemap-border-strong)" };
  const labelColor = colorHex ? "var(--probemap-text)" : "var(--probemap-text-muted)";

  const applyColor = (hex: string) => {
    setColorHex(hex);
    d.color = hex || undefined;
    setPaletteOpen(false);
  };

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
        lineStyle={{ borderColor: color.border, borderWidth: 1 }}
        handleStyle={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: colorHex ? hexToRgba(colorHex, 0.5) : "rgba(148,163,184,0.5)",
          border: "1px solid rgba(255,255,255,0.8)",
        }}
      />

      {/* Handles для кластеров с внешними соединениями */}
      {hasHandles && (
        <>
          <Handle type="source" position={Position.Top}    id="top"    style={HANDLE_STYLE} className="react-flow__handle-visibility" />
          <Handle type="source" position={Position.Right}  id="right"  style={HANDLE_STYLE} className="react-flow__handle-visibility" />
          <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} className="react-flow__handle-visibility" />
          <Handle type="source" position={Position.Left}   id="left"   style={HANDLE_STYLE} className="react-flow__handle-visibility" />
        </>
      )}

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
        onMouseEnter={() => {
          clearChromeLeaveTimer();
          setShowChrome(true);
        }}
        onMouseLeave={() => {
          clearChromeLeaveTimer();
          chromeLeaveTimerRef.current = setTimeout(() => {
            setShowChrome(false);
            setLayerHint(null);
            chromeLeaveTimerRef.current = null;
          }, 220);
        }}
      >
        <div
          onPointerDown={stopFlowPointer}
          onMouseDown={stopFlowPointer}
          style={{
            position: "absolute",
            top: 4,
            left: 8,
            display: "flex",
            alignItems: "center",
            gap: 4,
            maxWidth: "calc(100% - 160px)",
          }}
        >
          {/* Иконка вида группы */}
          {kindDef && (
            <span style={{ color: labelColor, opacity: 0.7, flexShrink: 0, lineHeight: 0 }}>
              <IconRenderer name={kindDef.icon} size={11} />
            </span>
          )}

          {/* Кнопка открытия палитры цветов */}
          <button
            ref={colorBtnRef}
            type="button"
            onClick={() => setPaletteOpen((v) => !v)}
            onPointerDown={stopFlowPointer}
            onMouseDown={stopFlowPointer}
            title={t("groupColor")}
            className="probemap-btn probemap-btn--icon-tiny"
            style={{ marginRight: 2 }}
          >
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: colorHex ? color.bg : "transparent",
                border: colorHex ? `1px solid ${color.border}` : "1px dashed var(--probemap-text-faint)",
                opacity: colorHex ? 1 : 0.5,
              }}
            />
          </button>

          {/* Editable label */}
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
            onPointerDown={stopFlowPointer}
            onMouseDown={stopFlowPointer}
            style={{
              position: "absolute",
              top: 4,
              right: 6,
              display: "flex",
              gap: 4,
              alignItems: "center",
            }}
          >
            {/* Кнопка импорта нод — только для cluster-групп */}
            {hasHandles && (
              <button
                ref={importBtnRef}
                type="button"
                onClick={() => { setImportOpen((v) => !v); setImportResult(null); }}
                title={t("clusterImportOpen")}
                onPointerDown={stopFlowPointer}
                onMouseDown={stopFlowPointer}
                className="probemap-btn probemap-btn--icon-tiny"
                style={{ color: labelColor, fontSize: 11, fontWeight: 700, lineHeight: 1, padding: "0 2px" }}
              >
                ↓+
              </button>
            )}
            <button
              type="button"
              onClick={() => shiftZ(-1)}
              title={t("layerBack")}
              onPointerDown={stopFlowPointer}
              onMouseDown={stopFlowPointer}
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
              onPointerDown={stopFlowPointer}
              onMouseDown={stopFlowPointer}
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

        {/* Палитра цветов */}
        {paletteOpen && (
          <div
            ref={paletteRef}
            onPointerDown={stopFlowPointer}
            onMouseDown={stopFlowPointer}
            style={{
              position: "absolute",
              top: 28,
              left: 8,
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 8px",
              borderRadius: 8,
              background: "var(--probemap-bg)",
              boxShadow: "0 4px 18px rgba(15,23,42,0.24)",
              border: "1px solid var(--probemap-border)",
              zIndex: 10,
            }}
          >
            {PRESETS.map((p) => (
              <button
                key={p.hex}
                type="button"
                onClick={() => applyColor(p.hex)}
                className="probemap-btn probemap-btn--color-swatch"
                style={{
                  border: `2px solid ${p.hex}`,
                  background: hexToRgba(p.hex, 0.22),
                  outline: colorHex === p.hex ? `2px solid ${p.hex}` : "none",
                  outlineOffset: 1,
                }}
                aria-label={p.hex}
              />
            ))}

            <div style={{ width: 1, height: 16, background: "var(--probemap-border)", flexShrink: 0 }} />

            <div style={{ position: "relative", flexShrink: 0 }}>
              <label
                title={t("groupColorCustom")}
                style={{ cursor: "pointer", display: "block" }}
              >
                <span
                  className="probemap-btn probemap-btn--color-swatch"
                  style={{
                    display: "block",
                    borderRadius: 999,
                    border: colorHex && !PRESETS.some((p) => p.hex === colorHex)
                      ? `2px solid ${colorHex}`
                      : "2px solid var(--probemap-border-strong)",
                    background: colorHex && !PRESETS.some((p) => p.hex === colorHex)
                      ? hexToRgba(colorHex, 0.22)
                      : "conic-gradient(#ef4444, #f97316, #fcd34d, #22c55e, #3b82f6, #8b5cf6, #ef4444)",
                    outline: colorHex && !PRESETS.some((p) => p.hex === colorHex)
                      ? `2px solid ${colorHex}`
                      : "none",
                    outlineOffset: 1,
                  }}
                  aria-label={t("groupColorCustom")}
                />
                <input
                  type="color"
                  value={colorHex && colorHex.startsWith("#") ? colorHex : "#6366f1"}
                  onChange={(e) => {
                    setColorHex(e.target.value);
                    d.color = e.target.value;
                  }}
                  style={{
                    position: "absolute",
                    opacity: 0,
                    width: 1,
                    height: 1,
                    top: 0,
                    left: 0,
                  }}
                  tabIndex={-1}
                />
              </label>
            </div>

            {colorHex && (
              <>
                <div style={{ width: 1, height: 16, background: "var(--probemap-border)", flexShrink: 0 }} />
                <button
                  type="button"
                  onClick={() => applyColor("")}
                  title={t("groupColorReset")}
                  className="probemap-btn probemap-btn--color-swatch"
                  style={{
                    borderRadius: 999,
                    border: "2px dashed var(--probemap-text-faint)",
                    background: "transparent",
                  }}
                  aria-label={t("groupColorReset")}
                />
              </>
            )}
          </div>
        )}

        {/* Попап импорта нод по лейблу */}
        {importOpen && hasHandles && (
          <div
            ref={importRef}
            onPointerDown={stopFlowPointer}
            onMouseDown={stopFlowPointer}
            style={{
              position: "absolute",
              top: 28,
              right: 6,
              minWidth: 220,
              padding: "10px 12px",
              borderRadius: 8,
              background: "var(--probemap-bg)",
              boxShadow: "0 4px 18px rgba(15,23,42,0.24)",
              border: "1px solid var(--probemap-border)",
              zIndex: 10,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "var(--probemap-text-muted)", fontWeight: 600 }}>
                {t("clusterImportLabel")}
              </label>
              <select
                value={localLabel}
                onChange={(e) => { setLocalLabel(e.target.value); setImportResult(null); }}
                style={{
                  fontSize: 11,
                  padding: "3px 6px",
                  borderRadius: 5,
                  border: "1px solid var(--probemap-border-strong)",
                  background: "var(--probemap-input-bg)",
                  color: "var(--probemap-text)",
                  width: "100%",
                }}
              >
                <option value="">—</option>
                {allLabelKeys.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: 10, color: "var(--probemap-text-muted)", fontWeight: 600 }}>
                {t("clusterImportValue")}
              </label>
              <input
                type="text"
                value={localValue}
                onChange={(e) => { setLocalValue(e.target.value); setImportResult(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                placeholder="postgres-prod"
                style={{
                  fontSize: 11,
                  padding: "3px 6px",
                  borderRadius: 5,
                  border: "1px solid var(--probemap-border-strong)",
                  background: "var(--probemap-input-bg)",
                  color: "var(--probemap-text)",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={!localLabel || !localValue}
              className="probemap-btn"
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 5,
                background: "var(--probemap-interactive-hover-border)",
                color: "#fff",
                border: "none",
                cursor: !localLabel || !localValue ? "not-allowed" : "pointer",
                opacity: !localLabel || !localValue ? 0.5 : 1,
                alignSelf: "flex-end",
              }}
            >
              {t("clusterImportBtn")}
            </button>
            {importResult !== null && (
              <div style={{ fontSize: 10, color: importResult === 0 ? "var(--probemap-text-muted)" : "var(--probemap-status-ok)", fontWeight: 600 }}>
                {importResult === 0
                  ? t("clusterImportNoMatch")
                  : t("clusterImportAdded").replace("{n}", String(importResult))}
              </div>
            )}
          </div>
        )}

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

import { Handle, NodeResizer, Position, useReactFlow, type NodeProps } from "@xyflow/react";
import { createPortal } from "react-dom";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { fetchIcons, type CustomIcon } from "../api";
import { IconRenderer } from "../IconRenderer";
import {
  ALL_ICONS,
  DEFAULT_GROUP_ICON_NAME,
} from "../icons";
import { useI18n } from "../i18n";
import { useTrace } from "../TraceContext";
import { useIsDraggingOnCanvas } from "../DragContext";
import { DeleteButton } from "./DeleteButton";

/** Иначе React Flow перехватывает mousedown — начинается drag/selection, срабатывает mouseleave и палитра схлопывается. */
function stopFlowPointer(e: React.MouseEvent | React.PointerEvent) {
  e.stopPropagation();
}

export interface GroupNodeData extends Record<string, unknown> {
  label: string;
  color?: string; // hex (#rrggbb) or empty/undefined = no color
  /** Имя иконки из `icons.ts` или `custom:id` */
  icon?: string;
  endpoint?: string | null;
  description?: string;
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
  background: "var(--probemap-blue)",
  border: "1.5px solid var(--probemap-bg)",
  opacity: 0,
  transition: "opacity 0.15s, background 0.15s, width 0.15s, height 0.15s",
  zIndex: 10, // выше child-нод внутри группы
};


export const GroupNode = memo(function GroupNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as GroupNodeData;
  const { setNodes, getNodes, updateNodeData } = useReactFlow();
  const { t } = useI18n();
  const { canEdit } = useTrace();
  const dragging = useIsDraggingOnCanvas();

  const nodeRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [locked, setLocked] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editingIcon, setEditingIcon] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState(false);
  const [endpointDraft, setEndpointDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(d.label || t("defaultGroupLabel"));
  const [colorHex, setColorHex] = useState(() => resolveHex(d.color));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layerHint, setLayerHint] = useState<"back" | "front" | null>(null);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  /** Редактирование активно только когда нода выбрана и пользователь — администратор */
  const isEditMode = !!selected && canEdit;
  /** Viewer-выделение: нода выбрана, но редактирование недоступно */
  const isViewerSelected = !!selected && !canEdit;

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

  useEffect(() => {
    setLabel(d.label || t("defaultGroupLabel"));
    setColorHex(resolveHex(d.color));
  }, [d.label, d.color, t]);

  useEffect(() => {
    if (!dragging) return;
    setLocked(false);
    setVisible(false);
    setEditingIcon(false);
    setEditingEndpoint(false);
    setEditingDesc(false);
  }, [dragging]);

  useEffect(() => {
    if (!editingIcon) return;
    void fetchIcons().then(setCustomIcons).catch(() => {});
  }, [editingIcon]);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (locked) {
        setLocked(false);
        setVisible(false);
        setEditingIcon(false);
        setEditingEndpoint(false);
        setEditingDesc(false);
      } else {
        setLocked(true);
        setVisible(true);
      }
    },
    [locked],
  );

  useEffect(() => {
    if (!locked) return;
    const onMouse = (e: MouseEvent) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      if (e.target instanceof Node && nodeRef.current?.contains(e.target)) return;
      if (
        e.target instanceof Element &&
        e.target.closest("[data-probemap-modal]")
      )
        return;
      setLocked(false);
      setVisible(false);
      setEditingIcon(false);
      setEditingEndpoint(false);
      setEditingDesc(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLocked(false);
        setVisible(false);
        setEditingIcon(false);
        setEditingEndpoint(false);
        setEditingDesc(false);
      }
    };
    document.addEventListener("mousedown", onMouse, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onMouse, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [locked]);

  const color = colorHex
    ? colorFromHex(colorHex)
    : { bg: "transparent", border: "var(--probemap-border-strong)" };
  const labelColor = colorHex ? "var(--probemap-text)" : "var(--probemap-text-muted)";

  const viewerSelectionShadow = isViewerSelected
    ? colorHex
      ? `0 0 0 2px ${colorHex}, 0 0 28px 10px ${hexToRgba(colorHex, 0.28)}, 0 12px 32px ${hexToRgba(colorHex, 0.18)}`
      : "0 0 0 2px #9ca3af, 0 0 28px 10px rgba(107,114,128,0.22), 0 12px 32px rgba(55,65,81,0.14)"
    : undefined;

  const applyColor = (hex: string) => {
    setColorHex(hex);
    updateNodeData(id, { color: hex || undefined });
    setPaletteOpen(false);
  };

  const commitDesc = (val: string) => {
    updateNodeData(id, { description: val.trim() || undefined });
    setEditingDesc(false);
  };

  const commitEndpointEdit = () => {
    updateNodeData(id, { endpoint: endpointDraft.trim() || null });
    setEditingEndpoint(false);
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

  const layerOrder = useMemo(() => {
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
  }, [getNodes, id]);

  const iconName = d.icon ?? DEFAULT_GROUP_ICON_NAME;
  const panelW = 260;
  const liveRect =
    visible && nodeRef.current ? nodeRef.current.getBoundingClientRect() : null;
  const panelStyle = liveRect
    ? (() => {
        const gap = 20;
        const left =
          window.innerWidth - liveRect.right - gap >= panelW
            ? liveRect.right + gap
            : liveRect.left - panelW - gap;
        const nodeCenter = liveRect.top + liveRect.height / 2;
        const top = Math.max(8, nodeCenter - 120);
        return {
          position: "fixed" as const,
          top,
          left: Math.max(8, left),
          width: panelW,
        };
      })()
    : {};

  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > window.innerHeight - 8) {
      el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
    }
  });

  const panel =
    visible && liveRect
      ? createPortal(
          <div
            ref={panelRef}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              ...panelStyle,
              zIndex: 3000,
              background: "var(--probemap-modal-bg)",
              border: "1.5px solid var(--probemap-border)",
              borderRadius: 10,
              boxShadow: "0 4px 16px rgba(0,0,0,.1)",
              padding: "12px 14px",
              fontSize: 12,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: editingIcon ? 6 : 10,
              }}
            >
              <button
                type="button"
                title={t("changeIconTitle")}
                onClick={() => {
                  if (canEdit) setEditingIcon((v) => !v);
                }}
                disabled={!canEdit}
                style={{
                  flexShrink: 0,
                  background: editingIcon
                    ? "var(--probemap-interactive-hover-bg)"
                    : "transparent",
                  border: `1.5px solid ${editingIcon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                  borderRadius: 6,
                  padding: 3,
                  cursor: canEdit ? "pointer" : "default",
                  color: "var(--probemap-text-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: canEdit ? 1 : 0.55,
                }}
              >
                <IconRenderer name={iconName} size={16} />
              </button>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--probemap-text)",
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={d.label || t("defaultGroupLabel")}
              >
                {d.label || t("defaultGroupLabel")}
              </div>
            </div>
            {editingIcon && canEdit && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 3,
                  marginBottom: 10,
                }}
              >
                {ALL_ICONS.map((entry) => (
                  <button
                    key={entry.icon}
                    type="button"
                    title={entry.label}
                    onClick={() => {
                      updateNodeData(id, { icon: entry.icon });
                      setEditingIcon(false);
                    }}
                    style={{
                      width: 22,
                      height: 22,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      borderRadius: 4,
                      padding: 0,
                      flexShrink: 0,
                      cursor: "pointer",
                      border: `1.5px solid ${iconName === entry.icon ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                      background:
                        iconName === entry.icon
                          ? "var(--probemap-interactive-hover-bg)"
                          : "transparent",
                      color: "var(--probemap-text-muted)",
                    }}
                  >
                    <IconRenderer name={entry.icon} size={11} />
                  </button>
                ))}
                {customIcons.map((ci) => {
                  const cname = `custom:${ci.name}`;
                  return (
                    <button
                      key={cname}
                      type="button"
                      title={ci.name}
                      onClick={() => {
                        updateNodeData(id, { icon: cname });
                        setEditingIcon(false);
                      }}
                      style={{
                        width: 22,
                        height: 22,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 4,
                        padding: 0,
                        flexShrink: 0,
                        cursor: "pointer",
                        border: `1.5px solid ${iconName === cname ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                        background:
                          iconName === cname
                            ? "var(--probemap-interactive-hover-bg)"
                            : "transparent",
                      }}
                    >
                      <IconRenderer name={cname} size={15} />
                    </button>
                  );
                })}
              </div>
            )}

            <div
              style={{
                height: 1,
                background: "var(--probemap-bg-subtle)",
                margin: "8px 0 8px",
              }}
            />
            <div
              style={{
                fontWeight: 700,
                color: "var(--probemap-text-faint)",
                marginBottom: 6,
                fontSize: 10,
                letterSpacing: "0.06em",
              }}
            >
              {t("endpointTitle")}
            </div>
            {editingEndpoint && canEdit ? (
              <input
                autoFocus
                value={endpointDraft}
                onChange={(e) => setEndpointDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEndpointEdit();
                  if (e.key === "Escape") setEditingEndpoint(false);
                }}
                onBlur={commitEndpointEdit}
                placeholder={t("endpointPlaceholder")}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1.5px solid var(--probemap-interactive-hover-border)",
                  borderRadius: 5,
                  padding: "4px 8px",
                  fontSize: 12,
                  outline: "none",
                  color: "var(--probemap-text)",
                  background: "var(--probemap-input-bg)",
                }}
              />
            ) : (
              <div
                onClick={
                  canEdit
                    ? () => {
                        setEndpointDraft(d.endpoint ?? "");
                        setEditingEndpoint(true);
                      }
                    : undefined
                }
                style={{
                  cursor: canEdit ? "pointer" : "default",
                  color: d.endpoint
                    ? "var(--probemap-text)"
                    : "var(--probemap-text-faint)",
                  minHeight: 18,
                  fontSize: 12,
                  wordBreak: "break-all",
                }}
              >
                {d.endpoint?.trim()
                  ? d.endpoint
                  : canEdit
                    ? t("endpointClickToAdd")
                    : t("emDash")}
              </div>
            )}

            <div
              style={{
                height: 1,
                background: "var(--probemap-bg-subtle)",
                margin: "10px 0 8px",
              }}
            />
            <div
              style={{
                fontWeight: 700,
                color: "var(--probemap-text-faint)",
                marginBottom: 6,
                fontSize: 10,
                letterSpacing: "0.06em",
              }}
            >
              {t("descriptionTitle")}
            </div>
            {editingDesc && canEdit ? (
              <textarea
                autoFocus
                value={descDraft.slice(0, 120)}
                onChange={(e) => setDescDraft(e.target.value.slice(0, 120))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitDesc(descDraft);
                  }
                  if (e.key === "Escape") setEditingDesc(false);
                }}
                onBlur={() => commitDesc(descDraft)}
                placeholder={t("descriptionPlaceholder")}
                rows={2}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  border: "1.5px solid var(--probemap-interactive-hover-border)",
                  borderRadius: 5,
                  padding: "4px 8px",
                  fontSize: 12,
                  outline: "none",
                  color: "var(--probemap-text)",
                  background: "var(--probemap-input-bg)",
                  resize: "vertical",
                  lineHeight: 1.4,
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <div
                onClick={
                  canEdit
                    ? () => {
                        setDescDraft(d.description ?? "");
                        setEditingDesc(true);
                      }
                    : undefined
                }
                style={{
                  cursor: canEdit ? "pointer" : "default",
                  color: d.description
                    ? "var(--probemap-text)"
                    : "var(--probemap-text-faint)",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  minHeight: 18,
                }}
              >
                {d.description?.trim()
                  ? d.description
                  : canEdit
                    ? t("descriptionPlaceholder")
                    : t("emDash")}
              </div>
            )}

            {canEdit && (
              <DeleteButton nodeId={id} label={d.label || t("defaultGroupLabel")} />
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {/* Handles для соединений — на всех сторонах */}
      <Handle type="source" position={Position.Top}    id="top"    style={HANDLE_STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Right}  id="right"  style={HANDLE_STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Bottom} id="bottom" style={HANDLE_STYLE} className="react-flow__handle-visibility" />
      <Handle type="source" position={Position.Left}   id="left"   style={HANDLE_STYLE} className="react-flow__handle-visibility" />

      {/* Ресайзер: только в режиме редактирования (выбрана + admin) */}
      <NodeResizer
        isVisible={isEditMode}
        minWidth={120}
        minHeight={80}
        lineStyle={{ borderWidth: 8, borderColor: "transparent" }}
        handleClassName="group-resize-handle"
      />

      <div
        ref={nodeRef}
        onClick={handleNodeClick}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 4,
          border: `1.5px solid ${color.border}`,
          background: color.bg,
          backdropFilter: "blur(2px)",
          boxSizing: "border-box",
          position: "relative",
          overflow: "visible",
          boxShadow: viewerSelectionShadow,
          outline: locked ? "2px solid var(--probemap-blue)" : undefined,
          outlineOffset: locked ? 1 : undefined,
          cursor: "pointer",
        }}
      >
        {/* Пунктирная рамка редактирования — снаружи солидного бордера.
            Угловые квадратики рендерятся как дочерние элементы рамки,
            чтобы всегда точно попадать на её углы. */}
        {isEditMode && (
          <div
            style={{
              position: "absolute",
              inset: -6,
              border: `1.5px dashed ${color.border}`,
              borderRadius: 0,
              pointerEvents: "none",
            }}
          >
            {([
              { top: -4, left: -4 },
              { top: -4, right: -4 },
              { bottom: -4, left: -4 },
              { bottom: -4, right: -4 },
            ] as React.CSSProperties[]).map((pos, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: 8,
                  height: 8,
                  background: "var(--probemap-blue)",
                  border: "1.5px solid var(--probemap-bg)",
                  boxSizing: "border-box",
                  borderRadius: 2,
                  transform: "rotate(45deg)",
                  ...pos,
                }}
              />
            ))}
          </div>
        )}

        {/* Заголовок: кнопка цвета (только в edit mode) + лейбл (всегда) */}
        <div
          onPointerDown={stopFlowPointer}
          onMouseDown={stopFlowPointer}
          style={{
            position: "absolute",
            top: 4,
            left: 8,
            display: "flex",
            alignItems: "center",
            gap: 6,
            maxWidth: "calc(100% - 160px)",
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border: "1px solid var(--probemap-border)",
              background: "var(--probemap-bg-muted)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              boxShadow: "0 1px 2px rgba(15,23,42,0.06)",
            }}
            aria-hidden
          >
            <IconRenderer name={iconName} size={14} />
          </div>
          {isEditMode && (
            <button
              ref={colorBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPaletteOpen((v) => !v);
              }}
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
          )}

          {/* Editable label */}
          {editing ? (
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                const v = label.trim();
                if (v) updateNodeData(id, { label: v });
                setEditing(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const v = label.trim();
                  if (v) updateNodeData(id, { label: v });
                  setEditing(false);
                }
              }}
              style={{
                background: "transparent",
                border: "none",
                borderBottom: `1.5px solid ${color.border}`,
                outline: "none",
                boxShadow: `0 0 0 2px ${color.border}33`,
                fontSize: 12,
                fontWeight: 600,
                color: labelColor,
                width: "min(100%, 220px)",
              }}
            />
          ) : (
            <span
              onDoubleClick={() => { if (isEditMode) setEditing(true); }}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: labelColor,
                cursor: isEditMode ? "text" : "default",
                userSelect: "none",
              }}
            >
              {label}
            </span>
          )}
        </div>

        {/* Кнопки слоёв — только в режиме редактирования */}
        {isEditMode && (
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
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                shiftZ(-1);
              }}
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
              onClick={(e) => {
                e.stopPropagation();
                shiftZ(1);
              }}
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
            onClick={(e) => e.stopPropagation()}
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
                    const hex = e.target.value;
                    setColorHex(hex);
                    updateNodeData(id, { color: hex });
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
      {panel}
    </>
  );
});

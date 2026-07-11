import { useReactFlow, type NodeProps } from "@xyflow/react";
import { memo, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { useTrace } from "../TraceContext";
import { TrashIcon } from "../TrashIcon";

/** Иначе React Flow перехватывает mousedown — начинается drag ноды вместо выделения текста. */
function stopFlowPointer(e: React.MouseEvent | React.PointerEvent) {
  e.stopPropagation();
}

export interface TextNodeData extends Record<string, unknown> {
  text: string;
  fontSize?: number;
}

export const TEXT_DEFAULT_FONT_SIZE = 14;
const FONT_SIZES = [12, 14, 18, 24, 32, 48];

export const TextNode = memo(function TextNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as TextNodeData;
  const { updateNodeData } = useReactFlow();
  const { t } = useI18n();
  const { canEdit } = useTrace();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.text ?? "");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const fontSize = d.fontSize ?? TEXT_DEFAULT_FONT_SIZE;
  const isEditMode = !!selected && canEdit;

  useEffect(() => {
    setDraft(d.text ?? "");
  }, [d.text]);

  // Автовысота textarea под содержимое
  useEffect(() => {
    if (!editing) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  const commit = () => {
    updateNodeData(id, { text: draft.trim() });
    setEditing(false);
  };

  const textStyle: React.CSSProperties = {
    fontSize,
    lineHeight: 1.3,
    fontWeight: 600,
    color: "var(--probemap-text)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontFamily: "inherit",
  };

  return (
    <div
      style={{
        position: "relative",
        minWidth: 40,
        maxWidth: 480,
        padding: "4px 8px",
        borderRadius: 6,
        boxSizing: "border-box",
        cursor: canEdit ? "grab" : "default",
        // Рамка только при выделении/наведении в admin — обычно текст «голый»
        border: `1.5px dashed ${isEditMode ? "var(--probemap-border-strong)" : "transparent"}`,
        background: isEditMode ? "var(--probemap-bg-muted)" : "transparent",
      }}
    >
      {/* Тулбар размера шрифта — при выделении в admin-режиме */}
      {isEditMode && (
        <div
          className="nodrag"
          onPointerDown={stopFlowPointer}
          onMouseDown={stopFlowPointer}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: -34,
            left: 0,
            display: "flex",
            alignItems: "center",
            gap: 3,
            padding: "3px 5px",
            borderRadius: 7,
            background: "var(--probemap-bg)",
            border: "1px solid var(--probemap-border)",
            boxShadow: "0 4px 14px rgba(15,23,42,0.14)",
            zIndex: 10,
          }}
          title={t("textFontSize")}
        >
          {FONT_SIZES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateNodeData(id, { fontSize: s })}
              className="probemap-btn"
              style={{
                padding: "1px 5px",
                borderRadius: 5,
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.4,
                border: `1.5px solid ${fontSize === s ? "var(--probemap-interactive-hover-border)" : "transparent"}`,
                background: fontSize === s ? "var(--probemap-interactive-hover-bg)" : "transparent",
                color: "var(--probemap-text)",
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
          <div style={{ width: 1, height: 14, background: "var(--probemap-border)" }} />
          <button
            type="button"
            className="probemap-btn probemap-btn--map-delete"
            aria-label={t("delete")}
            title={t("delete")}
            style={{
              width: 20,
              height: 20,
              borderRadius: 5,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
            onClick={(e) => {
              e.stopPropagation();
              document.dispatchEvent(
                new CustomEvent("delete-node-request", {
                  detail: {
                    id,
                    label: (d.text || t("defaultTextLabel")).slice(0, 40),
                  },
                }),
              );
            }}
          >
            <TrashIcon variantOnRed size={9} />
          </button>
        </div>
      )}

      {editing ? (
        <textarea
          ref={taRef}
          autoFocus
          className="nodrag"
          onPointerDown={stopFlowPointer}
          onMouseDown={stopFlowPointer}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            }
            if (e.key === "Escape") {
              setDraft(d.text ?? "");
              setEditing(false);
            }
          }}
          placeholder={t("textPlaceholder")}
          rows={1}
          style={{
            ...textStyle,
            display: "block",
            width: "min(320px, 60vw)",
            border: "none",
            outline: "none",
            background: "transparent",
            resize: "none",
            overflow: "hidden",
            padding: 0,
            margin: 0,
          }}
        />
      ) : (
        <div
          onClick={(e) => {
            if (!canEdit) return;
            e.stopPropagation();
            setDraft(d.text ?? "");
            setEditing(true);
          }}
          style={{
            ...textStyle,
            cursor: canEdit ? "text" : "default",
            // Пустой текст — видимый плейсхолдер, чтобы нода не «терялась»
            color: d.text?.trim() ? "var(--probemap-text)" : "var(--probemap-text-faint)",
            minHeight: Math.round(fontSize * 1.3),
          }}
        >
          {d.text?.trim() || t("textPlaceholder")}
        </div>
      )}
    </div>
  );
});

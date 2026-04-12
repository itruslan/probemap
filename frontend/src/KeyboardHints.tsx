import { useState } from "react";
import { useI18n } from "./i18n";

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
const Mod = isMac ? "⌘" : "Ctrl";

export function KeyboardHints() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  const hints: { keys: string[]; label: string }[] = [
    { keys: [t("hintsClickDrag")],   label: t("hintsPan") },
    { keys: ["Scroll"],              label: t("hintsZoom") },
    { keys: [t("hintsClickNode")],   label: t("hintsSelectNode") },
    { keys: ["Shift", t("hintsDrag")], label: t("hintsMultiSelect") },
    { keys: ["Backspace"],           label: t("hintsDelete") },
    { keys: [Mod, "Z"],              label: t("hintsUndo") },
    { keys: [Mod, "⇧", "Z"],        label: t("hintsRedo") },
    { keys: ["Esc"],                 label: t("hintsEscape") },
  ];

  return (
    <div style={{ position: "relative" }}>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            background: "var(--probemap-modal-bg)",
            border: "1px solid var(--probemap-border)",
            borderRadius: 10,
            padding: "10px 14px",
            boxShadow: "0 8px 24px rgba(0,0,0,.15)",
            minWidth: 230,
            zIndex: 100,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--probemap-text-faint)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            {t("hintsTitle")}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {hints.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: "var(--probemap-text-faint)" }}>{h.label}</span>
                <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                  {h.keys.map((k, j) => (
                    k === "+" ? (
                      <span key={j} style={{ fontSize: 11, color: "var(--probemap-text-faint)", alignSelf: "center" }}>+</span>
                    ) : (
                      <kbd key={j} style={{
                        fontSize: 11,
                        fontFamily: "inherit",
                        background: "var(--probemap-interactive-hover-bg)",
                        border: "1px solid var(--probemap-border)",
                        borderRadius: 4,
                        padding: "1px 5px",
                        color: "var(--probemap-text)",
                        lineHeight: 1.6,
                      }}>{k}</kbd>
                    )
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={t("hintsTitle")}
        aria-label={t("hintsTitle")}
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          border: "1px solid var(--probemap-border)",
          background: "var(--probemap-modal-bg)",
          color: "var(--probemap-text-faint)",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 6px rgba(0,0,0,.1)",
        }}
      >
        ?
      </button>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveIcon, ALL_ICONS, type IconEntry } from "./icons";
import { fetchIcons, uploadIcon, deleteIcon, type CustomIcon } from "./api";
import { HoverTooltip } from "./Tooltip";
import { useI18n } from "./i18n";
import { TrashIcon } from "./TrashIcon";

interface Props {
  anchorX: number;
  anchorY: number;
  onSelect: (name: string) => void;
  onClose: () => void;
  /** Встроенные иконки (по умолчанию — полный список `ALL_ICONS`) */
  builtinIcons?: IconEntry[];
}

const BASE = import.meta.env.VITE_API_URL ?? "";


export function IconPicker({ anchorX, anchorY, onSelect, onClose, builtinIcons }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingName, setPendingName] = useState("");
  const [tooltip, setTooltip] = useState<{ label: string; el: HTMLElement } | null>(null);

  useEffect(() => {
    fetchIcons().then(setCustomIcons).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handler, true);
    document.addEventListener("contextmenu", handler, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", handler, true);
      document.removeEventListener("contextmenu", handler, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const W = 240;
  const left = Math.min(anchorX, window.innerWidth - W - 8);
  const top = Math.min(anchorY, window.innerHeight - 380);

  const [nameError, setNameError] = useState(false);

  const builtins = builtinIcons ?? ALL_ICONS;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPendingName(file.name.replace(/\.[^.]+$/, ""));
    setNameError(false);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!pendingFile) return;
    if (!pendingName.trim()) { setNameError(true); return; }
    const icon = await uploadIcon(pendingName.trim(), pendingFile);
    setCustomIcons((prev) => [...prev.filter((i) => i.name !== icon.name), icon]);
    setPendingFile(null);
    setPendingName("");
    setNameError(false);
  };

  const handleDelete = async (e: React.MouseEvent, name: string) => {
    e.stopPropagation();
    await deleteIcon(name);
    setCustomIcons((prev) => prev.filter((i) => i.name !== name));
  };

  return [createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed", left, top, width: W, zIndex: 2000,
        background: "var(--probemap-modal-bg)", border: "1.5px solid var(--probemap-border)",
        borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.14)",
        padding: "6px 0 8px", display: "flex", flexDirection: "column",
        maxHeight: "min(480px, calc(100vh - 16px))", overflowY: "auto",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Built-in icons */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--probemap-text-faint)", padding: "6px 12px 4px", letterSpacing: "0.05em" }}>
        {t("iconSectionBuiltin")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 8px" }}>
        {builtins.map((item) => {
          const Icon = resolveIcon(item.icon);
          return (
            <div
              key={item.icon}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.icon);
                }
              }}
              onClick={() => onSelect(item.icon)}
              className="probemap-icon-tile"
              onMouseEnter={(e) => setTooltip({ label: item.label, el: e.currentTarget })}
              onMouseLeave={() => setTooltip(null)}
            >
              <Icon size={16} />
            </div>
          );
        })}
      </div>

      {/* Custom icons section */}
      <div style={{ height: 1, background: "var(--probemap-border)", margin: "6px 0 2px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--probemap-text-faint)", padding: "4px 12px 4px", letterSpacing: "0.05em" }}>
        {t("iconSectionCustom")}
      </div>

      {customIcons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 8px" }}>
          {customIcons.map((icon) => (
            <div
              key={icon.name}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(`custom:${icon.name}`);
                }
              }}
              onClick={() => onSelect(`custom:${icon.name}`)}
              className="probemap-icon-tile"
              onMouseEnter={(e) => setTooltip({ label: icon.name, el: e.currentTarget })}
              onMouseLeave={() => setTooltip(null)}
            >
              <img src={`${BASE}${icon.url}`} style={{ width: 22, height: 22, objectFit: "contain" }} alt="" />
              <button
                className="probemap-icon-tile__del"
                type="button"
                onClick={(e) => handleDelete(e, icon.name)}
                style={{
                  display: "none",
                  position: "absolute",
                  top: -5,
                  right: -5,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "none",
                  background: "#ef4444",
                  cursor: "pointer",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                <TrashIcon variantOnRed size={8} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload */}
      <div style={{ padding: "4px 8px 0" }}>
        {pendingFile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  autoFocus
                  value={pendingName}
                  onChange={(e) => { setPendingName(e.target.value); setNameError(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleUpload(); if (e.key === "Escape") { setPendingFile(null); setPendingName(""); setNameError(false); } }}
                  placeholder={t("iconNamePlaceholder")}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "4px 6px", borderRadius: 5, fontSize: 12, outline: "none",
                    border: `1.5px solid ${nameError ? "#ef4444" : "var(--probemap-border)"}`,
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleUpload}
                className="probemap-btn probemap-btn--primary"
                style={{ padding: "4px 8px", borderRadius: 5, fontSize: 11, flexShrink: 0 }}
              >
                {t("uiOk")}
              </button>
            </div>
            {nameError && (
              <div style={{ fontSize: 10, color: "#ef4444", paddingLeft: 2 }}>{t("iconNameRequiredError")}</div>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="probemap-btn-dashed-wide">
            {t("iconUpload")}
          </button>
        )}
        <input ref={fileRef} type="file" accept=".svg,.png,.webp" style={{ display: "none" }} onChange={handleFileChange} />
      </div>
    </div>,
    document.body
  ),
  tooltip && <HoverTooltip key="tip" label={tooltip.label} targetEl={tooltip.el} />,
]}

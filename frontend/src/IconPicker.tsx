import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resolveIcon, ALL_ICONS } from "./icons";
import { fetchIcons, uploadIcon, deleteIcon, type CustomIcon } from "./api";
import { HoverTooltip } from "./Tooltip";
import { useI18n } from "./i18n";

interface Props {
  anchorX: number;
  anchorY: number;
  onSelect: (name: string) => void;
  onClose: () => void;
}

const BASE = import.meta.env.VITE_API_URL ?? "";


export function IconPicker({ anchorX, anchorY, onSelect, onClose }: Props) {
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
        background: "#fff", border: "1.5px solid #e2e8f0",
        borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,.14)",
        padding: "6px 0 8px", display: "flex", flexDirection: "column",
        maxHeight: "min(480px, calc(100vh - 16px))", overflowY: "auto",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Built-in icons */}
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", padding: "6px 12px 4px", letterSpacing: "0.05em" }}>
        {t("iconSectionBuiltin")}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 8px" }}>
        {ALL_ICONS.map((item) => {
          const Icon = resolveIcon(item.icon);
          return (
            <div
              key={item.icon}
              onClick={() => onSelect(item.icon)}
              style={{
                position: "relative", width: 36, height: 36, borderRadius: 8,
                border: "1px solid #f1f5f9", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#475569",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#93c5fd"; e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#3b82f6"; setTooltip({ label: item.label, el: e.currentTarget }); }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#f1f5f9"; e.currentTarget.style.background = ""; e.currentTarget.style.color = "#475569"; setTooltip(null); }}
            >
              <Icon size={16} />
            </div>
          );
        })}
      </div>

      {/* Custom icons section */}
      <div style={{ height: 1, background: "#f1f5f9", margin: "6px 0 2px" }} />
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", padding: "4px 12px 4px", letterSpacing: "0.05em" }}>
        {t("iconSectionCustom")}
      </div>

      {customIcons.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "2px 8px" }}>
          {customIcons.map((icon) => (
            <div
              key={icon.name}
              onClick={() => onSelect(`custom:${icon.name}`)}
              style={{
                position: "relative", width: 36, height: 36, borderRadius: 8,
                border: "1px solid #f1f5f9", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#93c5fd";
                e.currentTarget.style.background = "#eff6ff";
                (e.currentTarget.querySelector(".del-btn") as HTMLElement | null)?.style.setProperty("display", "flex");
                setTooltip({ label: icon.name, el: e.currentTarget });
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#f1f5f9";
                e.currentTarget.style.background = "";
                (e.currentTarget.querySelector(".del-btn") as HTMLElement | null)?.style.setProperty("display", "none");
                setTooltip(null);
              }}
            >
              <img src={`${BASE}${icon.url}`} style={{ width: 22, height: 22, objectFit: "contain" }} />
              <button
                className="del-btn"
                onClick={(e) => handleDelete(e, icon.name)}
                style={{
                  display: "none", position: "absolute", top: -5, right: -5,
                  width: 14, height: 14, borderRadius: "50%", border: "none",
                  background: "#ef4444", color: "#fff", fontSize: 9,
                  cursor: "pointer", alignItems: "center", justifyContent: "center", padding: 0,
                }}
              >×</button>
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
                    border: `1.5px solid ${nameError ? "#ef4444" : "#e2e8f0"}`,
                  }}
                />
              </div>
              <button
                onClick={handleUpload}
                style={{
                  padding: "4px 8px", borderRadius: 5, border: "none",
                  background: "#3b82f6", color: "#fff", fontSize: 11, cursor: "pointer", flexShrink: 0,
                }}
              >{t("uiOk")}</button>
            </div>
            {nameError && (
              <div style={{ fontSize: 10, color: "#ef4444", paddingLeft: 2 }}>{t("iconNameRequiredError")}</div>
            )}
          </div>
        ) : (
          <button
            onClick={() => fileRef.current?.click()}
            style={{
              width: "100%", padding: "5px 0", borderRadius: 6,
              border: "1.5px dashed #cbd5e1", background: "none",
              fontSize: 12, color: "#64748b", cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.color = "#3b82f6"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#cbd5e1"; e.currentTarget.style.color = "#64748b"; }}
          >
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

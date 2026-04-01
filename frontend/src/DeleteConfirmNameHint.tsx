import { useEffect, useRef, useState } from "react";
import { FaCheck, FaCopy } from "react-icons/fa6";
import { useI18n } from "./i18n";

/** Одна строка: «Введите» + имя + кнопка копирования + «для подтверждения:» */
export function DeleteConfirmNameHint({ name }: { name: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = () => {
    void navigator.clipboard.writeText(name).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "4px 6px",
        marginBottom: 14,
        fontSize: 13,
        lineHeight: 1.5,
        color: "var(--probemap-text-muted)",
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <span style={{ flexShrink: 0 }}>{t("deleteConfirmLead")}</span>
      <span
        style={{
          color: "var(--probemap-text)",
          fontWeight: 600,
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {name}
      </span>
      <button
        type="button"
        className="delete-confirm-copy-btn"
        onClick={copy}
        title={copied ? t("nameCopied") : t("copyName")}
        aria-label={copied ? t("nameCopied") : t("copyName")}
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          padding: 0,
          boxSizing: "border-box",
          borderRadius: 5,
          border: copied
            ? "1.5px solid var(--probemap-success-muted-border)"
            : "1.5px solid var(--probemap-border-strong)",
          background: copied ? "var(--probemap-success-muted-bg)" : "var(--probemap-bg-muted)",
          color: copied ? "var(--probemap-success-muted-text)" : "var(--probemap-text-muted)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          transition: "background 0.15s, border-color 0.15s, color 0.15s",
        }}
      >
        {copied ? (
          <FaCheck style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden />
        ) : (
          <FaCopy style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden />
        )}
      </button>
      <span style={{ flexShrink: 0 }}>{t("deleteConfirmTail")}</span>
    </div>
  );
}

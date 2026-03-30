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
        color: "#475569",
      }}
    >
      <span>{t("deleteConfirmLead")}</span>
      <span
        style={{
          color: "#1e293b",
          fontWeight: 600,
          wordBreak: "break-word",
        }}
      >
        {name}
      </span>
      <button
        type="button"
        onClick={copy}
        title={copied ? t("nameCopied") : t("copyName")}
        aria-label={copied ? t("nameCopied") : t("copyName")}
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2px 6px",
          borderRadius: 5,
          border: copied ? "1.5px solid #86efac" : "1.5px solid #cbd5e1",
          background: copied ? "#f0fdf4" : "#f8fafc",
          color: copied ? "#15803d" : "#475569",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 500,
          transition: "background 0.15s, border-color 0.15s, color 0.15s",
        }}
      >
        {copied ? (
          <FaCheck style={{ width: 14, height: 14 }} aria-hidden />
        ) : (
          <FaCopy style={{ width: 13, height: 13 }} aria-hidden />
        )}
      </button>
      <span>{t("deleteConfirmTail")}</span>
    </div>
  );
}

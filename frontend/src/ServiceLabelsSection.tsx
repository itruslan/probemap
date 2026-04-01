import { useI18n } from "./i18n";

export function ServiceLabelsSection({ labels }: { labels?: Record<string, string> | null }) {
  const { t } = useI18n();
  const entries = labels ? Object.entries(labels).sort(([a], [b]) => a.localeCompare(b, "en")) : [];
  if (entries.length === 0) return null;
  return (
    <>
      <div style={{ height: 1, background: "var(--probemap-border)", margin: "10px 0 8px" }} />
      <div
        style={{
          fontWeight: 700,
          color: "var(--probemap-text-faint)",
          marginBottom: 6,
          fontSize: 10,
          letterSpacing: "0.06em",
        }}
      >
        {t("labelsTitle")}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {entries.map(([k, v]) => (
          <div
            key={k}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "baseline",
              fontSize: 11,
              minWidth: 0,
            }}
          >
            <span
              style={{
                color: "var(--probemap-text-muted)",
                flexShrink: 0,
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
              }}
            >
              {k}
            </span>
            <span style={{ color: "var(--probemap-text)", wordBreak: "break-word", minWidth: 0 }}>{v}</span>
          </div>
        ))}
      </div>
    </>
  );
}

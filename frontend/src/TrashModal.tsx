import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchDeletedProjects, restoreProject, hardDeleteProject, type Project } from "./api";
import { useI18n } from "./i18n";
import { TrashIcon } from "./TrashIcon";

interface Props {
  onClose: () => void;
  onRestored: (project: Project) => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

export function TrashModal({ onClose, onRestored }: Props) {
  const { t } = useI18n();
  const [items, setItems] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    fetchDeletedProjects()
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmId) setConfirmId(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, confirmId]);

  const handleRestore = async (id: string) => {
    setBusy(id);
    try {
      const restored = await restoreProject(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      onRestored(restored);
    } finally {
      setBusy(null);
    }
  };

  const handleHardDelete = async (id: string) => {
    setBusy(id);
    try {
      await hardDeleteProject(id);
      setItems((prev) => prev.filter((p) => p.id !== id));
      setConfirmId(null);
    } finally {
      setBusy(null);
    }
  };

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 4000,
        background: "var(--probemap-overlay-scrim)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--probemap-modal-bg)",
          borderRadius: 12,
          width: 460,
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 16px 48px rgba(0,0,0,.18)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "20px 24px 16px",
          borderBottom: "1px solid var(--probemap-border)",
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--probemap-text)" }}>
            {t("trashTitle")}
          </span>
          <button type="button" onClick={onClose} className="probemap-btn probemap-btn--close">×</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", flex: 1, padding: "8px 0" }}>
          {loading ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--probemap-text-faint)", fontSize: 13 }}>
              {t("loading")}
            </div>
          ) : error ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--probemap-danger, #e55)", fontSize: 13 }}>
              {error}
            </div>
          ) : items.length === 0 ? (
            <div style={{ padding: "32px 24px", textAlign: "center", color: "var(--probemap-text-faint)", fontSize: 13 }}>
              {t("trashEmpty")}
            </div>
          ) : (
            items.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--probemap-border)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--probemap-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.name}
                  </div>
                  {p.deleted_at && (
                    <div style={{ fontSize: 11, color: "var(--probemap-text-faint)", marginTop: 2 }}>
                      {t("trashDeletedAt")} {formatDate(p.deleted_at)}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void handleRestore(p.id)}
                  className="probemap-btn probemap-btn--slate probemap-btn--xs"
                >
                  {t("trashRestore")}
                </button>
                {confirmId === p.id ? (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => void handleHardDelete(p.id)}
                    className="probemap-btn probemap-btn--danger probemap-btn--xs"
                  >
                    {t("trashConfirmDelete")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => setConfirmId(p.id)}
                    title={t("trashDeletePermanently")}
                    className="probemap-btn probemap-btn--icon-plain"
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        {items.length > 0 && (
          <div style={{
            padding: "10px 20px",
            borderTop: "1px solid var(--probemap-border)",
            fontSize: 11,
            color: "var(--probemap-text-faint)",
            flexShrink: 0,
          }}>
            {t("trashHint")}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

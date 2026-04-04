import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "./api";
import { useAuth } from "./AuthContext";
import { useI18n } from "./i18n";

export function LoginModal({ onClose }: { onClose: () => void }) {
  const { login } = useAuth();
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(password);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t("loginError"));
      } else {
        setError(t("apiErrorNetwork"));
      }
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  return createPortal(
    <div
      data-probemap-modal
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--probemap-bg)",
          border: "1.5px solid var(--probemap-border)",
          borderRadius: 12,
          padding: "28px 28px 24px",
          width: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: "var(--probemap-text)" }}>
          {t("loginModalTitle")}
        </div>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("loginPasswordPlaceholder")}
            disabled={busy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              borderRadius: 7,
              border: `1.5px solid ${error ? "var(--probemap-danger)" : "var(--probemap-border)"}`,
              background: "var(--probemap-input-bg, var(--probemap-bg))",
              color: "var(--probemap-text)",
              fontSize: 13,
              marginBottom: error ? 8 : 16,
              outline: "none",
            }}
          />
          {error && (
            <div style={{ fontSize: 12, color: "var(--probemap-danger)", marginBottom: 12 }}>
              {error}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="probemap-btn probemap-btn--ghost"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={busy || !password}
              className="probemap-btn probemap-btn--primary"
            >
              {busy ? t("loading") : t("loginSubmit")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

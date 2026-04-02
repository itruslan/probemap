import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import type { LayoutEdgeData } from "../api";
import { useI18n } from "../i18n";

const PROTOCOL_HINTS = ["https", "http", "grpc", "tcp", "udp", "ipsec", "wireguard", "ssh", "icmp"];

interface Props {
  open: boolean;
  initial: LayoutEdgeData;
  onSave: (next: LayoutEdgeData) => void;
  onClose: () => void;
}

export function EdgeMetadataModal({ open, initial, onSave, onClose }: Props) {
  const { t } = useI18n();
  const listId = useId();
  const [protocol, setProtocol] = useState("");
  const [port, setPort] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setProtocol(initial.protocol ?? "");
    setPort(initial.port ?? "");
    setDescription(initial.description ?? "");
  }, [open, initial.protocol, initial.port, initial.description]);

  if (!open) return null;

  const submit = () => {
    onSave({
      protocol: protocol.trim() || undefined,
      port: port.trim() || undefined,
      description: description.trim() || undefined,
    });
    onClose();
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="probemap-edge-meta-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 4000,
        background: "var(--probemap-overlay-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "var(--probemap-modal-bg)",
          borderRadius: 10,
          width: 400,
          maxWidth: "min(400px, calc(100vw - 48px))",
          boxSizing: "border-box",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,.18)",
          padding: "20px 24px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          id="probemap-edge-meta-title"
          style={{ fontSize: 14, fontWeight: 700, color: "var(--probemap-text)", marginBottom: 14 }}
        >
          {t("edgeEditTitle")}
        </div>

        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--probemap-text-muted)", marginBottom: 4 }}>
          {t("edgeProtocol")}
        </label>
        <input
          list={listId}
          value={protocol}
          onChange={(e) => setProtocol(e.target.value)}
          placeholder={t("edgeProtocolPlaceholder")}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 10px",
            borderRadius: 6,
            fontSize: 13,
            border: "1.5px solid var(--probemap-border)",
            outline: "none",
            color: "var(--probemap-text)",
            background: "var(--probemap-input-bg)",
            marginBottom: 12,
          }}
        />
        <datalist id={listId}>
          {PROTOCOL_HINTS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>

        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--probemap-text-muted)", marginBottom: 4 }}>
          {t("edgePort")}
        </label>
        <input
          value={port}
          onChange={(e) => setPort(e.target.value)}
          placeholder="443, 51820…"
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 10px",
            borderRadius: 6,
            fontSize: 13,
            border: "1.5px solid var(--probemap-border)",
            outline: "none",
            color: "var(--probemap-text)",
            background: "var(--probemap-input-bg)",
            marginBottom: 12,
          }}
        />

        <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--probemap-text-muted)", marginBottom: 4 }}>
          {t("edgeDescription")}
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("edgeDescriptionPlaceholder")}
          rows={3}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "7px 10px",
            borderRadius: 6,
            fontSize: 13,
            border: "1.5px solid var(--probemap-border)",
            outline: "none",
            color: "var(--probemap-text)",
            background: "var(--probemap-input-bg)",
            marginBottom: 16,
            resize: "vertical",
            minHeight: 64,
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" className="probemap-btn probemap-btn--slate" onClick={onClose}>
            {t("cancel")}
          </button>
          <button type="button" className="probemap-btn probemap-btn--primary" onClick={submit}>
            {t("save")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

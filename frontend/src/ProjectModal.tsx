import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DeleteConfirmNameHint } from "./DeleteConfirmNameHint";
import { TrashIcon } from "./TrashIcon";
import {
  ApiError,
  fetchProjectFilterValues,
  discoverLabels,
  fetchMetricLabelValues,
  type Project,
  type ProjectFilter,
} from "./api";
import { useI18n } from "./i18n";
import { I18N_STABLE } from "./i18nLayout";
import { HelpIcon, HoverTooltip } from "./Tooltip";

interface Props {
  project?: Project;
  onSave: (name: string, filters: ProjectFilter[]) => Promise<void>;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}

type Row = { label: string; value: string };

function fastApiDetailCode(text: string): string | null {
  try {
    const j = JSON.parse(text) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
  } catch {
    return null;
  }
  return null;
}

function projectToRows(p?: Project): Row[] {
  if (!p) return [{ label: "", value: "" }];
  if (p.filters?.length) {
    return p.filters.map((f) => ({ label: f.label, value: f.value }));
  }
  if (p.filter?.label) {
    return [{ label: p.filter.label, value: p.filter.value }];
  }
  return [{ label: "", value: "" }];
}

export function ProjectModal({ project, onSave, onClose, onDelete }: Props) {
  const { t } = useI18n();
  const [name, setName] = useState(project?.name ?? "");
  const [rows, setRows] = useState<Row[]>(() => projectToRows(project));
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [valueOptions, setValueOptions] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [modalTip, setModalTip] = useState<{ label: string; el: HTMLElement } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const loadValuesForLabel = useCallback(async (label: string, pid?: string) => {
    const k = label.trim();
    if (!k) return;
    try {
      const v = pid
        ? await fetchProjectFilterValues(pid, k)
        : await fetchMetricLabelValues(k);
      setValueOptions((prev) => (prev[k] !== undefined ? prev : { ...prev, [k]: v }));
    } catch {
      setValueOptions((prev) => (prev[k] !== undefined ? prev : { ...prev, [k]: [] }));
    }
  }, []);

  useEffect(() => {
    const r = projectToRows(project);
    setName(project?.name ?? "");
    setRows(r);
    setValueOptions({});
    setSaveError(null);
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
    const pid = project?.id;
    r.forEach((row) => {
      if (row.label.trim()) void loadValuesForLabel(row.label.trim(), pid);
    });
  }, [project?.id, loadValuesForLabel]);

  useEffect(() => {
    discoverLabels()
      .then((labels) => setAvailableLabels(labels.filter((l) => !l.startsWith("__"))))
      .catch(() => setAvailableLabels([]));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (deleteConfirmOpen) {
        setDeleteConfirmOpen(false);
        setDeleteConfirmText("");
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, deleteConfirmOpen]);

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
  };

  const doConfirmDelete = async () => {
    if (!project || !onDelete || deleteConfirmText !== project.name) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const setRowLabel = (i: number, label: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], label, value: "" };
      return next;
    });
    if (label.trim()) void loadValuesForLabel(label.trim(), project?.id);
  };

  const setRowValue = (i: number, value: string) => {
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], value };
      return next;
    });
  };

  const addRow = () => setRows((prev) => [...prev, { label: "", value: "" }]);
  const removeRow = (i: number) =>
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)));

  const handleSave = async () => {
    if (!name.trim()) return;
    const filters: ProjectFilter[] = rows
      .filter((r) => r.label.trim() && r.value.trim())
      .map((r) => ({ label: r.label.trim(), value: r.value.trim() }));
    setSaveError(null);
    setSaving(true);
    try {
      await onSave(name.trim(), filters);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        const code = fastApiDetailCode(e.message);
        if (code === "datasource_not_configured") setSaveError(t("projectCreateBlockedDatasource"));
        else if (code === "settings_targets_unsaved") setSaveError(t("projectCreateBlockedWizard"));
        else setSaveError(t("apiErrorHttp").replace("{status}", String(e.status)));
      } else {
        setSaveError(t("apiErrorNetwork"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
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
          borderRadius: 12,
          width: 440,
          maxHeight: "88vh",
          overflowY: "auto",
          boxShadow: "0 16px 48px rgba(0,0,0,.18)",
          padding: "24px 28px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 700,
              color: "var(--probemap-text)",
              flex: 1,
              minWidth: 0,
              minHeight: I18N_STABLE.modalTitleMinHeightPx,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {project ? t("projectTitle") : t("projectTitleNew")}
            <HelpIcon
              aria={t("tooltipInfoAria")}
              onMouseEnter={(el) => setModalTip({ label: t("projectIntro"), el })}
              onMouseLeave={() => setModalTip(null)}
            />
          </span>
          <button
            type="button"
            onClick={onClose}
            className="probemap-btn probemap-btn--close"
            style={{ flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label>{t("projectNameLabel")}</Label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              placeholder={t("projectNamePlaceholder")}
              style={inputStyle}
            />
          </div>

          <div>
            <Label>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                {t("projectFilterSection")}
                <HelpIcon
                  aria={t("tooltipInfoAria")}
                  onMouseEnter={(el) => setModalTip({ label: t("projectFilterHint"), el })}
                  onMouseLeave={() => setModalTip(null)}
                />
              </span>
            </Label>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((row, i) => {
                const lk = row.label.trim();
                const opts = lk ? valueOptions[lk] : undefined;
                const useSelect = Boolean(lk && Array.isArray(opts) && opts.length > 0);
                return (
                  <div
                    key={i}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr auto",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    {availableLabels.length > 0 ? (
                      <select
                        value={row.label}
                        onChange={(e) => setRowLabel(i, e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="">{t("projectOptionLabel")}</option>
                        {availableLabels.map((l) => (
                          <option key={l} value={l}>
                            {l}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={row.label}
                        onChange={(e) => setRowLabel(i, e.target.value)}
                        placeholder={t("placeholderEnvironment")}
                        style={inputStyle}
                      />
                    )}
                    {useSelect ? (
                      <select
                        value={row.value}
                        onChange={(e) => setRowValue(i, e.target.value)}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="">{t("projectOptionValue")}</option>
                        {(opts ?? []).map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={row.value}
                        onChange={(e) => setRowValue(i, e.target.value)}
                        placeholder={row.label.trim() ? t("projectPlaceholderProd") : t("projectPlaceholderFirstLabel")}
                        disabled={!row.label.trim()}
                        style={{
                          ...inputStyle,
                          opacity: row.label.trim() ? 1 : 0.55,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      title={t("projectRemoveCondition")}
                      className="probemap-btn probemap-btn--icon-plain"
                      style={{ cursor: rows.length <= 1 ? "default" : "pointer" }}
                    >
                      <TrashIcon size={14} muted={rows.length <= 1} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addRow}
              style={{
                marginTop: 8,
                padding: "5px 12px",
                borderRadius: 6,
                border: "1.5px dashed var(--probemap-border-strong)",
                background: "none",
                color: "var(--probemap-text-muted)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t("projectAddCondition")}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: 22,
            gap: 10,
          }}
        >
          <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
            {project && onDelete && (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(true);
                  setDeleteConfirmText("");
                }}
                title={t("projectDelete")}
                className="probemap-btn probemap-btn--danger probemap-btn--xs"
                style={{
                  width: 34,
                  minWidth: 34,
                  height: 34,
                  padding: 0,
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TrashIcon size={14} variantOnRed />
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
            {saveError ? (
              <div
                style={{
                  fontSize: 12,
                  color: "var(--probemap-text-secondary)",
                  lineHeight: 1.4,
                  maxWidth: 280,
                  textAlign: "right",
                }}
              >
                {saveError}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              className="probemap-btn probemap-btn--ghost probemap-btn--md"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!name.trim() || saving}
              className="probemap-btn probemap-btn--slate probemap-btn--md"
              style={{ opacity: !name.trim() ? 0.5 : 1 }}
            >
              {saving ? "…" : t("save")}
            </button>
            </div>
          </div>
        </div>
      </div>

      {modalTip && (
        <HoverTooltip label={modalTip.label} targetEl={modalTip.el} multiline />
      )}

      {deleteConfirmOpen && project && onDelete && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4100,
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
              width: 360,
              maxWidth: "min(360px, calc(100vw - 48px))",
              boxSizing: "border-box",
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,.18)",
              padding: "20px 24px",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--probemap-text)", marginBottom: 12 }}>
              {t("projectDelete")}
            </div>
            <DeleteConfirmNameHint name={project.name} />
            <input
              autoFocus
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && deleteConfirmText === project.name) void doConfirmDelete();
                if (e.key === "Escape") closeDeleteConfirm();
              }}
              placeholder={project.name}
              disabled={deleting}
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
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleting}
                className="probemap-btn probemap-btn--ghost probemap-btn--sm"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void doConfirmDelete()}
                disabled={deleteConfirmText !== project.name || deleting}
                className="probemap-btn probemap-btn--danger probemap-btn--sm"
              >
                {t("delete")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--probemap-text-muted)", marginBottom: 5 }}>{children}</div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 13,
  border: "1.5px solid var(--probemap-border)",
  outline: "none",
  color: "var(--probemap-text)",
  background: "var(--probemap-input-bg)",
};

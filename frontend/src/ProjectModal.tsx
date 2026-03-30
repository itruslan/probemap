import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DeleteConfirmNameHint } from "./DeleteConfirmNameHint";
import { TrashIcon } from "./TrashIcon";
import {
  fetchProjectFilterValues,
  discoverLabels,
  fetchMetricLabelValues,
  type Project,
  type ProjectFilter,
} from "./api";
import { useI18n } from "./i18n";

interface Props {
  project?: Project;
  onSave: (name: string, filters: ProjectFilter[]) => Promise<void>;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}

type Row = { label: string; value: string };

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
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
    setDeleteConfirmOpen(false);
    setDeleteConfirmText("");
    const pid = project?.id;
    r.forEach((row) => {
      if (row.label.trim()) void loadValuesForLabel(row.label.trim(), pid);
    });
  }, [project?.id, loadValuesForLabel]);

  useEffect(() => {
    discoverLabels().then(setAvailableLabels).catch(() => setAvailableLabels([]));
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
    setSaving(true);
    await onSave(name.trim(), filters);
    setSaving(false);
    onClose();
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
        background: "rgba(0,0,0,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          background: "#fff",
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
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            {project ? t("projectTitle") : t("projectTitleNew")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {project && onDelete && (
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmOpen(true);
                  setDeleteConfirmText("");
                }}
                title={t("projectDelete")}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 6px",
                  borderRadius: 4,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <TrashIcon size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "none",
                border: "none",
                fontSize: 18,
                color: "#94a3b8",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
        </div>

        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
          {t("projectIntro")}
        </p>

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
            <Label>{t("projectFilterSection")}</Label>
            <p style={{ margin: "0 0 8px", fontSize: 11, color: "#94a3b8" }}>
              {t("projectFilterHint")}
            </p>
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
                      style={{
                        padding: "6px 10px",
                        borderRadius: 6,
                        border: "1.5px solid #e2e8f0",
                        background: "#fff",
                        cursor: rows.length <= 1 ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
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
                border: "1.5px dashed #cbd5e1",
                background: "none",
                color: "#64748b",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {t("projectAddCondition")}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "1.5px solid #e2e8f0",
              background: "none",
              fontSize: 13,
              cursor: "pointer",
              color: "#64748b",
            }}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!name.trim() || saving}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              fontSize: 13,
              cursor: "pointer",
              background: "#334155",
              color: "#f8fafc",
              opacity: !name.trim() ? 0.5 : 1,
            }}
            onMouseEnter={(e) => {
              if (!e.currentTarget.disabled) e.currentTarget.style.background = "#475569";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#334155";
            }}
          >
            {saving ? "…" : t("save")}
          </button>
        </div>
      </div>

      {deleteConfirmOpen && project && onDelete && createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteConfirm();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 4100,
            background: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 10,
              width: 360,
              boxShadow: "0 8px 32px rgba(0,0,0,.18)",
              padding: "20px 24px",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
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
                border: "1.5px solid #e2e8f0",
                outline: "none",
                color: "#0f172a",
                marginBottom: 16,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleting}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "1.5px solid #e2e8f0",
                  background: "#fff",
                  fontSize: 13,
                  cursor: deleting ? "default" : "pointer",
                  color: "#64748b",
                }}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => void doConfirmDelete()}
                disabled={deleteConfirmText !== project.name || deleting}
                style={{
                  padding: "6px 16px",
                  borderRadius: 6,
                  border: "none",
                  fontSize: 13,
                  cursor: deleteConfirmText === project.name && !deleting ? "pointer" : "default",
                  background: deleteConfirmText === project.name && !deleting ? "#ef4444" : "#f1f5f9",
                  color: deleteConfirmText === project.name && !deleting ? "#fff" : "#94a3b8",
                  transition: "background 0.15s, color 0.15s",
                }}
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
    <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5 }}>{children}</div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "6px 10px",
  borderRadius: 6,
  fontSize: 13,
  border: "1.5px solid #e2e8f0",
  outline: "none",
  color: "#0f172a",
};

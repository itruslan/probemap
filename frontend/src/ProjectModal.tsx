import { useEffect, useRef, useState } from "react";
import { fetchProjectFilterValues, discoverLabels, type Project, type ProjectFilter } from "./api";

interface Props {
  project?: Project;
  onSave: (name: string, filter: ProjectFilter | null) => Promise<void>;
  onClose: () => void;
}

export function ProjectModal({ project, onSave, onClose }: Props) {
  const [name, setName] = useState(project?.name ?? "");
  const [filterLabel, setFilterLabel] = useState(project?.filter?.label ?? "");
  const [filterValue, setFilterValue] = useState(project?.filter?.value ?? "");
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [availableValues, setAvailableValues] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    discoverLabels().then(setAvailableLabels).catch(() => {});
  }, []);

  useEffect(() => {
    if (!filterLabel) { setAvailableValues([]); return; }
    if (project?.id) {
      fetchProjectFilterValues(project.id).then(setAvailableValues).catch(() => {});
    }
  }, [filterLabel, project?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const filter: ProjectFilter | null = filterLabel && filterValue
      ? { label: filterLabel, value: filterValue }
      : null;
    await onSave(name.trim(), filter);
    setSaving(false);
    onClose();
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 4000,
        background: "rgba(0,0,0,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div style={{
        background: "#fff", borderRadius: 12, width: 400,
        boxShadow: "0 16px 48px rgba(0,0,0,.18)", padding: "24px 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            {project ? "Редактировать проект" : "Новый проект"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer", padding: 0 }}>×</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label>Название</Label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              placeholder="Мой проект"
              style={inputStyle}
            />
          </div>

          <div>
            <Label>Фильтр — лейбл</Label>
            {availableLabels.length > 0 ? (
              <select
                value={filterLabel}
                onChange={(e) => { setFilterLabel(e.target.value); setFilterValue(""); }}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="">— без фильтра —</option>
                {availableLabels.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            ) : (
              <input
                value={filterLabel}
                onChange={(e) => { setFilterLabel(e.target.value); setFilterValue(""); }}
                placeholder="environment"
                style={inputStyle}
              />
            )}
          </div>

          {filterLabel && (
            <div>
              <Label>Значение</Label>
              {availableValues.length > 0 ? (
                <select
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="">— выберите —</option>
                  {availableValues.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  placeholder="prod"
                  style={inputStyle}
                />
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "none", fontSize: 13, cursor: "pointer", color: "#64748b" }}>
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            style={{ padding: "7px 18px", borderRadius: 7, border: "none", fontSize: 13, cursor: "pointer", background: "#3b82f6", color: "#fff", opacity: !name.trim() ? 0.5 : 1 }}
          >
            {saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5 }}>{children}</div>;
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "6px 10px", borderRadius: 6, fontSize: 13,
  border: "1.5px solid #e2e8f0", outline: "none", color: "#0f172a",
};

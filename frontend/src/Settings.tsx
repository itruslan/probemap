import { useEffect, useRef, useState } from "react";
import {
  fetchConfig, saveConfig, testDatasource, discoverJobs, discoverLabels,
  type AppConfig, type DiscoveredJob,
} from "./api";

interface Props {
  onClose: () => void;
}

const LABEL_FIELDS: { key: keyof AppConfig["label_map"]; label: string; required: boolean }[] = [
  { key: "service", label: "Service name", required: true },
  { key: "port",    label: "Port",         required: true },
  { key: "zone",    label: "Zone",         required: true },
  { key: "module",  label: "Module",       required: true },
  { key: "url",     label: "URL (optional)", required: false },
];

export function Settings({ onClose }: Props) {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [discoveredJobs, setDiscoveredJobs] = useState<DiscoveredJob[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConfig().then(setCfg);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!cfg) return null;

  const ds = cfg.datasource ?? { name: "", type: "victoriametrics", url: "" };

  const handleTest = async () => {
    setTestState("testing");
    const ok = await testDatasource(ds.url);
    setTestState(ok ? "ok" : "fail");
    if (ok) {
      const [jobs, labels] = await Promise.all([discoverJobs(), discoverLabels()]);
      setDiscoveredJobs(jobs);
      setAvailableLabels(labels);
      // merge discovered jobs into config preserving existing enabled states
      const existingMap = Object.fromEntries(cfg.probe_jobs.map((j) => [j.job, j.enabled]));
      const merged = jobs.map((j) => ({
        job: j.job,
        enabled: existingMap[j.job] ?? true,
      }));
      setCfg((prev) => prev ? { ...prev, probe_jobs: merged } : prev);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    await saveConfig({ ...cfg, datasource: ds });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const setDs = (patch: Partial<typeof ds>) =>
    setCfg((prev) => prev ? { ...prev, datasource: { ...ds, ...patch } } : prev);

  const toggleJob = (job: string) =>
    setCfg((prev) => prev ? {
      ...prev,
      probe_jobs: prev.probe_jobs.map((j) => j.job === job ? { ...j, enabled: !j.enabled } : j),
    } : prev);

  const setLabelMap = (key: keyof AppConfig["label_map"], value: string) =>
    setCfg((prev) => prev ? { ...prev, label_map: { ...prev.label_map, [key]: value || null } } : prev);

  const testColor = testState === "ok" ? "#16a34a" : testState === "fail" ? "#ef4444" : "#64748b";
  const testLabel = testState === "testing" ? "Проверка..." : testState === "ok" ? "✓ OK" : testState === "fail" ? "✗ Ошибка" : "Проверить";

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
        background: "#fff", borderRadius: 12, width: 520,
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 16px 48px rgba(0,0,0,.18)",
        padding: "24px 28px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Settings</span>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "#94a3b8", cursor: "pointer", padding: 0 }}>×</button>
        </div>

        {/* Datasource */}
        <Section title="DATASOURCE">
          <Field label="Name">
            <input value={ds.name} onChange={(e) => setDs({ name: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="URL">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={ds.url}
                onChange={(e) => { setDs({ url: e.target.value }); setTestState("idle"); }}
                placeholder="http://victoria-metrics:8428"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                onClick={handleTest}
                disabled={!ds.url || testState === "testing"}
                style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  border: `1.5px solid ${testColor}`, background: "none", color: testColor,
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >{testLabel}</button>
            </div>
          </Field>
        </Section>

        {/* Probe Jobs */}
        <Section title="PROBE JOBS">
          {cfg.probe_jobs.length === 0 && discoveredJobs.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              Нажмите «Проверить» для обнаружения job'ов
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cfg.probe_jobs.map((j) => {
                const info = discoveredJobs.find((d) => d.job === j.job);
                return (
                  <label key={j.job} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={j.enabled}
                      onChange={() => toggleJob(j.job)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, color: "#0f172a", flex: 1 }}>{j.job}</span>
                    {info && (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        zones: {info.zones.join(", ") || "—"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </Section>

        {/* Label Mapping */}
        <Section title="LABEL MAPPING">
          {LABEL_FIELDS.map(({ key, label, required }) => (
            <Field key={key} label={label}>
              {availableLabels.length > 0 ? (
                <select
                  value={(cfg.label_map[key] as string) ?? ""}
                  onChange={(e) => setLabelMap(key, e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {!required && <option value="">—</option>}
                  {availableLabels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              ) : (
                <input
                  value={(cfg.label_map[key] as string) ?? ""}
                  onChange={(e) => setLabelMap(key, e.target.value)}
                  placeholder={required ? key : "—"}
                  style={inputStyle}
                />
              )}
            </Field>
          ))}
        </Section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ padding: "7px 18px", borderRadius: 7, border: "1.5px solid #e2e8f0", background: "none", fontSize: 13, cursor: "pointer", color: "#64748b" }}>
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "7px 18px", borderRadius: 7, border: "none", fontSize: 13, cursor: "pointer",
              background: saved ? "#22c55e" : "#3b82f6", color: "#fff", transition: "background 0.2s",
            }}
          >
            {saved ? "Сохранено" : saving ? "..." : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", marginBottom: 10 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12, color: "#475569", width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  padding: "5px 10px", borderRadius: 6, fontSize: 12,
  border: "1.5px solid #e2e8f0", outline: "none", color: "#0f172a",
};

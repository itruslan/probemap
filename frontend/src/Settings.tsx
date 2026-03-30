import { useEffect, useRef, useState } from "react";
import {
  fetchConfig,
  saveConfig,
  testDatasource,
  discoverJobs,
  discoverLabels,
  previewMetricSelector,
  type AppConfig,
  type DiscoveredJob,
  type MetricFilterOp,
  type MetricFilterRule,
  type MetricSelectorPreview,
} from "./api";
import { useI18n, type I18nKey } from "./i18n";

const OP_OPTIONS: { value: MetricFilterOp; labelKey: I18nKey }[] = [
  { value: "eq", labelKey: "opEq" },
  { value: "re", labelKey: "opRe" },
  { value: "ne", labelKey: "opNe" },
  { value: "nre", labelKey: "opNre" },
];

function normalizeLabelMap(
  lm: AppConfig["label_map"] & { zone?: string },
): AppConfig["label_map"] {
  const probe_source = (lm.probe_source || lm.zone || "instance").trim() || "instance";
  return {
    service: lm.service ?? "service",
    port: lm.port ?? "port",
    probe_source,
    module: lm.module ?? "module",
    url: lm.url ?? null,
  };
}

function normalizeConfig(c: AppConfig): AppConfig {
  const rules = (c.metric_filter_rules ?? []).map((r) => ({
    label: (r.label ?? "").trim(),
    value: (r.value ?? "").trim(),
    op: (["eq", "re", "ne", "nre"].includes(r.op) ? r.op : "eq") as MetricFilterOp,
  }));
  return {
    ...c,
    label_map: normalizeLabelMap(c.label_map as AppConfig["label_map"] & { zone?: string }),
    metric_extra_selector: c.metric_extra_selector ?? "",
    metric_filter_rules: rules,
  };
}

interface Props {
  onClose: () => void;
  /** Фильтр активного проекта — превью селектора совпадает с запросом /api/projects/.../services */
  projectFilterPairs?: { label: string; value: string }[] | null;
}

const LABEL_FIELD_KEYS: {
  key: keyof AppConfig["label_map"];
  titleKey: I18nKey;
  hintKey: I18nKey;
  required: boolean;
}[] = [
  { key: "service", titleKey: "labelMapServiceTitle", hintKey: "labelMapServiceHint", required: true },
  { key: "port", titleKey: "labelMapPortTitle", hintKey: "labelMapPortHint", required: true },
  { key: "probe_source", titleKey: "labelMapProbeSourceTitle", hintKey: "labelMapProbeSourceHint", required: true },
  { key: "module", titleKey: "labelMapModuleTitle", hintKey: "labelMapModuleHint", required: true },
  { key: "url", titleKey: "labelMapUrlTitle", hintKey: "labelMapUrlHint", required: false },
];

export function Settings({ onClose, projectFilterPairs }: Props) {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [discoveredJobs, setDiscoveredJobs] = useState<DiscoveredJob[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectorPreview, setSelectorPreview] = useState<MetricSelectorPreview | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchConfig().then((c) => setCfg(normalizeConfig(c)));
  }, []);

  useEffect(() => {
    if (!cfg) return;
    const t = window.setTimeout(() => {
      const pairs = (projectFilterPairs ?? []).filter((p) => p.label?.trim() && p.value != null && String(p.value).trim() !== "");
      previewMetricSelector({
        probe_jobs: cfg.probe_jobs,
        metric_filter_rules: cfg.metric_filter_rules,
        metric_extra_selector: cfg.metric_extra_selector,
        ...(pairs.length > 0 ? { project_filter_pairs: pairs } : {}),
      })
        .then(setSelectorPreview)
        .catch(() => setSelectorPreview({ selector: "", example: "probe_success" }));
    }, 320);
    return () => window.clearTimeout(t);
  }, [cfg, projectFilterPairs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
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
      const existingMap = Object.fromEntries(cfg.probe_jobs.map((j) => [j.job, j.enabled]));
      const merged = jobs.map((j) => ({
        job: j.job,
        enabled: existingMap[j.job] ?? true,
      }));
      setCfg((prev) => (prev ? { ...prev, probe_jobs: merged } : prev));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const rules = (cfg.metric_filter_rules ?? [])
      .filter((r) => r.label.trim() && r.value.trim())
      .map((r) => ({
        label: r.label.trim(),
        value: r.value.trim(),
        op: r.op,
      }));
    await saveConfig({
      ...cfg,
      datasource: ds,
      metric_extra_selector: (cfg.metric_extra_selector ?? "").trim(),
      metric_filter_rules: rules,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addFilterRule = () =>
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            metric_filter_rules: [
              ...(prev.metric_filter_rules ?? []),
              { label: "", value: "", op: "eq" as MetricFilterOp },
            ],
          }
        : prev,
    );

  const removeFilterRule = (i: number) =>
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            metric_filter_rules: (prev.metric_filter_rules ?? []).filter((_, j) => j !== i),
          }
        : prev,
    );

  const patchFilterRule = (i: number, patch: Partial<MetricFilterRule>) =>
    setCfg((prev) => {
      if (!prev) return prev;
      const next = [...(prev.metric_filter_rules ?? [])];
      next[i] = { ...next[i], ...patch };
      return { ...prev, metric_filter_rules: next };
    });

  const applyPreset = (label: string, value: string, op: MetricFilterOp) =>
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            metric_filter_rules: [
              ...(prev.metric_filter_rules ?? []),
              { label, value, op },
            ],
          }
        : prev,
    );

  const clearFilterRules = () =>
    setCfg((prev) => (prev ? { ...prev, metric_filter_rules: [] } : prev));

  const setDs = (patch: Partial<typeof ds>) =>
    setCfg((prev) => (prev ? { ...prev, datasource: { ...ds, ...patch } } : prev));

  const toggleJob = (job: string) =>
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            probe_jobs: prev.probe_jobs.map((j) =>
              j.job === job ? { ...j, enabled: !j.enabled } : j,
            ),
          }
        : prev,
    );

  const setLabelMap = (key: keyof AppConfig["label_map"], value: string) =>
    setCfg((prev) =>
      prev ? { ...prev, label_map: { ...prev.label_map, [key]: value || null } } : prev,
    );

  const testColor = testState === "ok" ? "#16a34a" : testState === "fail" ? "#ef4444" : "#64748b";
  const testLabel =
    testState === "testing"
      ? t("testChecking")
      : testState === "ok"
        ? t("testOk")
        : testState === "fail"
          ? t("testFail")
          : t("testCheck");

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
          width: 600,
          maxHeight: "90vh",
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
            marginBottom: 20,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{t("settings")}</span>
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

        <Section title={t("settingsSectionDatasource")}>
          <p style={hintPara}>{t("settingsDatasourceIntro")}</p>
          <InlineField label={t("settingsName")}>
            <input value={ds.name} onChange={(e) => setDs({ name: e.target.value })} style={inputStyle} />
          </InlineField>
          <InlineField label={t("settingsUrlApi")}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={ds.url}
                onChange={(e) => {
                  setDs({ url: e.target.value });
                  setTestState("idle");
                }}
                placeholder={t("settingsUrlPlaceholder")}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={!ds.url || testState === "testing"}
                style={{
                  padding: "5px 14px",
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: "pointer",
                  border: `1.5px solid ${testColor}`,
                  background: "none",
                  color: testColor,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {testLabel}
              </button>
            </div>
          </InlineField>
        </Section>

        <Section title={t("settingsSectionJobs")}>
          <p style={hintPara}>
            {t("settingsJobsA")}
            <code style={codeInHint}>probe_success</code>
            {t("settingsJobsB")}
            <code style={codeInHint}>job</code>
            {t("settingsJobsC")}
          </p>
          {cfg.probe_jobs.length === 0 && discoveredJobs.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>{t("settingsJobsEmpty")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {cfg.probe_jobs.map((j) => {
                const info = discoveredJobs.find((d) => d.job === j.job);
                return (
                  <label
                    key={j.job}
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={j.enabled}
                      onChange={() => toggleJob(j.job)}
                      style={{ cursor: "pointer" }}
                    />
                    <span style={{ fontSize: 13, color: "#0f172a", flex: 1, fontFamily: "monospace" }}>
                      {j.job}
                    </span>
                    {info && (
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>
                        {t("settingsJobSources")} {info.probe_sources.join(", ") || t("emDash")}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </Section>

        <Section title={t("settingsSectionFilter")}>
          <p style={hintPara}>
            {t("settingsFilterIntro")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => applyPreset("environment", "prod", "eq")}
              style={presetBtn}
            >
              {t("settingsPresetEnvProd")}
            </button>
            <button
              type="button"
              onClick={() => applyPreset("environment", "staging", "ne")}
              style={presetBtn}
            >
              {t("settingsPresetEnvStaging")}
            </button>
            <button
              type="button"
              onClick={() => applyPreset("team", "platform.*", "re")}
              style={presetBtn}
            >
              {t("settingsPresetTeam")}
            </button>
            <button type="button" onClick={clearFilterRules} style={{ ...presetBtn, color: "#94a3b8" }}>
              {t("settingsFilterClear")}
            </button>
          </div>
          {(cfg.metric_filter_rules ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 8 }}>
              {t("settingsFilterNoRules")}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {(cfg.metric_filter_rules ?? []).map((row, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(100px, 1fr) 130px minmax(100px, 1fr) 36px",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  {availableLabels.length > 0 ? (
                    <select
                      value={row.label}
                      onChange={(e) => patchFilterRule(i, { label: e.target.value })}
                      style={{ ...inputStyle, cursor: "pointer" }}
                    >
                      <option value="">{t("settingsFilterLabelOption")}</option>
                      {availableLabels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={row.label}
                      onChange={(e) => patchFilterRule(i, { label: e.target.value })}
                      placeholder={t("placeholderEnvironment")}
                      style={inputStyle}
                    />
                  )}
                  <select
                    value={row.op}
                    onChange={(e) =>
                      patchFilterRule(i, { op: e.target.value as MetricFilterOp })
                    }
                    style={{ ...inputStyle, cursor: "pointer", fontSize: 11 }}
                  >
                    {OP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {t(o.labelKey)}
                      </option>
                    ))}
                  </select>
                  <input
                    value={row.value}
                    onChange={(e) => patchFilterRule(i, { value: e.target.value })}
                    placeholder={t("settingsFilterValuePlaceholder")}
                    style={inputStyle}
                  />
                  <button
                    type="button"
                    onClick={() => removeFilterRule(i)}
                    title={t("delete")}
                    style={{
                      border: "1.5px solid #e2e8f0",
                      borderRadius: 6,
                      background: "#fff",
                      color: "#64748b",
                      cursor: "pointer",
                      padding: "4px 0",
                      fontSize: 14,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={addFilterRule} style={{ ...presetBtn, marginBottom: 14 }}>
            {t("settingsFilterAddRule")}
          </button>

          <div
            style={{
              background: "#f8fafc",
              border: "1.5px solid #e2e8f0",
              borderRadius: 8,
              padding: "10px 12px",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#94a3b8",
                letterSpacing: "0.06em",
                marginBottom: 6,
              }}
            >
              {t("settingsSelectorPreviewTitle")}
            </div>
            <code
              style={{
                display: "block",
                fontSize: 12,
                color: "#0f172a",
                wordBreak: "break-all",
                lineHeight: 1.45,
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {selectorPreview?.example ?? t("ellipsis")}
            </code>
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 8, lineHeight: 1.4 }}>
              {t("settingsSelectorPreviewHint")}
            </div>
          </div>
        </Section>

        <Section title={t("settingsSectionRawPromql")}>
          <p style={hintPara}>
            {t("settingsRawPromqlIntro")}
          </p>
          <textarea
            value={cfg.metric_extra_selector ?? ""}
            onChange={(e) =>
              setCfg((prev) => (prev ? { ...prev, metric_extra_selector: e.target.value } : prev))
            }
            placeholder={t("settingsRawPromqlPlaceholder")}
            rows={2}
            style={{
              ...inputStyle,
              resize: "vertical",
              fontFamily: "ui-monospace, monospace",
              fontSize: 12,
            }}
          />
        </Section>

        <Section title={t("settingsSectionLabelMap")}>
          <p style={hintPara}>
            {t("settingsLabelMapIntro")}
          </p>
          {LABEL_FIELD_KEYS.map(({ key, titleKey, hintKey, required }) => (
            <div key={key} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 4 }}>
                {t(titleKey)}
                {required ? "" : " "}
              </div>
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4, marginBottom: 6 }}>{t(hintKey)}</div>
              {availableLabels.length > 0 ? (
                <select
                  value={(cfg.label_map[key] as string) ?? ""}
                  onChange={(e) => setLabelMap(key, e.target.value)}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  {!required && <option value="">{t("settingsLabelNotSet")}</option>}
                  {availableLabels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={(cfg.label_map[key] as string) ?? ""}
                  onChange={(e) => setLabelMap(key, e.target.value)}
                  placeholder={String(key)}
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </Section>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
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
            {t("settingsClose")}
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{
              padding: "7px 18px",
              borderRadius: 7,
              border: "none",
              fontSize: 13,
              cursor: "pointer",
              background: saved ? "#22c55e" : "#3b82f6",
              color: "#fff",
              transition: "background 0.2s",
            }}
          >
            {saved ? t("saved") : saving ? "…" : t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#94a3b8",
          letterSpacing: "0.06em",
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}

function InlineField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12, color: "#475569", width: 120, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const hintPara: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
};

const codeInHint: React.CSSProperties = {
  fontSize: 11,
  background: "#f1f5f9",
  padding: "1px 5px",
  borderRadius: 4,
  color: "#475569",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 12,
  border: "1.5px solid #e2e8f0",
  outline: "none",
  color: "#0f172a",
};

const presetBtn: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1.5px solid #e2e8f0",
  background: "#fff",
  fontSize: 11,
  color: "#475569",
  cursor: "pointer",
};

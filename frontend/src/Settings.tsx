import { useEffect, useRef, useState } from "react";
import {
  fetchConfig,
  saveConfig,
  testDatasource,
  discoverJobsForUrl,
  discoverLabelsForUrl,
  previewMetricSelector,
  type AppConfig,
  type Datasource,
  type DiscoveredJob,
  type KindRule,
  type MetricFilterOp,
  type MetricFilterRule,
  type MetricSelectorPreview,
  type ProbeJob,
} from "./api";
import { NODE_KINDS } from "./nodeKinds";
import { useI18n, type I18nKey } from "./i18n";
import { I18N_STABLE } from "./i18nLayout";
import { TrashIcon } from "./TrashIcon";
import { HoverTooltip } from "./Tooltip";

const DEFAULT_DATASOURCE_NAME = "Prometheus";

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
  const kindRules = (c.kind_rules ?? []).map((r) => ({
    label: (r.label ?? "").trim(),
    value: (r.value ?? "").trim(),
    kind: (r.kind ?? "").trim(),
  }));
  const rawDs = c.datasource;
  const name = (rawDs?.name ?? "").trim() || DEFAULT_DATASOURCE_NAME;
  const datasource: Datasource = rawDs
    ? { ...rawDs, name, url: rawDs.url ?? "", type: rawDs.type || "victoriametrics" }
    : { name: DEFAULT_DATASOURCE_NAME, type: "victoriametrics", url: "" };
  return {
    ...c,
    datasource,
    datasource_url_from_env: c.datasource_url_from_env === true,
    settings_targets_saved: c.settings_targets_saved === false ? false : true,
    label_map: normalizeLabelMap(c.label_map as AppConfig["label_map"] & { zone?: string }),
    metric_filter_rules: rules,
    kind_rules: kindRules,
  };
}

type CommittedSnapshot = {
  ds: { name: string; url: string };
  datasource_url_from_env: boolean;
  settings_targets_saved: boolean;
  probe_jobs: ProbeJob[];
  label_map: AppConfig["label_map"];
  metric_filter_rules: MetricFilterRule[];
  kind_rules: KindRule[];
};

function snapshotFromConfig(c: AppConfig): CommittedSnapshot {
  return {
    ds: {
      name: (c.datasource?.name ?? DEFAULT_DATASOURCE_NAME).trim() || DEFAULT_DATASOURCE_NAME,
      url: (c.datasource?.url ?? "").trim(),
    },
    datasource_url_from_env: c.datasource_url_from_env === true,
    settings_targets_saved: c.settings_targets_saved !== false,
    probe_jobs: JSON.parse(JSON.stringify(c.probe_jobs)) as ProbeJob[],
    label_map: JSON.parse(JSON.stringify(c.label_map)) as AppConfig["label_map"],
    metric_filter_rules: JSON.parse(JSON.stringify(c.metric_filter_rules ?? [])) as MetricFilterRule[],
    kind_rules: JSON.parse(JSON.stringify(c.kind_rules ?? [])) as KindRule[],
  };
}

function probeJobsEqual(a: ProbeJob[], b: ProbeJob[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => x.job === b[i]?.job && x.enabled === b[i]?.enabled);
}

function restEqualToCommitted(cfg: AppConfig, com: CommittedSnapshot): boolean {
  return (
    probeJobsEqual(cfg.probe_jobs, com.probe_jobs) &&
    JSON.stringify(cfg.label_map) === JSON.stringify(com.label_map) &&
    JSON.stringify(cfg.metric_filter_rules ?? []) === JSON.stringify(com.metric_filter_rules) &&
    JSON.stringify(cfg.kind_rules ?? []) === JSON.stringify(com.kind_rules)
  );
}

interface Props {
  onClose: () => void;
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
  const { t, lang } = useI18n();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [committed, setCommitted] = useState<CommittedSnapshot | null>(null);
  const [testState, setTestState] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [discoveredJobs, setDiscoveredJobs] = useState<DiscoveredJob[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [discoveryUrl, setDiscoveryUrl] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [savedFlash, setSavedFlash] = useState<"url" | "targets" | "advanced" | null>(null);
  const [selectorPreview, setSelectorPreview] = useState<MetricSelectorPreview | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const didBootstrapDiscovery = useRef(false);
  const discoveryRequestId = useRef(0);
  const [settingsHoverTip, setSettingsHoverTip] = useState<{ label: string; el: HTMLElement } | null>(null);
  const toggleSettingsTip = (label: string, el: HTMLElement) => {
    setSettingsHoverTip((prev) => (prev && prev.label === label ? null : { label, el }));
  };

  useEffect(() => {
    let cancelled = false;
    fetchConfig().then((raw) => {
      if (cancelled) return;
      const n = normalizeConfig(raw);
      setCfg(n);
      setCommitted(snapshotFromConfig(n));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDiscoveryMetadata = async (url: string, labelMap: AppConfig["label_map"]) => {
    const u = url.trim();
    if (!u) {
      discoveryRequestId.current += 1;
      setDiscoveredJobs([]);
      setAvailableLabels([]);
      setDiscoveryUrl(null);
      return;
    }
    const id = ++discoveryRequestId.current;
    try {
      const lm = normalizeLabelMap(labelMap as AppConfig["label_map"] & { zone?: string });
      const [jobs, labels] = await Promise.all([
        discoverJobsForUrl(u, lm),
        discoverLabelsForUrl(u),
      ]);
      if (id !== discoveryRequestId.current) return;
      setDiscoveredJobs(jobs);
      setAvailableLabels(labels);
      setDiscoveryUrl(u);
    } catch {
      if (id !== discoveryRequestId.current) return;
      setDiscoveredJobs([]);
      setAvailableLabels([]);
      setDiscoveryUrl(null);
    }
  };

  useEffect(() => {
    if (!cfg || !committed) return;
    if (didBootstrapDiscovery.current) return;
    didBootstrapDiscovery.current = true;
    const u = committed.ds.url;
    if (!u) return;
    void fetchDiscoveryMetadata(u, cfg.label_map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, committed]);

  useEffect(() => {
    if (!cfg) return;
    const handle = window.setTimeout(() => {
      const pairs = (projectFilterPairs ?? []).filter(
        (p) => p.label?.trim() && p.value != null && String(p.value).trim() !== "",
      );
      previewMetricSelector({
        probe_jobs: cfg.probe_jobs,
        metric_filter_rules: cfg.metric_filter_rules,
        ...(pairs.length > 0 ? { project_filter_pairs: pairs } : {}),
      })
        .then(setSelectorPreview)
        .catch(() => setSelectorPreview({ selector: "", example: "probe_success" }));
    }, 320);
    return () => window.clearTimeout(handle);
  }, [cfg, projectFilterPairs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!cfg || !committed) return null;

  const ds = cfg.datasource ?? {
    name: DEFAULT_DATASOURCE_NAME,
    type: "victoriametrics",
    url: "",
  };

  const urlFromEnv = cfg.datasource_url_from_env === true;
  const urlDirty =
    (ds.name ?? "").trim() !== committed.ds.name.trim() ||
    (!urlFromEnv && (ds.url ?? "").trim() !== committed.ds.url.trim());

  const targetsSavedOnServer = committed.settings_targets_saved;
  const showJobs = committed.ds.url.length > 0;
  const showAdvanced = showJobs && targetsSavedOnServer;

  const targetsDirty = showJobs && !targetsSavedOnServer && !probeJobsEqual(cfg.probe_jobs, committed.probe_jobs);

  const advancedDirty = showAdvanced && !restEqualToCommitted(cfg, committed);

  const showTargetsFooter = showJobs && !targetsSavedOnServer;

  const handleTest = async () => {
    setTestState("testing");
    const ok = await testDatasource(ds.url);
    setTestState(ok ? "ok" : "fail");
  };

  const handleCancelUrl = () => {
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            datasource: {
              ...prev.datasource!,
              name: committed.ds.name,
              url: committed.ds.url,
            },
          }
        : prev,
    );
    setTestState("idle");
  };

  const handleSaveUrl = async () => {
    const url = (ds.url ?? "").trim();
    if (!url) return;
    setSavingUrl(true);
    try {
      const lm = normalizeLabelMap(cfg.label_map as AppConfig["label_map"] & { zone?: string });
      const discovered = await discoverJobsForUrl(url, lm);
      const probe_jobs: ProbeJob[] = discovered.map((d) => ({ job: d.job, enabled: false }));
      await saveConfig({
        ...cfg,
        datasource: {
          ...ds,
          name: (ds.name ?? "").trim() || DEFAULT_DATASOURCE_NAME,
          url,
          type: ds.type || "victoriametrics",
        },
        probe_jobs,
        settings_targets_saved: false,
        metric_filter_rules: (cfg.metric_filter_rules ?? []).filter((r) => r.label.trim() && r.value.trim()),
      });
      const normalized = normalizeConfig(await fetchConfig());
      setCfg(normalized);
      setCommitted(snapshotFromConfig(normalized));
      setSavedFlash("url");
      setTimeout(() => setSavedFlash(null), 2000);
      setTestState("idle");
      await fetchDiscoveryMetadata(url, normalized.label_map);
    } finally {
      setSavingUrl(false);
    }
  };

  const handleCancelTargets = () => {
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            probe_jobs: JSON.parse(JSON.stringify(committed.probe_jobs)) as ProbeJob[],
          }
        : prev,
    );
  };

  const handleSaveTargets = async () => {
    setSavingTargets(true);
    try {
      await saveConfig({
        ...cfg,
        datasource: {
          ...ds,
          name: (ds.name ?? "").trim() || DEFAULT_DATASOURCE_NAME,
          url: (ds.url ?? "").trim(),
          type: ds.type || "victoriametrics",
        },
        probe_jobs: cfg.probe_jobs,
        settings_targets_saved: true,
        metric_filter_rules: (cfg.metric_filter_rules ?? []).filter((r) => r.label.trim() && r.value.trim()),
      });
      const normalized = normalizeConfig(await fetchConfig());
      setCfg(normalized);
      setCommitted(snapshotFromConfig(normalized));
      setSavedFlash("targets");
      setTimeout(() => setSavedFlash(null), 2000);
      await fetchDiscoveryMetadata((normalized.datasource?.url ?? "").trim(), normalized.label_map);
    } finally {
      setSavingTargets(false);
    }
  };

  const handleSaveAdvanced = async () => {
    setSavingAdvanced(true);
    try {
      const rules = (cfg.metric_filter_rules ?? [])
        .filter((r) => r.label.trim() && r.value.trim())
        .map((r) => ({
          label: r.label.trim(),
          value: r.value.trim(),
          op: r.op,
        }));
      const kindRules = (cfg.kind_rules ?? [])
        .filter((r) => r.label.trim() && r.value.trim() && r.kind.trim())
        .map((r) => ({
          label: r.label.trim(),
          value: r.value.trim(),
          kind: r.kind.trim(),
        }));
      await saveConfig({
        ...cfg,
        datasource: {
          ...ds,
          name: (ds.name ?? "").trim() || DEFAULT_DATASOURCE_NAME,
          url: (ds.url ?? "").trim(),
          type: ds.type || "victoriametrics",
        },
        metric_filter_rules: rules,
        kind_rules: kindRules,
        settings_targets_saved: true,
      });
      const normalized = normalizeConfig(await fetchConfig());
      setCfg(normalized);
      setCommitted(snapshotFromConfig(normalized));
      setSavedFlash("advanced");
      setTimeout(() => setSavedFlash(null), 2000);
      await fetchDiscoveryMetadata((normalized.datasource?.url ?? "").trim(), normalized.label_map);
    } finally {
      setSavingAdvanced(false);
    }
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
            metric_filter_rules: [...(prev.metric_filter_rules ?? []), { label, value, op }],
          }
        : prev,
    );

  const clearFilterRules = () =>
    setCfg((prev) => (prev ? { ...prev, metric_filter_rules: [] } : prev));

  const addKindRule = () =>
    setCfg((prev) =>
      prev
        ? { ...prev, kind_rules: [...(prev.kind_rules ?? []), { label: "", value: "", kind: "" }] }
        : prev,
    );

  const removeKindRule = (i: number) =>
    setCfg((prev) =>
      prev ? { ...prev, kind_rules: (prev.kind_rules ?? []).filter((_, j) => j !== i) } : prev,
    );

  const patchKindRule = (i: number, patch: Partial<KindRule>) =>
    setCfg((prev) => {
      if (!prev) return prev;
      const next = [...(prev.kind_rules ?? [])];
      next[i] = { ...next[i], ...patch };
      return { ...prev, kind_rules: next };
    });

  const setDs = (patch: Partial<typeof ds>) => {
    const nextDs = { ...ds, ...patch };
    const nu = (nextDs.url ?? "").trim();
    if (nu !== (discoveryUrl ?? "")) {
      discoveryRequestId.current += 1;
      setDiscoveredJobs([]);
      setAvailableLabels([]);
      setDiscoveryUrl(null);
      setTestState("idle");
    }
    setCfg((prev) => (prev ? { ...prev, datasource: nextDs } : prev));
  };

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

  const testColor = testState === "ok" ? "var(--probemap-status-ok-hover)" : testState === "fail" ? "var(--probemap-danger)" : "var(--probemap-text-muted)";
  const testLabel =
    testState === "testing"
      ? t("testChecking")
      : testState === "ok"
        ? t("testOk")
        : testState === "fail"
          ? t("testFail")
          : t("testCheck");

  const datasourceUrlHelpLabel = `${t("settingsDatasourceIntro")}\n\n${t("settingsCheckHint")}`;
  const jobsSectionHelpLabel = [
    `${t("settingsJobsA")}probe_success${t("settingsJobsB")}job${t("settingsJobsC")}`,
    !targetsSavedOnServer ? t("settingsJobsStepHint") : null,
    (ds.url ?? "").trim() !== "" && (ds.url ?? "").trim() !== (discoveryUrl ?? "").trim()
      ? t("settingsNeedRecheckHint")
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

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
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "var(--probemap-text)",
              flex: 1,
              minWidth: 0,
              minHeight: I18N_STABLE.modalTitleMinHeightPx,
              display: "flex",
              alignItems: "center",
            }}
          >
            {t("settings")}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              color: "var(--probemap-text-faint)",
              cursor: "pointer",
              padding: 0,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        <Section title={t("settingsSectionDatasource")}>
          <InlineField label={t("settingsName")}>
            <input value={ds.name} onChange={(e) => setDs({ name: e.target.value })} style={inputStyle} />
          </InlineField>
          {urlFromEnv ? (
            <div
              style={{
                fontSize: 12,
                lineHeight: 1.45,
                color: "var(--probemap-text-muted)",
                marginBottom: 10,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--probemap-border)",
                background: "var(--probemap-bg-subtle)",
              }}
            >
              {t("settingsUrlFromEnvHint")}
            </div>
          ) : null}
          <InlineField label={t("settingsUrlApi")}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div
                style={{ flex: 1, minWidth: 0 }}
                onMouseEnter={(e) => {
                  setSettingsHoverTip({ label: datasourceUrlHelpLabel, el: e.currentTarget });
                }}
                onMouseLeave={() => setSettingsHoverTip(null)}
              >
                <input
                  value={ds.url}
                  readOnly={urlFromEnv}
                  onChange={(e) => setDs({ url: e.target.value })}
                  placeholder={t("settingsUrlPlaceholder")}
                  style={{
                    ...inputStyle,
                    ...(urlFromEnv
                      ? { opacity: 0.92, cursor: "not-allowed" }
                      : {}),
                  }}
                  aria-readonly={urlFromEnv || undefined}
                />
                {urlDirty ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
                    <button
                      type="button"
                      onClick={handleCancelUrl}
                      disabled={savingUrl}
                      className="probemap-btn probemap-btn--ghost probemap-btn--md"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveUrl()}
                      disabled={savingUrl || !(ds.url ?? "").trim()}
                      className={`probemap-btn probemap-btn--primary probemap-btn--md${savedFlash === "url" ? " probemap-btn--success" : ""}`}
                    >
                      {savedFlash === "url" ? t("saved") : savingUrl ? "…" : t("save")}
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={!ds.url?.trim() || testState === "testing"}
                className="probemap-btn probemap-btn--outline-dynamic"
                style={{ borderColor: testColor, color: testColor }}
              >
                {testLabel}
              </button>
            </div>
          </InlineField>
        </Section>

        {showJobs ? (
          <Section
            title={
              <span
                style={{ cursor: "help" }}
                onMouseEnter={(e) => {
                  setSettingsHoverTip({ label: jobsSectionHelpLabel, el: e.currentTarget });
                }}
                onMouseLeave={() => setSettingsHoverTip(null)}
              >
                {t("settingsSectionJobs")}
              </span>
            }
          >
            {cfg.probe_jobs.length === 0 && discoveredJobs.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--probemap-text-faint)" }}>{t("settingsJobsLoading")}</div>
            ) : cfg.probe_jobs.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--probemap-text-faint)" }}>{t("settingsJobsEmptyVm")}</div>
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
                      <span
                        style={{
                          fontSize: 13,
                          color: "var(--probemap-text)",
                          flex: 1,
                          fontFamily: "monospace",
                        }}
                      >
                        {j.job}
                      </span>
                      {info && (
                        <span style={{ fontSize: 11, color: "var(--probemap-text-faint)" }}>
                          {t("settingsJobSources")} {info.probe_sources.join(", ") || t("emDash")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {showTargetsFooter ? (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                {targetsDirty ? (
                  <button
                    type="button"
                    onClick={handleCancelTargets}
                    disabled={savingTargets}
                    className="probemap-btn probemap-btn--ghost probemap-btn--md"
                  >
                    {t("cancel")}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleSaveTargets()}
                  disabled={savingTargets}
                  className={`probemap-btn probemap-btn--primary probemap-btn--md${savedFlash === "targets" ? " probemap-btn--success" : ""}`}
                >
                  {savedFlash === "targets" ? t("saved") : savingTargets ? "…" : t("save")}
                </button>
              </div>
            ) : null}
          </Section>
        ) : null}

        {showAdvanced ? (
          <>
            <Section
              title={
                <span
                  className="probemap-settings-tip-title"
                  style={{ letterSpacing: "inherit" }}
                  onMouseEnter={(e) => {
                    setSettingsHoverTip({ label: t("settingsFilterIntro"), el: e.currentTarget });
                  }}
                  onMouseLeave={() => setSettingsHoverTip(null)}
                >
                  {t("settingsSectionFilter")}
                </span>
              }
            >
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                <button
                  type="button"
                  onClick={() => applyPreset("environment", "prod", "eq")}
                  className="probemap-btn probemap-btn--preset"
                >
                  {t("settingsPresetEnvProd")}
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("environment", "staging", "ne")}
                  className="probemap-btn probemap-btn--preset"
                >
                  {t("settingsPresetEnvStaging")}
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("team", "platform.*", "re")}
                  className="probemap-btn probemap-btn--preset"
                >
                  {t("settingsPresetTeam")}
                </button>
                <button
                  type="button"
                  onClick={clearFilterRules}
                  className="probemap-btn probemap-btn--preset probemap-btn--preset-muted"
                >
                  {t("settingsFilterClear")}
                </button>
              </div>
              {(cfg.metric_filter_rules ?? []).length === 0 ? null : (
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
                        onChange={(e) => patchFilterRule(i, { op: e.target.value as MetricFilterOp })}
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
                        className="probemap-btn probemap-btn--icon-plain"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={addFilterRule}
                className="probemap-btn probemap-btn--preset"
                style={{ marginBottom: 14 }}
              >
                {t("settingsFilterAddRule")}
              </button>

              <div
                style={{
                  background: "var(--probemap-bg-muted)",
                  border: "1.5px solid var(--probemap-border)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 14,
                }}
              >
                <span
                  className="probemap-settings-tip-title"
                  style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--probemap-text-faint)",
                    letterSpacing: "0.06em",
                    marginBottom: 6,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    setSettingsHoverTip({ label: t("settingsSelectorPreviewHint"), el: e.currentTarget });
                  }}
                  onMouseLeave={() => setSettingsHoverTip(null)}
                  onClick={(e) => toggleSettingsTip(t("settingsSelectorPreviewHint"), e.currentTarget)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSettingsTip(t("settingsSelectorPreviewHint"), e.currentTarget as unknown as HTMLElement);
                    }
                  }}
                >
                  {t("settingsSelectorPreviewTitle")}
                </span>
                <code
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "var(--probemap-text)",
                    wordBreak: "break-all",
                    lineHeight: 1.45,
                    fontFamily: "ui-monospace, monospace",
                  }}
                >
                  {selectorPreview?.example ?? t("ellipsis")}
                </code>
              </div>
            </Section>

            <Section
              title={
                <span
                  className="probemap-settings-tip-title"
                  style={{ letterSpacing: "inherit", cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    setSettingsHoverTip({ label: t("settingsLabelMapIntro"), el: e.currentTarget });
                  }}
                  onMouseLeave={() => setSettingsHoverTip(null)}
                  onClick={(e) => toggleSettingsTip(t("settingsLabelMapIntro"), e.currentTarget)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSettingsTip(t("settingsLabelMapIntro"), e.currentTarget as unknown as HTMLElement);
                    }
                  }}
                >
                  {t("settingsSectionLabelMap")}
                </span>
              }
            >
              {LABEL_FIELD_KEYS.map(({ key, titleKey, hintKey, required }) => (
                <div
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(96px, 40%) minmax(0, 1fr)",
                    gap: 10,
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <span
                    className="probemap-settings-tip-title"
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--probemap-text-secondary)",
                      lineHeight: 1.35,
                    }}
                    onMouseEnter={(e) => {
                      setSettingsHoverTip({ label: t(hintKey), el: e.currentTarget });
                    }}
                    onMouseLeave={() => setSettingsHoverTip(null)}
                  >
                    {t(titleKey)}
                  </span>
                  <div style={{ minWidth: 0 }}>
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
                </div>
              ))}
            </Section>

            <Section
              title={
                <span
                  className="probemap-settings-tip-title"
                  style={{ letterSpacing: "inherit", cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    setSettingsHoverTip({ label: t("settingsKindRulesIntro"), el: e.currentTarget });
                  }}
                  onMouseLeave={() => setSettingsHoverTip(null)}
                  onClick={(e) => toggleSettingsTip(t("settingsKindRulesIntro"), e.currentTarget)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleSettingsTip(t("settingsKindRulesIntro"), e.currentTarget as unknown as HTMLElement);
                    }
                  }}
                >
                  {t("settingsSectionKindRules")}
                </span>
              }
            >
              {(cfg.kind_rules ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                  {(cfg.kind_rules ?? []).map((row, i) => (
                    <div
                      key={i}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(100px, 1fr) 24px minmax(100px, 1fr) minmax(120px, 1fr) 36px",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      {availableLabels.length > 0 ? (
                        <select
                          value={row.label}
                          onChange={(e) => patchKindRule(i, { label: e.target.value })}
                          style={{ ...inputStyle, cursor: "pointer" }}
                        >
                          <option value="">{t("settingsKindRulesLabelPlaceholder")}</option>
                          {availableLabels.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={row.label}
                          onChange={(e) => patchKindRule(i, { label: e.target.value })}
                          placeholder={t("settingsKindRulesLabelPlaceholder")}
                          style={inputStyle}
                        />
                      )}
                      <span style={{ textAlign: "center", fontSize: 12, color: "var(--probemap-text-faint)" }}>
                        {t("settingsKindRulesArrow")}
                      </span>
                      <input
                        value={row.value}
                        onChange={(e) => patchKindRule(i, { value: e.target.value })}
                        placeholder={t("settingsKindRulesValuePlaceholder")}
                        style={inputStyle}
                      />
                      <select
                        value={row.kind}
                        onChange={(e) => patchKindRule(i, { kind: e.target.value })}
                        style={{ ...inputStyle, cursor: "pointer" }}
                      >
                        <option value="">{t("settingsKindRulesKindPlaceholder")}</option>
                        {NODE_KINDS.map((k) => (
                          <option key={k.kind} value={k.kind}>{k.label[lang as "ru" | "en"] ?? k.label.ru}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeKindRule(i)}
                        title={t("delete")}
                        className="probemap-btn probemap-btn--icon-plain"
                      >
                        <TrashIcon size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={addKindRule}
                className="probemap-btn probemap-btn--preset"
              >
                {t("settingsKindRulesAddRule")}
              </button>
            </Section>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
              <button type="button" onClick={onClose} className="probemap-btn probemap-btn--ghost probemap-btn--md">
                {t("settingsClose")}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAdvanced()}
                disabled={savingAdvanced || !advancedDirty}
                className={`probemap-btn probemap-btn--primary probemap-btn--md${savedFlash === "advanced" ? " probemap-btn--success" : ""}`}
                style={{ opacity: advancedDirty ? 1 : 0.5 }}
              >
                {savedFlash === "advanced" ? t("saved") : savingAdvanced ? "…" : t("save")}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {settingsHoverTip && (
        <HoverTooltip
          label={settingsHoverTip.label}
          targetEl={settingsHoverTip.el}
          multiline
          placement="below"
        />
      )}
    </div>
  );
}

function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "var(--probemap-text-faint)",
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
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span
        style={{
          fontSize: 12,
          color: "var(--probemap-text-secondary)",
          width: 120,
          flexShrink: 0,
          paddingTop: 6,
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "5px 10px",
  borderRadius: 6,
  fontSize: 12,
  border: "1.5px solid var(--probemap-border)",
  outline: "none",
  background: "var(--probemap-input-bg)",
  color: "var(--probemap-text)",
};


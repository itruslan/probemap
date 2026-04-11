import { useEffect, useRef, useState } from "react";
import {
  fetchConfig,
  saveConfig,
  testDatasource,
  discoverJobsForUrl,
  discoverLabelsForUrl,
  previewMetricSelector,
  fetchIcons,
  uploadIcon,
  deleteIcon,
  type AppConfig,
  type CustomIcon,
  type Datasource,
  type DiscoveredJob,
  type MetricFilterOp,
  type MetricFilterRule,
  type MetricSelectorPreview,
  type ProbeJob,
} from "./api";

const BASE = import.meta.env.VITE_API_URL ?? "";
import { useI18n, type I18nKey } from "./i18n";
import { I18N_STABLE } from "./i18nLayout";
import { TrashIcon } from "./TrashIcon";
import { HoverTooltip, HelpIcon } from "./Tooltip";

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
  const probe_source =
    (lm.probe_source || lm.zone || "instance").trim() || "instance";
  const raw_nl = lm.name_labels;
  const name_labels =
    Array.isArray(raw_nl) && raw_nl.length > 0
      ? (raw_nl as string[]).filter((l) => typeof l === "string" && l.trim())
      : null;
  return {
    service: lm.service ?? "service",
    port: lm.port ?? "port",
    probe_source,
    module: lm.module ?? "module",
    endpoint_label: lm.endpoint_label ?? null,
    name_labels: name_labels ?? null,
  };
}

function normalizeConfig(c: AppConfig): AppConfig {
  const rules = (c.metric_filter_rules ?? []).map((r) => ({
    label: (r.label ?? "").trim(),
    value: (r.value ?? "").trim(),
    op: (["eq", "re", "ne", "nre"].includes(r.op)
      ? r.op
      : "eq") as MetricFilterOp,
  }));
  const rawDs = c.datasource;
  const name = (rawDs?.name ?? "").trim() || DEFAULT_DATASOURCE_NAME;
  const datasource: Datasource = rawDs
    ? {
        ...rawDs,
        name,
        url: rawDs.url ?? "",
        type: rawDs.type || "victoriametrics",
      }
    : { name: DEFAULT_DATASOURCE_NAME, type: "victoriametrics", url: "" };
  return {
    ...c,
    datasource,
    datasource_url_from_env: c.datasource_url_from_env === true,
    settings_targets_saved: c.settings_targets_saved === false ? false : true,
    label_map: normalizeLabelMap(
      c.label_map as AppConfig["label_map"] & { zone?: string },
    ),
    metric_filter_rules: rules,
  };
}

type CommittedSnapshot = {
  ds: { name: string; url: string };
  datasource_url_from_env: boolean;
  settings_targets_saved: boolean;
  probe_jobs: ProbeJob[];
  label_map: AppConfig["label_map"];
  metric_filter_rules: MetricFilterRule[];
};

function snapshotFromConfig(c: AppConfig): CommittedSnapshot {
  return {
    ds: {
      name:
        (c.datasource?.name ?? DEFAULT_DATASOURCE_NAME).trim() ||
        DEFAULT_DATASOURCE_NAME,
      url: (c.datasource?.url ?? "").trim(),
    },
    datasource_url_from_env: c.datasource_url_from_env === true,
    settings_targets_saved: c.settings_targets_saved !== false,
    probe_jobs: JSON.parse(JSON.stringify(c.probe_jobs)) as ProbeJob[],
    label_map: JSON.parse(
      JSON.stringify(c.label_map),
    ) as AppConfig["label_map"],
    metric_filter_rules: JSON.parse(
      JSON.stringify(c.metric_filter_rules ?? []),
    ) as MetricFilterRule[],
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
    JSON.stringify(cfg.metric_filter_rules ?? []) ===
      JSON.stringify(com.metric_filter_rules)
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
  {
    key: "service",
    titleKey: "labelMapServiceTitle",
    hintKey: "labelMapServiceHint",
    required: true,
  },
  {
    key: "port",
    titleKey: "labelMapPortTitle",
    hintKey: "labelMapPortHint",
    required: true,
  },
  {
    key: "probe_source",
    titleKey: "labelMapProbeSourceTitle",
    hintKey: "labelMapProbeSourceHint",
    required: true,
  },
  {
    key: "module",
    titleKey: "labelMapModuleTitle",
    hintKey: "labelMapModuleHint",
    required: true,
  },
  {
    key: "endpoint_label",
    titleKey: "labelMapEndpointTitle",
    hintKey: "labelMapEndpointHint",
    required: false,
  },
];

export function Settings({ onClose, projectFilterPairs }: Props) {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [committed, setCommitted] = useState<CommittedSnapshot | null>(null);
  const [testState, setTestState] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");
  const [discoveredJobs, setDiscoveredJobs] = useState<DiscoveredJob[]>([]);
  const [availableLabels, setAvailableLabels] = useState<string[]>([]);
  const [discoveryUrl, setDiscoveryUrl] = useState<string | null>(null);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingTargets, setSavingTargets] = useState(false);
  const [savingAdvanced, setSavingAdvanced] = useState(false);
  const [savedFlash, setSavedFlash] = useState<
    "url" | "targets" | "advanced" | null
  >(null);
  const [selectorPreview, setSelectorPreview] =
    useState<MetricSelectorPreview | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const didBootstrapDiscovery = useRef(false);
  const discoveryRequestId = useRef(0);
  const [customIcons, setCustomIcons] = useState<CustomIcon[]>([]);
  const [pendingIconFile, setPendingIconFile] = useState<File | null>(null);
  const [pendingIconName, setPendingIconName] = useState("");
  const [iconNameError, setIconNameError] = useState(false);
  const iconFileRef = useRef<HTMLInputElement>(null);
  const [addingFilter, setAddingFilter] = useState(false);
  const [draftFilterLabel, setDraftFilterLabel] = useState("");
  const [draftFilterOp, setDraftFilterOp] = useState<MetricFilterOp>("eq");
  const [draftFilterValue, setDraftFilterValue] = useState("");
  const [draftNameLabel, setDraftNameLabel] = useState("");
  const [settingsHoverTip, setSettingsHoverTip] = useState<{
    label: string;
    el: HTMLElement;
  } | null>(null);
  const toggleSettingsTip = (label: string, el: HTMLElement) => {
    setSettingsHoverTip((prev) =>
      prev && prev.label === label ? null : { label, el },
    );
  };

  useEffect(() => {
    fetchIcons()
      .then(setCustomIcons)
      .catch(() => {});
  }, []);

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

  const fetchDiscoveryMetadata = async (
    url: string,
    labelMap: AppConfig["label_map"],
  ) => {
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
      const lm = normalizeLabelMap(
        labelMap as AppConfig["label_map"] & { zone?: string },
      );
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
        (p) =>
          p.label?.trim() && p.value != null && String(p.value).trim() !== "",
      );
      previewMetricSelector({
        probe_jobs: cfg.probe_jobs,
        metric_filter_rules: cfg.metric_filter_rules,
        ...(pairs.length > 0 ? { project_filter_pairs: pairs } : {}),
      })
        .then(setSelectorPreview)
        .catch(() =>
          setSelectorPreview({ selector: "", example: "probe_success" }),
        );
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

  const targetsDirty =
    showJobs &&
    !targetsSavedOnServer &&
    !probeJobsEqual(cfg.probe_jobs, committed.probe_jobs);

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
      const lm = normalizeLabelMap(
        cfg.label_map as AppConfig["label_map"] & { zone?: string },
      );
      const discovered = await discoverJobsForUrl(url, lm);
      const probe_jobs: ProbeJob[] = discovered.map((d) => ({
        job: d.job,
        enabled: false,
      }));
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
        metric_filter_rules: (cfg.metric_filter_rules ?? []).filter(
          (r) => r.label.trim() && r.value.trim(),
        ),
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
            probe_jobs: JSON.parse(
              JSON.stringify(committed.probe_jobs),
            ) as ProbeJob[],
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
        metric_filter_rules: (cfg.metric_filter_rules ?? []).filter(
          (r) => r.label.trim() && r.value.trim(),
        ),
      });
      const normalized = normalizeConfig(await fetchConfig());
      setCfg(normalized);
      setCommitted(snapshotFromConfig(normalized));
      setSavedFlash("targets");
      setTimeout(() => setSavedFlash(null), 2000);
      await fetchDiscoveryMetadata(
        (normalized.datasource?.url ?? "").trim(),
        normalized.label_map,
      );
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
      await saveConfig({
        ...cfg,
        datasource: {
          ...ds,
          name: (ds.name ?? "").trim() || DEFAULT_DATASOURCE_NAME,
          url: (ds.url ?? "").trim(),
          type: ds.type || "victoriametrics",
        },
        metric_filter_rules: rules,
        settings_targets_saved: true,
      });
      const normalized = normalizeConfig(await fetchConfig());
      setCfg(normalized);
      setCommitted(snapshotFromConfig(normalized));
      setSavedFlash("advanced");
      setTimeout(() => setSavedFlash(null), 2000);
      await fetchDiscoveryMetadata(
        (normalized.datasource?.url ?? "").trim(),
        normalized.label_map,
      );
    } finally {
      setSavingAdvanced(false);
    }
  };

  const removeFilterRule = (i: number) =>
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            metric_filter_rules: (prev.metric_filter_rules ?? []).filter(
              (_, j) => j !== i,
            ),
          }
        : prev,
    );

  const clearFilterRules = () =>
    setCfg((prev) => (prev ? { ...prev, metric_filter_rules: [] } : prev));

  const opSymbol = (op: MetricFilterOp) =>
    ({ eq: "=", ne: "≠", re: "=~", nre: "!~" })[op] ?? "=";

  const commitDraftFilter = () => {
    if (!draftFilterLabel.trim() || !draftFilterValue.trim()) return;
    setCfg((prev) =>
      prev
        ? {
            ...prev,
            metric_filter_rules: [
              ...(prev.metric_filter_rules ?? []),
              { label: draftFilterLabel.trim(), value: draftFilterValue.trim(), op: draftFilterOp },
            ],
          }
        : prev,
    );
    setDraftFilterLabel("");
    setDraftFilterOp("eq");
    setDraftFilterValue("");
    setAddingFilter(false);
  };

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
      prev
        ? { ...prev, label_map: { ...prev.label_map, [key]: value || null } }
        : prev,
    );

  const addNameLabel = (label: string) => {
    const l = label.trim();
    if (!l) return;
    setCfg((prev) => {
      if (!prev) return prev;
      const current = prev.label_map.name_labels ?? [];
      if (current.includes(l)) return prev;
      return { ...prev, label_map: { ...prev.label_map, name_labels: [...current, l] } };
    });
  };

  const removeNameLabel = (label: string) =>
    setCfg((prev) => {
      if (!prev) return prev;
      const next = (prev.label_map.name_labels ?? []).filter((l) => l !== label);
      return { ...prev, label_map: { ...prev.label_map, name_labels: next.length ? next : null } };
    });

  const testColor =
    testState === "ok"
      ? "var(--probemap-status-ok-hover)"
      : testState === "fail"
        ? "var(--probemap-danger)"
        : "var(--probemap-text-muted)";
  const testLabel =
    testState === "testing"
      ? t("testChecking")
      : testState === "ok"
        ? t("testOk")
        : testState === "fail"
          ? t("testFail")
          : t("testCheck");

  const datasourceUrlHelpLabel = urlFromEnv
    ? `${t("settingsDatasourceIntro")}\n\n${t("settingsCheckHint")}\n\n${t("settingsUrlFromEnvHint")}`
    : `${t("settingsDatasourceIntro")}\n\n${t("settingsCheckHint")}`;
  const jobsSectionHelpLabel = [
    `${t("settingsJobsA")}probe_success${t("settingsJobsB")}job${t("settingsJobsC")}`,
    !targetsSavedOnServer ? t("settingsJobsStepHint") : null,
    (ds.url ?? "").trim() !== "" &&
    (ds.url ?? "").trim() !== (discoveryUrl ?? "").trim()
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
        role="dialog"
        aria-modal="true"
        aria-label={t("settings")}
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
            aria-label={t("settingsClose")}
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
            <input
              value={ds.name}
              onChange={(e) => setDs({ name: e.target.value })}
              style={inputStyle}
            />
          </InlineField>
          <InlineField label={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {t("settingsUrlApi")}
              <HelpIcon
                aria={t("tooltipInfoAria")}
                onMouseEnter={(el) => setSettingsHoverTip({ label: datasourceUrlHelpLabel, el })}
                onMouseLeave={() => setSettingsHoverTip(null)}
                onClick={(el) => toggleSettingsTip(datasourceUrlHelpLabel, el)}
              />
            </span>
          }>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <input
                  value={ds.url}
                  disabled={urlFromEnv}
                  onChange={(e) => setDs({ url: e.target.value })}
                  placeholder={t("settingsUrlPlaceholder")}
                  style={{
                    ...inputStyle,
                    ...(urlFromEnv
                      ? { opacity: 0.6, cursor: "not-allowed" }
                      : {}),
                  }}
                />
                {urlDirty ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 10,
                      marginTop: 10,
                    }}
                  >
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
                      {savedFlash === "url"
                        ? t("saved")
                        : savingUrl
                          ? "…"
                          : t("save")}
                    </button>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={
                  !ds.url?.trim() || testState === "testing" || urlFromEnv
                }
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
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {t("settingsSectionJobs")}
                <HelpIcon
                  aria={t("tooltipInfoAria")}
                  onMouseEnter={(el) =>
                    setSettingsHoverTip({ label: jobsSectionHelpLabel, el })
                  }
                  onMouseLeave={() => setSettingsHoverTip(null)}
                  onClick={(el) => toggleSettingsTip(jobsSectionHelpLabel, el)}
                />
              </span>
            }
          >
            {cfg.probe_jobs.length === 0 && discoveredJobs.length === 0 ? (
              <div
                style={{ fontSize: 12, color: "var(--probemap-text-faint)" }}
              >
                {t("settingsJobsLoading")}
              </div>
            ) : cfg.probe_jobs.length === 0 ? (
              <div
                style={{ fontSize: 12, color: "var(--probemap-text-faint)" }}
              >
                {t("settingsJobsEmptyVm")}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cfg.probe_jobs.map((j) => {
                  const info = discoveredJobs.find((d) => d.job === j.job);
                  return (
                    <label
                      key={j.job}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        cursor: "pointer",
                      }}
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
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--probemap-text-faint)",
                          }}
                        >
                          {t("settingsJobSources")}{" "}
                          {info.probe_sources.join(", ") || t("emDash")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {showTargetsFooter ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  marginTop: 12,
                }}
              >
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
                  {savedFlash === "targets"
                    ? t("saved")
                    : savingTargets
                      ? "…"
                      : t("save")}
                </button>
              </div>
            ) : null}
          </Section>
        ) : null}

        {showAdvanced ? (
          <>
            <Section
              title={
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {t("settingsSectionFilter")}
                    <HelpIcon
                      aria={t("tooltipInfoAria")}
                      onMouseEnter={(el) => setSettingsHoverTip({ label: t("settingsFilterIntro"), el })}
                      onMouseLeave={() => setSettingsHoverTip(null)}
                      onClick={(el) => toggleSettingsTip(t("settingsFilterIntro"), el)}
                    />
                  </span>
                  {(cfg.metric_filter_rules ?? []).length > 0 && (
                    <button
                      type="button"
                      onClick={clearFilterRules}
                      style={{ background: "none", border: "none", color: "var(--probemap-text-faint)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", padding: 0 }}
                    >
                      {t("settingsFilterClear")}
                    </button>
                  )}
                </span>
              }
            >
              {/* Chips */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(cfg.metric_filter_rules ?? []).map((row, i) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      height: 24,
                      padding: "0 8px",
                      borderRadius: 6,
                      border: "1px solid var(--probemap-border)",
                      background: "var(--probemap-bg-subtle)",
                      fontSize: 11,
                      fontFamily: "ui-monospace, monospace",
                      color: "var(--probemap-text)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ color: "var(--probemap-blue)", fontFamily: "inherit" }}>+</span>
                    {row.label}{opSymbol(row.op)}{row.value}
                    <button
                      type="button"
                      onClick={() => removeFilterRule(i)}
                      style={{ background: "none", border: "none", color: "var(--probemap-text-faint)", cursor: "pointer", fontSize: 10, padding: 0, lineHeight: 1, marginLeft: 2 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {!addingFilter && (
                  <button
                    type="button"
                    onClick={() => setAddingFilter(true)}
                    style={{
                      height: 24, padding: "0 8px", borderRadius: 6,
                      border: "1px dashed var(--probemap-border)",
                      background: "transparent", color: "var(--probemap-blue)",
                      fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {t("settingsFilterAddRule")}
                  </button>
                )}
              </div>

              {/* Inline add form */}
              {addingFilter && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  {availableLabels.length > 0 ? (
                    <select
                      autoFocus
                      value={draftFilterLabel}
                      onChange={(e) => setDraftFilterLabel(e.target.value)}
                      style={{ ...inputStyle, flex: 1, minWidth: 100, cursor: "pointer" }}
                    >
                      <option value="">{t("settingsFilterLabelOption")}</option>
                      {availableLabels.map((l) => (
                        <option key={l} value={l}>{l}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      autoFocus
                      value={draftFilterLabel}
                      onChange={(e) => setDraftFilterLabel(e.target.value)}
                      placeholder={t("placeholderEnvironment")}
                      style={{ ...inputStyle, flex: 1, minWidth: 100 }}
                    />
                  )}
                  <select
                    value={draftFilterOp}
                    onChange={(e) => setDraftFilterOp(e.target.value as MetricFilterOp)}
                    style={{ ...inputStyle, width: 80, cursor: "pointer", fontSize: 11 }}
                  >
                    {OP_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                  <input
                    value={draftFilterValue}
                    onChange={(e) => setDraftFilterValue(e.target.value)}
                    placeholder={t("settingsFilterValuePlaceholder")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitDraftFilter();
                      if (e.key === "Escape") { setAddingFilter(false); setDraftFilterLabel(""); setDraftFilterValue(""); }
                    }}
                    style={{ ...inputStyle, flex: 1, minWidth: 100 }}
                  />
                  <button type="button" onClick={commitDraftFilter} className="probemap-btn probemap-btn--primary probemap-btn--xs">
                    {t("uiOk")}
                  </button>
                  <button type="button" onClick={() => { setAddingFilter(false); setDraftFilterLabel(""); setDraftFilterValue(""); }} className="probemap-btn probemap-btn--ghost probemap-btn--xs">
                    ✕
                  </button>
                </div>
              )}

              {/* Selector preview */}
              <div
                style={{
                  background: "var(--probemap-bg-muted)",
                  border: "1.5px solid var(--probemap-border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <span
                  style={{ fontSize: 10, fontWeight: 700, color: "var(--probemap-text-faint)", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}
                >
                  {t("settingsSelectorPreviewTitle")}
                </span>
                <code style={{ display: "block", fontSize: 12, color: "var(--probemap-text)", wordBreak: "break-all", lineHeight: 1.45, fontFamily: "ui-monospace, monospace" }}>
                  {selectorPreview?.example ?? t("ellipsis")}
                </code>
              </div>
            </Section>

            <Section
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {t("settingsSectionLabelMap")}
                  <HelpIcon
                    aria={t("tooltipInfoAria")}
                    onMouseEnter={(el) =>
                      setSettingsHoverTip({
                        label: t("settingsLabelMapIntro"),
                        el,
                      })
                    }
                    onMouseLeave={() => setSettingsHoverTip(null)}
                    onClick={(el) =>
                      toggleSettingsTip(t("settingsLabelMapIntro"), el)
                    }
                  />
                </span>
              }
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {LABEL_FIELD_KEYS.map(({ key, titleKey, hintKey, required }) => (
                  <div
                    key={key}
                    style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
                  >
                    {/* Field label — fixed width */}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--probemap-text-faint)",
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        flexShrink: 0,
                        width: 136,
                      }}
                    >
                      {t(titleKey)}
                      <HelpIcon
                        aria={t("tooltipInfoAria")}
                        onMouseEnter={(el) =>
                          setSettingsHoverTip({ label: t(hintKey), el })
                        }
                        onMouseLeave={() => setSettingsHoverTip(null)}
                      />
                    </span>

                    {/* Service field: primary editable tag + name_labels extra tags + [+] */}
                    {key === "service" ? (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          flex: 1,
                          flexWrap: "wrap",
                        }}
                      >
                        {/* Primary service label — editable, looks like a tag */}
                        {availableLabels.length > 0 ? (
                          <select
                            value={cfg.label_map.service ?? ""}
                            onChange={(e) => setLabelMap("service", e.target.value)}
                            style={{
                              ...tagSelectStyle,
                              fontWeight: 600,
                            }}
                          >
                            {availableLabels.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={cfg.label_map.service ?? ""}
                            onChange={(e) => setLabelMap("service", e.target.value)}
                            style={{ ...tagInputStyle, fontWeight: 600, width: 80 }}
                          />
                        )}

                        {/* Extra name_labels tags */}
                        {(cfg.label_map.name_labels ?? []).map((lbl) => (
                          <span key={lbl} style={tagPillStyle}>
                            {lbl}
                            <button
                              type="button"
                              onClick={() => removeNameLabel(lbl)}
                              style={tagRemoveBtnStyle}
                            >
                              ×
                            </button>
                          </span>
                        ))}

                        {/* Add extra label */}
                        {availableLabels.length > 0 ? (
                          <select
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                addNameLabel(e.target.value);
                                e.target.value = "";
                              }
                            }}
                            title={t("labelMapNameLabelsAdd")}
                            style={{ ...tagSelectStyle, color: "var(--probemap-text-faint)" }}
                          >
                            <option value="">+</option>
                            {availableLabels
                              .filter(
                                (l) =>
                                  l !== cfg.label_map.service &&
                                  !(cfg.label_map.name_labels ?? []).includes(l),
                              )
                              .map((l) => (
                                <option key={l} value={l}>{l}</option>
                              ))}
                          </select>
                        ) : (
                          <input
                            value={draftNameLabel}
                            onChange={(e) => setDraftNameLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && draftNameLabel.trim()) {
                                addNameLabel(draftNameLabel);
                                setDraftNameLabel("");
                              }
                            }}
                            placeholder="+"
                            title={t("labelMapNameLabelsAdd")}
                            style={{ ...tagInputStyle, width: 36, textAlign: "center" }}
                          />
                        )}
                      </div>
                    ) : (
                      /* All other fields — plain select or input */
                      availableLabels.length > 0 ? (
                        <select
                          value={(cfg.label_map[key] as string) ?? ""}
                          onChange={(e) => setLabelMap(key, e.target.value)}
                          style={{
                            ...inputStyle,
                            cursor: "pointer",
                            fontSize: 12,
                            padding: "4px 8px",
                            flex: 1,
                          }}
                        >
                          {!required && (
                            <option value="">{t("settingsLabelNotSet")}</option>
                          )}
                          {availableLabels.map((l) => (
                            <option key={l} value={l}>{l}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={(cfg.label_map[key] as string) ?? ""}
                          onChange={(e) => setLabelMap(key, e.target.value)}
                          placeholder={String(key)}
                          style={{
                            ...inputStyle,
                            fontSize: 12,
                            padding: "4px 8px",
                            flex: 1,
                          }}
                        />
                      )
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title={
                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {t("iconSectionCustom")}
                  <HelpIcon
                    aria={t("tooltipInfoAria")}
                    onMouseEnter={(el) =>
                      setSettingsHoverTip({
                        label: t("iconSectionCustomHint"),
                        el,
                      })
                    }
                    onMouseLeave={() => setSettingsHoverTip(null)}
                  />
                </span>
              }
            >
              {/* Icon grid: existing icons + upload button as last cell */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {customIcons.map((icon) => (
                  <div
                    key={icon.name}
                    style={{ position: "relative" }}
                    onMouseEnter={(e) => {
                      const b =
                        e.currentTarget.querySelector<HTMLElement>(".rm-icon");
                      if (b) b.style.display = "flex";
                    }}
                    onMouseLeave={(e) => {
                      const b =
                        e.currentTarget.querySelector<HTMLElement>(".rm-icon");
                      if (b) b.style.display = "none";
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        border: "1.5px solid var(--probemap-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "var(--probemap-bg-subtle)",
                      }}
                      title={icon.name}
                    >
                      <img
                        src={`${BASE}${icon.url}`}
                        style={{ width: 22, height: 22, objectFit: "contain" }}
                        alt={icon.name}
                      />
                    </div>
                    <button
                      className="rm-icon probemap-btn probemap-btn--map-delete"
                      type="button"
                      onClick={async () => {
                        await deleteIcon(icon.name);
                        setCustomIcons((p) =>
                          p.filter((i) => i.name !== icon.name),
                        );
                      }}
                      style={{
                        display: "none",
                        position: "absolute",
                        top: -4,
                        right: -4,
                        width: 14,
                        height: 14,
                      }}
                    >
                      <TrashIcon variantOnRed size={8} />
                    </button>
                  </div>
                ))}
                {/* Upload cell */}
                {!pendingIconFile && (
                  <>
                    <button
                      type="button"
                      onClick={() => iconFileRef.current?.click()}
                      title={t("iconUpload")}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        flexShrink: 0,
                        border: "1.5px dashed var(--probemap-border-strong)",
                        background: "transparent",
                        color: "var(--probemap-text-faint)",
                        cursor: "pointer",
                        fontSize: 18,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      +
                    </button>
                    <input
                      ref={iconFileRef}
                      type="file"
                      accept=".svg,.png,.webp"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        setPendingIconFile(f);
                        setPendingIconName(f.name.replace(/\.[^.]+$/, ""));
                        setIconNameError(false);
                        e.target.value = "";
                      }}
                    />
                  </>
                )}
              </div>
              {/* Pending name form — inline row */}
              {pendingIconFile && (
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginTop: 8,
                  padding: "7px 10px", borderRadius: 6,
                  border: "1px solid var(--probemap-border)",
                  background: "var(--probemap-bg-subtle)",
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 4, flexShrink: 0,
                    border: "1px solid var(--probemap-border)",
                    background: "var(--probemap-bg-muted)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    overflow: "hidden",
                  }}>
                    <img
                      src={URL.createObjectURL(pendingIconFile)}
                      style={{ width: 20, height: 20, objectFit: "contain" }}
                      alt=""
                    />
                  </div>
                  <input
                    autoFocus
                    value={pendingIconName}
                    onChange={(e) => { setPendingIconName(e.target.value); setIconNameError(false); }}
                    onKeyDown={async (e) => {
                      if (e.key === "Enter") {
                        if (!pendingIconName.trim()) { setIconNameError(true); return; }
                        const icon = await uploadIcon(pendingIconName.trim(), pendingIconFile);
                        setCustomIcons((p) => [...p.filter((i) => i.name !== icon.name), icon]);
                        setPendingIconFile(null); setPendingIconName(""); setIconNameError(false);
                      }
                      if (e.key === "Escape") { setPendingIconFile(null); setPendingIconName(""); setIconNameError(false); }
                    }}
                    placeholder={t("iconNamePlaceholder")}
                    style={{
                      flex: 1, height: 26,
                      border: `1.5px solid ${iconNameError ? "var(--probemap-danger)" : "var(--probemap-border)"}`,
                      borderRadius: 5, padding: "0 8px", fontSize: 12,
                      outline: "none", background: "var(--probemap-input-bg)", color: "var(--probemap-text)",
                      fontFamily: "inherit",
                    }}
                  />
                  {iconNameError && (
                    <span style={{ fontSize: 10, color: "var(--probemap-danger)", whiteSpace: "nowrap" }}>
                      {t("iconNameRequiredError")}
                    </span>
                  )}
                  <button
                    type="button"
                    className="probemap-btn probemap-btn--primary probemap-btn--xs"
                    onClick={async () => {
                      if (!pendingIconName.trim()) { setIconNameError(true); return; }
                      const icon = await uploadIcon(pendingIconName.trim(), pendingIconFile);
                      setCustomIcons((p) => [...p.filter((i) => i.name !== icon.name), icon]);
                      setPendingIconFile(null); setPendingIconName(""); setIconNameError(false);
                    }}
                  >
                    {t("uiOk")}
                  </button>
                  <button
                    type="button"
                    className="probemap-btn probemap-btn--ghost probemap-btn--xs"
                    onClick={() => { setPendingIconFile(null); setPendingIconName(""); setIconNameError(false); }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </Section>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 8,
              }}
            >
              <button
                type="button"
                onClick={onClose}
                className="probemap-btn probemap-btn--ghost probemap-btn--md"
              >
                {t("settingsClose")}
              </button>
              <button
                type="button"
                onClick={() => void handleSaveAdvanced()}
                disabled={savingAdvanced || !advancedDirty}
                className={`probemap-btn probemap-btn--primary probemap-btn--md${savedFlash === "advanced" ? " probemap-btn--success" : ""}`}
                style={{ opacity: advancedDirty ? 1 : 0.5 }}
              >
                {savedFlash === "advanced"
                  ? t("saved")
                  : savingAdvanced
                    ? "…"
                    : t("save")}
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

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function InlineField({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
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

/** Tag-like select for inline label fields (e.g. service multi-tag row). */
const tagSelectStyle: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "2px 6px",
  borderRadius: 5,
  fontSize: 12,
  border: "1.5px solid var(--probemap-border)",
  outline: "none",
  background: "var(--probemap-input-bg)",
  color: "var(--probemap-text)",
  cursor: "pointer",
  height: 24,
};

/** Tag-like text input for inline label fields when no availableLabels. */
const tagInputStyle: React.CSSProperties = {
  boxSizing: "border-box",
  padding: "2px 6px",
  borderRadius: 5,
  fontSize: 12,
  border: "1.5px solid var(--probemap-border)",
  outline: "none",
  background: "var(--probemap-input-bg)",
  color: "var(--probemap-text)",
  height: 24,
};

/** Pill for extra name_labels with remove button. */
const tagPillStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
  fontSize: 12,
  padding: "2px 7px",
  borderRadius: 5,
  background: "var(--probemap-bg-card)",
  border: "1.5px solid var(--probemap-border)",
  color: "var(--probemap-text)",
  height: 24,
  boxSizing: "border-box",
};

const tagRemoveBtnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--probemap-text-faint)",
  lineHeight: 1,
  fontSize: 13,
};

import { useCallback, useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { FaGear, FaMoon, FaSun } from "react-icons/fa6";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ApiError,
  fetchConfig,
  fetchServices,
  fetchProjectServices,
  fetchProjects,
  fetchDatasourceStatus,
  createProject,
  updateProject,
  deleteProject,
  type AppConfig,
  type ServicesResponse,
  type Project,
  type ProjectFilter,
} from "./api";
import { AuthProvider, useAuth } from "./AuthContext";
import { LoginModal } from "./LoginModal";
import { TopologyCanvas } from "./TopologyCanvas";
import { Settings } from "./Settings";
import { ProjectModal } from "./ProjectModal";
import { ProjectSelect } from "./ProjectSelect";
import { I18nProvider, useI18n } from "./i18n";
import { I18N_STABLE } from "./i18nLayout";
import { HoverTooltip } from "./Tooltip";
import { POLL_INTERVAL_OPTIONS_SEC, POLL_INTERVAL_STORAGE_KEY, readPollIntervalSec } from "./pollInterval";
import { applyTheme, getStoredTheme, type Theme } from "./theme";

function LanguageToggleButton() {
  const { lang, setLang } = useI18n();
  const flagBtn = (code: "ru" | "en", emoji: string, label: string) => (
    <button
      key={code}
      type="button"
      onClick={() => setLang(code)}
      aria-label={label}
      aria-pressed={lang === code}
      title={label}
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "2px 4px",
        lineHeight: 1,
        fontSize: 18,
        opacity: lang === code ? 1 : 0.38,
        filter: lang === code ? "none" : "grayscale(0.35)",
        transition: "opacity 0.15s ease",
      }}
    >
      {emoji}
    </button>
  );
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 6,
        border: "1.5px solid var(--probemap-border)",
        background: "var(--probemap-bg)",
      }}
    >
      {flagBtn("ru", "🇷🇺", "Русский")}
      <span style={{ color: "var(--probemap-lang-divider)", fontSize: 13, userSelect: "none", lineHeight: 1 }} aria-hidden>
        /
      </span>
      {flagBtn("en", "🇬🇧", "English")}
    </div>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  const label = t("settingsOpen");
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="probemap-outline-hover-btn probemap-header-settings-gear"
    >
      <FaGear size={16} aria-hidden />
    </button>
  );
}

function ThemeToggleButton() {
  const { t } = useI18n();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  const setMode = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const iconBtn = (mode: Theme, Icon: IconType, label: string) => (
    <button
      key={mode}
      type="button"
      onClick={() => setMode(mode)}
      aria-label={label}
      aria-pressed={theme === mode}
      title={label}
      style={{
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: "2px 4px",
        lineHeight: 1,
        fontSize: 18,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: theme === mode ? "var(--probemap-theme-toggle-on)" : "var(--probemap-text-faint)",
        transition: "color 0.15s ease",
      }}
    >
      <Icon size={18} aria-hidden />
    </button>
  );

  return (
    <div
      role="group"
      aria-label={t("themeToggleAria")}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 8px",
        borderRadius: 6,
        border: "1.5px solid var(--probemap-border)",
        background: "var(--probemap-bg)",
      }}
    >
      {iconBtn("light", FaSun, t("themeLight"))}
      <span style={{ color: "var(--probemap-lang-divider)", fontSize: 13, userSelect: "none", lineHeight: 1 }} aria-hidden>
        /
      </span>
      {iconBtn("dark", FaMoon, t("themeDark"))}
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </I18nProvider>
  );
}

function AuthButton() {
  const { isAdmin, authChecking, authRequired, logout } = useAuth();
  const { t } = useI18n();
  const [loginOpen, setLoginOpen] = useState(false);

  if (authChecking || !authRequired) return null;

  if (isAdmin) {
    return (
      <button
        type="button"
        onClick={logout}
        title={t("logoutButtonAria")}
        aria-label={t("logoutButtonAria")}
        className="probemap-outline-hover-btn"
        style={{ fontSize: 12, fontWeight: 600, padding: "0 10px", height: 32, display: "inline-flex", alignItems: "center" }}
      >
        admin
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setLoginOpen(true)}
        title={t("loginButtonAria")}
        aria-label={t("loginButtonAria")}
        className="probemap-outline-hover-btn"
        style={{ fontSize: 12, fontWeight: 600, padding: "0 10px", height: 32, display: "inline-flex", alignItems: "center", opacity: 0.45 }}
      >
        admin
      </button>
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} />}
    </>
  );
}

function AppContent() {
  const { t } = useI18n();
  const { isAdmin, authRequired } = useAuth();
  const canEdit = !authRequired || isAdmin;
  /** Не включать t в deps у refresh — иначе смена языка пересоздаёт refresh → эффект опроса сбрасывает data и размонтирует карту (fitView). */
  const tRef = useRef(t);
  tRef.current = t;
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Ошибка загрузки карты (не 424); true после «Скрыть» у баннера */
  const [loadFailed, setLoadFailed] = useState(false);
  const [fetching, setFetching] = useState(true);
  /** Нет данных для карты (источник / метрики) — без красной «ошибки» */
  const [needsSetup, setNeedsSetup] = useState(false);
  /** После сбоя refresh данных метрик сохраняем последний снимок; карта только для просмотра */
  const [metricsStale, setMetricsStale] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectModal, setProjectModal] = useState<{ project?: Project } | null>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [pollIntervalSec, setPollIntervalSec] = useState<(typeof POLL_INTERVAL_OPTIONS_SEC)[number]>(readPollIntervalSec);
  /** Только ручной «Обновить» в тулбаре — не автоопрос и не эффект при смене проекта */
  const [toolbarRefreshPending, setToolbarRefreshPending] = useState(false);
  /** Последняя проверка доступности VictoriaMetrics по URL из конфига */
  const [datasourceStatus, setDatasourceStatus] = useState<{
    configured: boolean;
    ok: boolean;
    name?: string | null;
  } | null>(null);
  /** Для гейта «создать проект» — мастер настроек и т.д. */
  const [appConfigSnapshot, setAppConfigSnapshot] = useState<AppConfig | null>(null);
  /** Подсказка для CTA пустых экранов (только кнопка, текст при наведении) */
  const [emptyCtaHint, setEmptyCtaHint] = useState<{ label: string; el: HTMLElement } | null>(null);

  // Load projects on mount
  useEffect(() => {
    fetchProjects()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) setActiveProject(list[0]);
      })
      .finally(() => setProjectsLoaded(true));
  }, []);

  const refresh = useCallback((opts?: { fromToolbar?: boolean }) => {
    if (opts?.fromToolbar) setToolbarRefreshPending(true);
    setFetching(true);
    const load = activeProject
      ? fetchProjectServices(activeProject.id)
      : fetchServices();
    load
      .then((d) => {
        setData(d);
        setNeedsSetup(false);
        setError(null);
        setLoadFailed(false);
        setMetricsStale(false);
        fetchDatasourceStatus().then(setDatasourceStatus).catch(() =>
          setDatasourceStatus({ configured: false, ok: false }),
        );
      })
      .catch((e) => {
        if (e instanceof ApiError) {
          if (e.status === 424) {
            setNeedsSetup(true);
            setError(null);
            setLoadFailed(false);
            setMetricsStale(false);
            setData(null);
            return;
          }
          setNeedsSetup(false);
          setLoadFailed(true);
          setMetricsStale(true);
          if (e.status === 503) {
            setError(tRef.current("apiErrorDatasourceUnavailable"));
          } else {
            setError(tRef.current("apiErrorHttp").replace("{status}", String(e.status)));
          }
          return;
        }
        setNeedsSetup(false);
        setLoadFailed(true);
        setMetricsStale(true);
        setError(tRef.current("apiErrorNetwork"));
      })
      .finally(() => {
        setFetching(false);
        if (opts?.fromToolbar) setToolbarRefreshPending(false);
      });
  }, [activeProject]);

  useEffect(() => {
    if (!projectsLoaded) return;
    const tick = () => {
      fetchDatasourceStatus()
        .then(setDatasourceStatus)
        .catch(() => setDatasourceStatus({ configured: false, ok: false }));
    };
    tick();
    const id = window.setInterval(tick, 45_000);
    return () => window.clearInterval(id);
  }, [projectsLoaded]);

  useEffect(() => {
    if (!projectsLoaded) return;
    fetchConfig()
      .then(setAppConfigSnapshot)
      .catch(() => setAppConfigSnapshot(null));
  }, [projectsLoaded]);

  useEffect(() => {
    setData(null);
    setError(null);
    setLoadFailed(false);
    setNeedsSetup(false);
    setMetricsStale(false);
    refresh();
    const ms = pollIntervalSec * 1000;
    const id = setInterval(refresh, ms);
    return () => clearInterval(id);
  }, [refresh, pollIntervalSec]);

  const setPollIntervalSecPersist = useCallback((sec: (typeof POLL_INTERVAL_OPTIONS_SEC)[number]) => {
    setPollIntervalSec(sec);
    localStorage.setItem(POLL_INTERVAL_STORAGE_KEY, String(sec));
  }, []);

  const handleCreateProject = async (name: string, filters: ProjectFilter[]) => {
    const p = await createProject(name, filters);
    setProjects((prev) => [...prev, p]);
    setActiveProject(p);
  };

  const handleUpdateProject = async (name: string, filters: ProjectFilter[]) => {
    if (!projectModal?.project) return;
    const p = await updateProject(projectModal.project.id, {
      name,
      filters: filters.length > 0 ? filters : [],
    });
    setProjects((prev) => prev.map((x) => x.id === p.id ? p : x));
    if (activeProject?.id === p.id) setActiveProject(p);
  };

  const cfgKnown = appConfigSnapshot !== null;
  const dsKnown = datasourceStatus !== null;
  const wizardIncomplete =
    cfgKnown && appConfigSnapshot.settings_targets_saved === false;
  const metricsNotReady =
    dsKnown && (!datasourceStatus.configured || !datasourceStatus.ok);
  const onboardingReady = cfgKnown && dsKnown && !wizardIncomplete && !metricsNotReady;
  const onboardingChecking = !cfgKnown || !dsKnown;
  /** Нет нормального датасорса в конфиге или мастер на шаге таргетов — показываем «Настроить датасорс». */
  const showDatasourceSetupHead =
    !onboardingChecking &&
    (wizardIncomplete ||
      (metricsNotReady && datasourceStatus !== null && !datasourceStatus.configured));

  const datasourceCtaHelpLabel = `${t("datasourceSetupTitle")}\n\n${t("mapUnavailableBody")}`;
  const onboardingCtaHelpLabel = (() => {
    const title = onboardingReady
      ? t("onboardingTitle")
      : onboardingChecking
        ? t("onboardingTitlePrereq")
        : showDatasourceSetupHead
          ? t("datasourceSetupTitle")
          : t("onboardingTitlePrereq");
    const body = onboardingChecking
      ? t("onboardingBodyWait")
      : wizardIncomplete
        ? t("onboardingBlockedWizard")
        : metricsNotReady
          ? t("onboardingBlockedMetrics")
          : t("onboardingBody");
    return `${title}\n\n${body}`;
  })();

  const toggleEmptyCtaHint = (label: string, el: HTMLElement) => {
    setEmptyCtaHint((prev) => (prev && prev.label === label ? null : { label, el }));
  };

  useEffect(() => {
    setEmptyCtaHint(null);
  }, [needsSetup, projects.length]);

  const performDeleteProject = useCallback(async (project: Project) => {
    await deleteProject(project.id);
    setProjects((prev) => {
      const next = prev.filter((x) => x.id !== project.id);
      if (activeProject?.id === project.id) {
        setActiveProject(next[0] ?? null);
      }
      return next;
    });
    setProjectModal(null);
  }, [activeProject?.id]);

  return (
      <div className="app-shell" style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      {/* Header */}
      <div style={{
        minHeight: 48, flexShrink: 0,
        display: "flex", alignItems: "stretch",
        padding: "0 14px",
        borderBottom: "1px solid var(--probemap-border)",
        background: "var(--probemap-header-bg)",
        zIndex: 20,
      }}>
        {/* Слева: бренд */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 10,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--probemap-text)", letterSpacing: "-0.02em", flexShrink: 0 }}>
            probemap
          </span>
        </div>

        {/* По центру: активный проект */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            minWidth: 0,
            padding: "0 12px",
          }}
        >
          {projects.length > 0 && (
            <ProjectSelect
              projects={projects}
              activeProject={activeProject}
              onChange={setActiveProject}
              onConfigureProject={canEdit ? (p) => setProjectModal({ project: p }) : undefined}
              onCreateProject={canEdit ? () => setProjectModal({}) : undefined}
            />
          )}
        </div>

        {/* Справа: автоопрос / обновить, тема, язык, настройки (край справа) */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            minWidth: 0,
          }}
        >
          <div
            id="probemap-toolbar-host"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
              flexWrap: "nowrap",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexShrink: 0,
            }}
          >
            <ThemeToggleButton />
            <LanguageToggleButton />
            {canEdit && <SettingsButton onClick={() => setSettingsOpen(true)} />}
            <AuthButton />
          </div>
        </div>
      </div>

      {/* Canvas — minHeight:0 нужен цепочке flex, иначе палитра/канвас теряют высоту */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>
        {error && !needsSetup && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 25,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background: "var(--probemap-warn-banner-bg)",
              borderBottom: "1px solid var(--probemap-warn-banner-border)",
              color: "var(--probemap-warn-banner-text)",
              fontSize: 13,
              boxSizing: "border-box",
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>{error}</span>
            <button
              type="button"
              onClick={() => {
                setError(null);
                refresh();
              }}
              className="probemap-btn probemap-btn--warn-retry"
              style={{ flexShrink: 0 }}
            >
              {t("apiLoadRetry")}
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              className="probemap-btn probemap-btn--warn-dismiss"
              style={{ flexShrink: 0 }}
            >
              {t("apiLoadDismiss")}
            </button>
          </div>
        )}
        {!error && needsSetup && (
          <div
            style={{
              height: "100%",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 0,
              padding: 32,
              boxSizing: "border-box",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                type="button"
                onClick={(e) => { setSettingsOpen(true); toggleEmptyCtaHint(datasourceCtaHelpLabel, e.currentTarget); }}
                onMouseEnter={(e) => setEmptyCtaHint({ label: datasourceCtaHelpLabel, el: e.currentTarget })}
                onMouseLeave={() => setEmptyCtaHint(null)}
                className="probemap-btn probemap-btn--primary probemap-btn--lg"
                style={{ minWidth: I18N_STABLE.settingsOpenMinWidthPx }}
              >
                {t("datasourceSetupTitle")}
              </button>
            </div>
          </div>
        )}
        {!projectsLoaded && !needsSetup && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--probemap-text-faint)",
              fontSize: 13,
            }}
          >
            {t("loading")}
          </div>
        )}
        {projectsLoaded && !error && !needsSetup && projects.length === 0 && (
          (!data && fetching) ? (
            <div style={{ padding: 20, fontSize: 13, color: "var(--probemap-text-faint)" }}>{t("loading")}</div>
          ) : (
            <div
              style={{
                height: "100%",
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 0,
                padding: 32,
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  type="button"
                  disabled={onboardingChecking}
                  onClick={(e) => {
                    toggleEmptyCtaHint(onboardingCtaHelpLabel, e.currentTarget);
                    if (onboardingReady) setProjectModal({});
                    else setSettingsOpen(true);
                  }}
                  onMouseEnter={(e) => setEmptyCtaHint({ label: onboardingCtaHelpLabel, el: e.currentTarget })}
                  onMouseLeave={() => setEmptyCtaHint(null)}
                  className={`probemap-btn probemap-btn--lg${onboardingReady ? " probemap-btn--slate" : " probemap-btn--primary"}${onboardingChecking ? " probemap-btn--busy" : ""}`}
                  style={{
                    minWidth: onboardingReady ? I18N_STABLE.ctaMinWidthPx : I18N_STABLE.settingsOpenMinWidthPx,
                  }}
                >
                  {onboardingChecking
                    ? t("loading")
                    : onboardingReady
                      ? t("projectAdd")
                      : showDatasourceSetupHead
                        ? t("datasourceSetupTitle")
                        : t("settingsOpen")}
                </button>
              </div>
            </div>
          )
        )}
        {!needsSetup && activeProject && data && (!error || metricsStale) && (
          <ReactFlowProvider key={activeProject.id}>
            <TopologyCanvas
              data={data}
              projectId={activeProject.id}
              onRefresh={() => refresh({ fromToolbar: true })}
              refreshPending={toolbarRefreshPending}
              pollIntervalSec={pollIntervalSec}
              onPollIntervalSecChange={setPollIntervalSecPersist}
              metricsStale={metricsStale}
              isAdmin={canEdit}
              datasourceStatus={datasourceStatus}
              endpointLabel={appConfigSnapshot?.label_map?.endpoint_label}
            />
          </ReactFlowProvider>
        )}
        {!needsSetup && !data && !(projectsLoaded && projects.length === 0 && !error) && (
          fetching ? (
            error ? null : (
              <div style={{ padding: 20, fontSize: 13, color: "var(--probemap-text-faint)" }}>{t("loading")}</div>
            )
          ) : loadFailed && !error ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                boxSizing: "border-box",
                color: "var(--probemap-text-muted)",
                fontSize: 14,
                lineHeight: 1.55,
                textAlign: "center",
              }}
            >
              {t("apiLoadErrorHint")}
            </div>
          ) : null
        )}
      </div>

      {emptyCtaHint && (
        <HoverTooltip
          label={emptyCtaHint.label}
          targetEl={emptyCtaHint.el}
          multiline
          placement="below"
        />
      )}

      {settingsOpen && (
        <Settings
          projectFilterPairs={activeProject?.filters ?? null}
          onClose={() => {
            setSettingsOpen(false);
            fetchConfig()
              .then(setAppConfigSnapshot)
              .catch(() => setAppConfigSnapshot(null));
            fetchDatasourceStatus()
              .then(setDatasourceStatus)
              .catch(() => setDatasourceStatus({ configured: false, ok: false }));
            refresh();
          }}
        />
      )}

      {projectModal !== null && (
        <ProjectModal
          project={projectModal.project}
          onSave={projectModal.project ? handleUpdateProject : handleCreateProject}
          onClose={() => setProjectModal(null)}
          onDelete={
            projectModal.project
              ? () => performDeleteProject(projectModal.project!)
              : undefined
          }
        />
      )}
      </div>
  );
}

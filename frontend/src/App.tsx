import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  ApiError,
  fetchServices, fetchProjectServices, fetchProjects,
  createProject, updateProject, deleteProject,
  type ServicesResponse, type Project, type ProjectFilter,
} from "./api";
import { TopologyCanvas } from "./TopologyCanvas";
import { Settings } from "./Settings";
import { ProjectModal } from "./ProjectModal";
import { ProjectSelect } from "./ProjectSelect";
import { I18nProvider, useI18n } from "./i18n";
import { POLL_INTERVAL_OPTIONS_SEC, POLL_INTERVAL_STORAGE_KEY, readPollIntervalSec } from "./pollInterval";

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
        border: "1.5px solid #e2e8f0",
        background: "#fff",
      }}
    >
      {flagBtn("ru", "🇷🇺", "Русский")}
      <span style={{ color: "#cbd5e1", fontSize: 13, userSelect: "none", lineHeight: 1 }} aria-hidden>
        /
      </span>
      {flagBtn("en", "🇬🇧", "English")}
    </div>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("settings")}
      className="probemap-outline-hover-btn"
    >
      {t("settings")}
    </button>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}

function AppContent() {
  const { t } = useI18n();
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
            setError(t("apiErrorDatasourceUnavailable"));
          } else {
            setError(t("apiErrorHttp").replace("{status}", String(e.status)));
          }
          return;
        }
        setNeedsSetup(false);
        setLoadFailed(true);
        setMetricsStale(true);
        setError(t("apiErrorNetwork"));
      })
      .finally(() => {
        setFetching(false);
        if (opts?.fromToolbar) setToolbarRefreshPending(false);
      });
  }, [activeProject, t]);

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
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      {/* Header */}
      <div style={{
        minHeight: 48, flexShrink: 0,
        display: "flex", alignItems: "stretch",
        padding: "0 14px",
        borderBottom: "1px solid #e2e8f0",
        background: "#fff",
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
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", letterSpacing: "-0.02em", flexShrink: 0 }}>
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
              onConfigureProject={(p) => setProjectModal({ project: p })}
              onCreateProject={() => setProjectModal({})}
            />
          )}
        </div>

        {/* Справа: автоопрос / обновить, настройки, язык */}
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
          <SettingsButton onClick={() => setSettingsOpen(true)} />
          <LanguageToggleButton />
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
              background: "#fffbeb",
              borderBottom: "1px solid #fcd34d",
              color: "#92400e",
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
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid #d97706",
                background: "#fff",
                color: "#92400e",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {t("apiLoadRetry")}
            </button>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid transparent",
                background: "transparent",
                color: "#92400e",
                fontSize: 12,
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              {t("apiLoadDismiss")}
            </button>
          </div>
        )}
        {!error && needsSetup && (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 32,
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                maxWidth: 400,
                textAlign: "center",
                color: "#64748b",
                fontSize: 14,
                lineHeight: 1.55,
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600, color: "#334155", marginBottom: 10 }}>
                {t("mapUnavailableTitle")}
              </div>
              <p style={{ margin: "0 0 20px", whiteSpace: "pre-line" }}>
                {t("mapUnavailableBody")}
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                style={{
                  padding: "8px 20px",
                  borderRadius: 8,
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  fontSize: 14,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {t("settingsOpen")}
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
              color: "#94a3b8",
              fontSize: 13,
            }}
          >
            {t("loading")}
          </div>
        )}
        {projectsLoaded && !error && !needsSetup && projects.length === 0 && (
          (!data && fetching) ? (
            <div style={{ padding: 20, fontSize: 13, color: "#94a3b8" }}>{t("loading")}</div>
          ) : (
            <div
              style={{
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  maxWidth: 440,
                  textAlign: "center",
                  color: "#64748b",
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                <div style={{ fontSize: 17, fontWeight: 600, color: "#334155", marginBottom: 12 }}>
                  {t("onboardingTitle")}
                </div>
                <p style={{ margin: "0 0 24px" }}>{t("onboardingBody")}</p>
                <button
                  type="button"
                  onClick={() => setProjectModal({})}
                  style={{
                    padding: "10px 24px",
                    borderRadius: 8,
                    border: "none",
                    background: "#334155",
                    color: "#f8fafc",
                    fontSize: 14,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#475569";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#334155";
                  }}
                >
                  {t("projectAdd")}
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
            />
          </ReactFlowProvider>
        )}
        {!needsSetup && !data && !(projectsLoaded && projects.length === 0 && !error) && (
          fetching ? (
            error ? null : (
              <div style={{ padding: 20, fontSize: 13, color: "#94a3b8" }}>{t("loading")}</div>
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
                color: "#64748b",
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

      {settingsOpen && (
        <Settings
          projectFilterPairs={activeProject?.filters ?? null}
          onClose={() => {
            setSettingsOpen(false);
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

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
import { I18nProvider, useI18n } from "./i18n";
import { POLL_INTERVAL_OPTIONS_SEC, POLL_INTERVAL_STORAGE_KEY, readPollIntervalSec } from "./pollInterval";

function LanguageToggleButton() {
  const { lang, setLang } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLang(lang === "ru" ? "en" : "ru")}
      style={{
        padding: "3px 12px",
        borderRadius: 6,
        fontSize: 12,
        border: "1.5px solid #e2e8f0",
        background: "#fff",
        color: "#475569",
        cursor: "pointer",
      }}
    >
      {lang === "ru" ? "EN" : "RU"}
    </button>
  );
}

function SettingsButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("settings")}
      style={{
        padding: "3px 12px",
        borderRadius: 6,
        fontSize: 12,
        border: "1.5px solid #e2e8f0",
        background: "#fff",
        color: "#475569",
        cursor: "pointer",
      }}
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

  // Load projects on mount
  useEffect(() => {
    fetchProjects()
      .then((list) => {
        setProjects(list);
        if (list.length > 0) setActiveProject(list[0]);
      })
      .finally(() => setProjectsLoaded(true));
  }, []);

  const refresh = useCallback(() => {
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
      .finally(() => setFetching(false));
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

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(t("deleteProjectConfirm").replace("{name}", project.name))) return;
    await deleteProject(project.id);
    setProjects((prev) => {
      const next = prev.filter((x) => x.id !== project.id);
      if (activeProject?.id === project.id) {
        setActiveProject(next[0] ?? null);
      }
      return next;
    });
  };

  return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      {/* Header */}
      <div style={{
        height: 44, flexShrink: 0,
        display: "flex", alignItems: "center", gap: 8,
        padding: "0 14px",
        borderBottom: "1px solid #e2e8f0",
        background: "#fff",
        zIndex: 20,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginRight: 6, letterSpacing: "-0.02em" }}>
          probemap
        </span>

        {/* Project selector */}
        {projects.length > 0 && (
          <select
            value={activeProject?.id ?? ""}
            onChange={(e) => {
              const p = projects.find((x) => x.id === e.target.value) ?? null;
              setActiveProject(p);
            }}
            style={{
              padding: "3px 8px", borderRadius: 6, fontSize: 13,
              border: "1.5px solid #e2e8f0", background: "#f8fafc",
              color: "#0f172a", cursor: "pointer", outline: "none",
            }}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}

        {/* Edit active project */}
        {activeProject && (
          <button
            onClick={() => setProjectModal({ project: activeProject })}
            title={t("projectConfigure")}
            style={iconBtn}
          >✎</button>
        )}

        {/* Delete active project */}
        {activeProject && (
          <button
            onClick={() => handleDeleteProject(activeProject)}
            title={t("projectDelete")}
            style={{ ...iconBtn, color: "#ef4444" }}
          >✕</button>
        )}

        <div style={{ width: 1, height: 20, background: "#e2e8f0", margin: "0 4px" }} />

        {/* New project */}
        <button
          onClick={() => setProjectModal({})}
          style={{
            padding: "3px 12px", borderRadius: 6, fontSize: 12,
            border: "1.5px solid #e2e8f0", background: "#fff",
            color: "#475569", cursor: "pointer",
          }}
        >{t("projectAdd")}</button>

        <div style={{ flex: 1 }} />

        {/* Settings */}
        <SettingsButton onClick={() => setSettingsOpen(true)} />
        <LanguageToggleButton />
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
                    background: "#3b82f6",
                    color: "#fff",
                    fontSize: 14,
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  {t("onboardingCreate")}
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
              onRefresh={refresh}
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
        />
      )}
      </div>
  );
}

const iconBtn: React.CSSProperties = {
  background: "none", border: "none", fontSize: 14,
  color: "#64748b", cursor: "pointer", padding: "2px 6px",
  borderRadius: 4,
};

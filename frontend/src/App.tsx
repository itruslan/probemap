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
  /** Нет данных для карты (источник / метрики) — без красной «ошибки» */
  const [needsSetup, setNeedsSetup] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectModal, setProjectModal] = useState<{ project?: Project } | null>(null);

  // Load projects on mount
  useEffect(() => {
    fetchProjects().then((list) => {
      setProjects(list);
      if (list.length > 0) setActiveProject(list[0]);
    });
  }, []);

  const refresh = useCallback(() => {
    const load = activeProject
      ? fetchProjectServices(activeProject.id)
      : fetchServices();
    load
      .then((d) => {
        setData(d);
        setNeedsSetup(false);
        setError(null);
      })
      .catch((e) => {
        setData(null);
        if (e instanceof ApiError) {
          setNeedsSetup(true);
          setError(null);
          return;
        }
        setNeedsSetup(true);
        setError(null);
      });
  }, [activeProject]);

  useEffect(() => {
    setData(null);
    setError(null);
    setNeedsSetup(false);
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

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
        {error && (
          <div style={{ padding: 20, color: "#ef4444", fontSize: 13 }}>
            {error}
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
        {!error && !needsSetup && data && (
          <ReactFlowProvider key={activeProject?.id ?? "default"}>
            <TopologyCanvas
              data={data}
              projectId={activeProject?.id ?? null}
              onRefresh={refresh}
            />
          </ReactFlowProvider>
        )}
        {!error && !needsSetup && !data && (
          <div style={{ padding: 20, fontSize: 13, color: "#94a3b8" }}>{t("loading")}</div>
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

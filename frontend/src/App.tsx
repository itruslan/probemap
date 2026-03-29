import { useCallback, useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  fetchServices, fetchProjectServices, fetchProjects,
  createProject, updateProject, deleteProject,
  type ServicesResponse, type Project, type ProjectFilter,
} from "./api";
import { TopologyCanvas } from "./TopologyCanvas";
import { Settings } from "./Settings";
import { ProjectModal } from "./ProjectModal";

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  const [data, setData] = useState<ServicesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    load.then(setData).catch((e) => setError(String(e)));
  }, [activeProject]);

  useEffect(() => {
    setData(null);
    setError(null);
    refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleCreateProject = async (name: string, filter: ProjectFilter | null) => {
    const p = await createProject(name, filter);
    setProjects((prev) => [...prev, p]);
    setActiveProject(p);
  };

  const handleUpdateProject = async (name: string, filter: ProjectFilter | null) => {
    if (!projectModal?.project) return;
    const p = await updateProject(projectModal.project.id, { name, filter });
    setProjects((prev) => prev.map((x) => x.id === p.id ? p : x));
    if (activeProject?.id === p.id) setActiveProject(p);
  };

  const handleDeleteProject = async (project: Project) => {
    if (!window.confirm(`Удалить проект «${project.name}»?`)) return;
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
            title="Настроить проект"
            style={iconBtn}
          >✎</button>
        )}

        {/* Delete active project */}
        {activeProject && (
          <button
            onClick={() => handleDeleteProject(activeProject)}
            title="Удалить проект"
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
        >+ Проект</button>

        <div style={{ flex: 1 }} />

        {/* Settings */}
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          style={{ ...iconBtn, fontSize: 16 }}
        >⚙</button>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {error && (
          <div style={{ padding: 20, color: "#ef4444", fontSize: 13 }}>
            Ошибка: {error}
          </div>
        )}
        {!error && data && (
          <ReactFlowProvider key={activeProject?.id ?? "default"}>
            <TopologyCanvas
              data={data}
              projectId={activeProject?.id ?? null}
              onRefresh={refresh}
            />
          </ReactFlowProvider>
        )}
        {!error && !data && (
          <div style={{ padding: 20, fontSize: 13, color: "#94a3b8" }}>Загрузка...</div>
        )}
      </div>

      {settingsOpen && (
        <Settings onClose={() => setSettingsOpen(false)} />
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

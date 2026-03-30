import {
  ReactFlow,
  addEdge,
  reconnectEdge,
  Background,
  Controls,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLayout, saveLayout, fetchProjectLayout, saveProjectLayout, type Service, type ServicesResponse, type ServiceAction, type ServiceConfig } from "./api";
import { ServiceNode, type ServiceNodeData } from "./nodes/ServiceNode";
import { CustomNode, type CustomNodeData } from "./nodes/CustomNode";
import { GroupNode, type GroupNodeData } from "./nodes/GroupNode";
import { DeletableEdge } from "./edges/DeletableEdge";
import { Palette } from "./Palette";
import { ContextMenu } from "./ContextMenu";
import { CollisionContext } from "./CollisionContext";

const NODE_TYPES = { service: ServiceNode, custom: CustomNode, group: GroupNode };
const EDGE_TYPES = { default: DeletableEdge };

function serviceToNode(
  svc: Service,
  position: { x: number; y: number },
  icon?: string,
  description?: string,
  actions?: ServiceAction[],
): Node {
  return {
    id: svc.id,
    type: "service",
    position,
    data: { label: svc.name, ports: svc.ports, icon, description, actions } satisfies ServiceNodeData,
  };
}

function customToNode(kind: string, label: string, icon: string, position: { x: number; y: number }): Node {
  return {
    id: `custom-${Date.now()}`,
    type: "custom",
    position,
    data: { label, kind, icon } satisfies CustomNodeData,
  };
}

interface Props {
  data: ServicesResponse;
  projectId: string | null;
  onRefresh: () => void;
}

export function TopologyCanvas({ data, projectId, onRefresh }: Props) {
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const removedPositions = useRef<Map<string, { x: number; y: number }>>(new Map());
  const serviceConfigs = useRef<Record<string, ServiceConfig>>({});
  const layoutLoaded = useRef(false);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ kind: "service"; svc: Service } | null>(null);


  const [contextMenu, setContextMenu] = useState<{ screenX: number; screenY: number } | null>(null);
  const [collidingIds, setCollidingIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [paletteSelectedId, setPaletteSelectedId] = useState<string | null>(null);
  const [paletteHoverId, setPaletteHoverId] = useState<string | null>(null);

  const COLLIDABLE = ["service", "custom"];

  const getBounds = (n: Node) => ({
    x: n.position.x, y: n.position.y,
    w: n.measured?.width ?? 140, h: n.measured?.height ?? 80,
  });

  const overlaps = (a: ReturnType<typeof getBounds>, b: ReturnType<typeof getBounds>) =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const onNodeDrag = useCallback((_: React.MouseEvent, dragged: Node) => {
    if (!COLLIDABLE.includes(dragged.type ?? "")) return;
    const db = getBounds(dragged);
    const ids = new Set(
      getNodes()
        .filter(n => n.id !== dragged.id && COLLIDABLE.includes(n.type ?? "") && overlaps(db, getBounds(n)))
        .map(n => n.id)
    );
    setCollidingIds(ids);
  }, [getNodes]);

  const onNodeDragStop = useCallback((_: React.MouseEvent, dragged: Node) => {
    setCollidingIds(new Set());
    if (!COLLIDABLE.includes(dragged.type ?? "")) return;
    const others = getNodes().filter(n => n.id !== dragged.id && COLLIDABLE.includes(n.type ?? ""));
    const db = getBounds(dragged);
    if (!others.some(n => overlaps(db, getBounds(n)))) return;

    // Find nearest non-overlapping position by spiral offsets
    let pos = dragged.position;
    const step = 20;
    outer: for (let r = 1; r <= 15; r++) {
      for (const [dx, dy] of [
        [r, 0], [0, r], [r, r], [-r, 0], [0, -r], [r, -r], [-r, r], [-r, -r],
      ] as [number, number][]) {
        const candidate = { x: dragged.position.x + dx * step, y: dragged.position.y + dy * step };
        const tb = { ...db, ...candidate };
        if (!others.some(n => overlaps(tb, getBounds(n)))) {
          pos = candidate;
          break outer;
        }
      }
    }
    setNodes(ns => ns.map(n => n.id === dragged.id ? { ...n, position: pos } : n));
  }, [getNodes, setNodes]);

  const onNodesChange: typeof onNodesChangeRaw = useCallback(
    (changes) => {
      const allowed = changes.filter((c) => {
        if (c.type !== "remove") return true;
        const node = getNodes().find((n) => n.id === c.id);
        if (!node) return true;
        if (node.type === "service" || node.type === "custom") {
          // Service/custom nodes are deleted via confirmation modal, not directly
          return false;
        }
        return true;
      });
      onNodesChangeRaw(allowed);
    },
    [onNodesChangeRaw, getNodes]
  );

  // Handle Backspace/Delete on selected node (canvas selection or palette selection)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmDelete) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Try ReactFlow selected first, then palette selection
      const rfSelected = getNodes().filter((n) => n.selected && (n.type === "service" || n.type === "custom"));
      let targetId: string | null = null;
      if (rfSelected.length === 1) {
        targetId = rfSelected[0].id;
      } else if (paletteSelectedId) {
        targetId = paletteSelectedId;
      }
      if (!targetId) return;
      const node = getNodes().find((n) => n.id === targetId);
      if (!node) return;
      const label = (node.data as { label?: string }).label ?? node.id;
      e.preventDefault();
      setConfirmDelete({ id: node.id, label });
      setConfirmText("");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [getNodes, confirmDelete, paletteSelectedId]);

  // Listen for custom delete-request events from ServiceNode trash icon
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, label } = (e as CustomEvent).detail;
      setConfirmDelete({ id, label });
      setConfirmText("");
    };
    document.addEventListener("delete-node-request", handler);
    return () => document.removeEventListener("delete-node-request", handler);
  }, []);

  const doConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    const node = getNodes().find((n) => n.id === confirmDelete.id);
    if (node) removedPositions.current.set(confirmDelete.id, { x: node.position.x, y: node.position.y });
    setNodes((ns) => ns.filter((n) => n.id !== confirmDelete.id));
    setEdges((es) => es.filter((e) => e.source !== confirmDelete.id && e.target !== confirmDelete.id));
    setPaletteSelectedId(null);
    setPaletteHoverId(null);
    setConfirmDelete(null);
    setConfirmText("");
  }, [confirmDelete, getNodes, setNodes, setEdges]);

  // Load saved layout on mount
  useEffect(() => {
    const loadLayout = projectId ? fetchProjectLayout(projectId) : fetchLayout();
    loadLayout.then((layout) => {
      // Restore service configs (for all services, including those not on canvas)
      if (layout.service_configs) {
        serviceConfigs.current = layout.service_configs;
      }
      layoutLoaded.current = true;
      if (!layout.nodes.length) return;
      const placed = layout.nodes
        .map((ln) => {
          if (ln.type === "group") {
            return {
              id: ln.id,
              type: "group",
              position: { x: ln.x, y: ln.y },
              style: { width: ln.width ?? 260, height: ln.height ?? 180, zIndex: ln.zIndex ?? -1 },
              data: { label: ln.label ?? "Область", color: ln.color, icon: ln.icon } satisfies GroupNodeData,
            } as Node;
          }
          if (ln.type === "custom") {
            return {
              id: ln.id,
              type: "custom",
              position: { x: ln.x, y: ln.y },
              data: { label: ln.label ?? "", kind: ln.kind ?? "custom", icon: ln.icon, description: (ln as any).description, actions: (ln as any).actions } satisfies CustomNodeData,
            } as Node;
          }
          const svc = data.services.find((s) => s.id === ln.id);
          if (!svc) return null;
          const cfg = serviceConfigs.current[svc.id] ?? {};
          return serviceToNode(svc, { x: ln.x, y: ln.y }, cfg.icon, cfg.description, cfg.actions);
        })
        .filter(Boolean) as Node[];
      setNodes(placed);
      if (layout.edges?.length) {
        setEdges(layout.edges.map((e) => e as unknown as Edge));
      }
    });
  }, []);

  // Подсветка с палитры: зафиксированное выделение (клик) и превью при наведении
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        let cls: string | undefined;
        if (n.id === paletteSelectedId) cls = "palette-selected";
        else if (paletteHoverId && n.id === paletteHoverId) cls = "palette-hover";
        return { ...n, className: cls };
      })
    );
  }, [paletteSelectedId, paletteHoverId, setNodes]);

  // Keep serviceConfigs in sync with node data changes
  useEffect(() => {
    nodes.forEach((n) => {
      if (n.type !== "service") return;
      const d = n.data as unknown as ServiceNodeData;
      serviceConfigs.current[n.id] = {
        icon: d.icon,
        description: d.description,
        actions: d.actions,
      };
    });
  }, [nodes]);

  // Update port statuses on data refresh without moving nodes or changing icons
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "service") return n;
        const svc = data.services.find((s) => s.id === n.id);
        if (!svc) return n;
        const d = n.data as unknown as ServiceNodeData;
        return { ...n, data: { label: svc.name, ports: svc.ports, icon: d.icon, description: d.description, actions: d.actions } };
      })
    );
  }, [data]);

  const onConnect: OnConnect = useCallback(
    (conn) => setEdges((eds) => addEdge(conn, eds)),
    [setEdges]
  );

  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConn) => setEdges((eds) => reconnectEdge(oldEdge, newConn, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const target = dragging.current;
      if (!target) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const cfg = serviceConfigs.current[target.svc.id] ?? {};
      setNodes((ns) => [...ns, serviceToNode(target.svc, position, cfg.icon, cfg.description, cfg.actions)]);
      dragging.current = null;
    },
    [setNodes, screenToFlowPosition]
  );

  const addArea = useCallback(
    (screenX: number, screenY: number) => {
      const position = screenToFlowPosition({ x: screenX, y: screenY });
      setNodes((ns) => {
        const groupCount = ns.filter((n) => n.type === "group").length;
        return [
          {
            id: `group-${Date.now()}`,
            type: "group",
            position,
            style: { width: 260, height: 180, zIndex: -10 + groupCount },
            data: { label: "Область", icon: "FaLayerGroup" } satisfies GroupNodeData,
          } as Node,
          ...ns,
        ];
      });
    },
    [setNodes, screenToFlowPosition]
  );

  const addCustom = useCallback(
    (screenX: number, screenY: number) => {
      const position = screenToFlowPosition({ x: screenX, y: screenY });
      setNodes((ns) => [...ns, customToNode("custom", "Узел", "FaBox", position)]);
    },
    [setNodes, screenToFlowPosition]
  );

  const toggleService = useCallback(
    (svc: Service) => {
      const onCanvas = getNodes().some((n) => n.id === svc.id && n.type === "service");
      if (onCanvas) {
        const node = getNodes().find((n) => n.id === svc.id);
        if (node) removedPositions.current.set(svc.id, { x: node.position.x, y: node.position.y });
        setNodes((ns) => ns.filter((n) => n.id !== svc.id));
        setEdges((es) => es.filter((e) => e.source !== svc.id && e.target !== svc.id));
      } else {
        const saved = removedPositions.current.get(svc.id);
        let position: { x: number; y: number };
        if (saved) {
          position = saved;
          removedPositions.current.delete(svc.id);
        } else {
          const rect = wrapperRef.current?.getBoundingClientRect();
          const cx = rect ? rect.left + rect.width / 2 : 400;
          const cy = rect ? rect.top + rect.height / 2 : 300;
          position = screenToFlowPosition({ x: cx, y: cy });
        }
        const cfg = serviceConfigs.current[svc.id] ?? {};
        setNodes((ns) => [...ns, serviceToNode(svc, position, cfg.icon, cfg.description, cfg.actions)]);
      }
    },
    [getNodes, setNodes, setEdges, screenToFlowPosition]
  );

  const [saved, setSaved] = useState(false);
  const [autosave, setAutosave] = useState(() => localStorage.getItem("autosave") === "1");

  const persistLayout = useCallback(() => {
    const layoutNodes = nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      type: (n.type as "service" | "custom" | "group") ?? "service",
      ...(n.type === "group"
        ? {
            label: (n.data as unknown as GroupNodeData).label,
            color: (n.data as unknown as GroupNodeData).color,
            icon: (n.data as unknown as GroupNodeData).icon,
            width: n.measured?.width ?? (n.style?.width as number) ?? 260,
            height: n.measured?.height ?? (n.style?.height as number) ?? 180,
            zIndex: (n.style?.zIndex as number) ?? -1,
          }
        : {}),
      ...(n.type === "custom"
        ? {
            label: (n.data as unknown as CustomNodeData).label,
            kind: (n.data as unknown as CustomNodeData).kind,
            icon: (n.data as unknown as CustomNodeData).icon,
            description: (n.data as unknown as CustomNodeData).description,
            actions: (n.data as unknown as CustomNodeData).actions,
          }
        : {}),
      ...(n.type === "service"
        ? {
            icon: (n.data as unknown as ServiceNodeData).icon,
            description: (n.data as unknown as ServiceNodeData).description,
            actions: (n.data as unknown as ServiceNodeData).actions,
          }
        : {}),
    }));
    const payload = { nodes: layoutNodes, groups: [], edges: edges.map((e) => ({ ...e })), service_configs: serviceConfigs.current };
    if (projectId) {
      saveProjectLayout(projectId, payload);
    } else {
      saveLayout(payload);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [nodes, edges]);

  useEffect(() => {
    if (autosave && layoutLoaded.current) persistLayout();
  }, [nodes, edges, autosave]);

  const onCanvas = new Set(nodes.filter((n) => n.type === "service").map((n) => n.id));

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only trigger on canvas background, not on nodes
    if ((e.target as HTMLElement).closest(".react-flow__node")) return;
    e.preventDefault();
    setContextMenu({ screenX: e.clientX, screenY: e.clientY });
  }, []);

  return (
    <CollisionContext.Provider value={collidingIds}>
    <div style={{ display: "flex", height: "100%", width: "100%" }}>
      <Palette
        services={data.services}
        onCanvas={onCanvas}
        onDragStart={(svc) => { dragging.current = { kind: "service", svc }; }}
        onToggleService={toggleService}
        selectedId={paletteSelectedId}
        onSelect={setPaletteSelectedId}
        onHoverChange={setPaletteHoverId}
      />
      <div
        ref={wrapperRef}
        style={{ flex: 1, position: "relative" }}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onContextMenu={handleContextMenu}
      >
        <button
          onClick={onRefresh}
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 10,
            padding: "6px 14px", borderRadius: 6, border: "1.5px solid #e2e8f0",
            background: "#fff", cursor: "pointer", fontSize: 13,
          }}
        >
          Обновить
        </button>
        <label
          style={{
            position: "absolute", top: 12, right: 220, zIndex: 10,
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", borderRadius: 6, fontSize: 13,
            border: "1.5px solid #e2e8f0", background: "#fff", cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={autosave}
            onChange={(e) => {
              setAutosave(e.target.checked);
              localStorage.setItem("autosave", e.target.checked ? "1" : "0");
            }}
            style={{ cursor: "pointer" }}
          />
          Автосохранение
        </label>
        <button
          onClick={persistLayout}
          style={{
            position: "absolute", top: 12, right: 110, zIndex: 10,
            padding: "6px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
            border: saved ? "1.5px solid #22c55e" : "1.5px solid #e2e8f0",
            background: saved ? "#f0fdf4" : "#fff",
            color: saved ? "#16a34a" : "inherit", transition: "all 0.2s",
          }}
        >
          {saved ? "Сохранено" : "Сохранить"}
        </button>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          connectionMode={ConnectionMode.Loose}
          defaultEdgeOptions={{}}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>

        {contextMenu && (
          <ContextMenu
            x={contextMenu.screenX}
            y={contextMenu.screenY}
            services={data.services.filter((s) => !onCanvas.has(s.id))}
            onAddArea={() => addArea(contextMenu.screenX, contextMenu.screenY)}
            onAddObject={() => addCustom(contextMenu.screenX, contextMenu.screenY)}
            onAddService={(svc) => {
              const position = screenToFlowPosition({ x: contextMenu.screenX, y: contextMenu.screenY });
              const cfg = serviceConfigs.current[svc.id] ?? {};
              setNodes((ns) => [...ns, serviceToNode(svc, position, cfg.icon, cfg.description, cfg.actions)]);
            }}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>

    {confirmDelete && createPortal(
      <div
        onClick={(e) => { if (e.target === e.currentTarget) { setConfirmDelete(null); setConfirmText(""); } }}
        style={{
          position: "fixed", inset: 0, zIndex: 4000,
          background: "rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{
          background: "#fff", borderRadius: 10, width: 360,
          boxShadow: "0 8px 32px rgba(0,0,0,.18)", padding: "20px 24px",
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 }}>
            Удалить с карты
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
            Введите <strong style={{ color: "#0f172a" }}>{confirmDelete.label}</strong> для подтверждения:
          </div>
          <input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && confirmText === confirmDelete.label) doConfirmDelete(); if (e.key === "Escape") { setConfirmDelete(null); setConfirmText(""); } }}
            placeholder={confirmDelete.label}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "7px 10px", borderRadius: 6, fontSize: 13,
              border: "1.5px solid #e2e8f0", outline: "none", color: "#0f172a",
              marginBottom: 16,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => { setConfirmDelete(null); setConfirmText(""); }}
              style={{ padding: "6px 16px", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#fff", fontSize: 13, cursor: "pointer", color: "#64748b" }}>
              Отмена
            </button>
            <button onClick={doConfirmDelete} disabled={confirmText !== confirmDelete.label}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 13, cursor: "pointer",
                background: confirmText === confirmDelete.label ? "#ef4444" : "#f1f5f9",
                color: confirmText === confirmDelete.label ? "#fff" : "#94a3b8",
                transition: "background 0.15s, color 0.15s",
              }}>
              Удалить
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}

    </CollisionContext.Provider>
  );
}

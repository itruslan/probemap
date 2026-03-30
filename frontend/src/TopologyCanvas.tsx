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
import { ServicesContext } from "./ServicesContext";
import { useI18n } from "./i18n";

const NODE_TYPES = { service: ServiceNode, custom: CustomNode, group: GroupNode };
const EDGE_TYPES = { default: DeletableEdge };

function serviceToNode(
  svc: Service,
  position: { x: number; y: number },
  icon?: string,
  description?: string,
  actions?: ServiceAction[],
  matchServiceId?: string | null,
): Node {
  return {
    id: svc.id,
    type: "service",
    position,
    data: { label: svc.name, ports: svc.ports, icon, description, actions, matchServiceId: matchServiceId ?? null } satisfies ServiceNodeData,
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

const PLACEABLE_TYPES = ["service", "custom"] as const;

function nodeRect(n: Node) {
  return {
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? 140,
    h: n.measured?.height ?? 80,
  };
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

const NEW_NODE_W = 140;
const NEW_NODE_H = 80;
const PLACE_GAP = 10;
const VIEW_PAD = 16;

/** Запасной вариант: спираль от точки, если сетка по вьюпорту не нашла место. */
function findFreePositionNearPreferred(preferred: { x: number; y: number }, nodes: Node[]): { x: number; y: number } {
  const others = nodes.filter((n) => PLACEABLE_TYPES.includes(n.type as "service" | "custom"));
  const newRect = (pos: { x: number; y: number }) => ({ x: pos.x, y: pos.y, w: NEW_NODE_W, h: NEW_NODE_H });
  const clashes = (pos: { x: number; y: number }) =>
    others.some((n) => rectsOverlap(newRect(pos), nodeRect(n)));

  if (!clashes(preferred)) return preferred;

  const step = 28;
  for (let r = 1; r <= 40; r++) {
    for (const [dx, dy] of [
      [r, 0], [0, r], [r, r], [-r, 0], [0, -r], [r, -r], [-r, r], [-r, -r],
    ] as [number, number][]) {
      const p = { x: preferred.x + dx * step, y: preferred.y + dy * step };
      if (!clashes(p)) return p;
    }
  }
  return { x: preferred.x + 42 * step, y: preferred.y };
}

/**
 * Видимая область канваса: левый край сверху вниз, затем следующая колонка правее.
 * Освободившееся сверху место снова занимается при следующем добавлении (проверка пересечений по сетке).
 */
function findFreePositionViewportLeftColumn(
  nodes: Node[],
  screenToFlowPosition: (p: { x: number; y: number }) => { x: number; y: number },
  rect: DOMRect | null,
): { x: number; y: number } {
  const others = nodes.filter((n) => PLACEABLE_TYPES.includes(n.type as "service" | "custom"));
  const newRect = (pos: { x: number; y: number }) => ({ x: pos.x, y: pos.y, w: NEW_NODE_W, h: NEW_NODE_H });
  const clashes = (pos: { x: number; y: number }) =>
    others.some((n) => rectsOverlap(newRect(pos), nodeRect(n)));

  if (!rect) {
    return findFreePositionNearPreferred({ x: 0, y: 0 }, nodes);
  }

  const p1 = screenToFlowPosition({ x: rect.left, y: rect.top });
  const p2 = screenToFlowPosition({ x: rect.right, y: rect.top });
  const p3 = screenToFlowPosition({ x: rect.left, y: rect.bottom });
  const p4 = screenToFlowPosition({ x: rect.right, y: rect.bottom });
  const minX = Math.min(p1.x, p2.x, p3.x, p4.x);
  const minY = Math.min(p1.y, p2.y, p3.y, p4.y);
  const maxY = Math.max(p1.y, p2.y, p3.y, p4.y);

  const colStep = NEW_NODE_W + PLACE_GAP;
  const rowStep = NEW_NODE_H + PLACE_GAP;

  for (let col = 0; col < 120; col++) {
    const x = minX + VIEW_PAD + col * colStep;
    const yStart = minY + VIEW_PAD;
    const yMax = maxY - VIEW_PAD - NEW_NODE_H;

    if (yMax < yStart - 1e-6) {
      const pos = { x, y: yStart };
      if (!clashes(pos)) return pos;
      continue;
    }

    for (let y = yStart; y <= yMax + 1e-6; y += rowStep) {
      const pos = { x, y };
      if (!clashes(pos)) return pos;
    }
  }

  return findFreePositionNearPreferred({ x: minX + VIEW_PAD, y: minY + VIEW_PAD }, nodes);
}

interface Props {
  data: ServicesResponse;
  projectId: string | null;
  onRefresh: () => void;
}

export function TopologyCanvas({ data, projectId, onRefresh }: Props) {
  const { t } = useI18n();
  const { screenToFlowPosition, getNodes, getNode, setCenter, getZoom } = useReactFlow();
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

  const onPaletteSelect = useCallback(
    (id: string | null) => {
      setPaletteSelectedId(id);
      if (!id) return;
      queueMicrotask(() => {
        const n = getNode(id);
        if (!n) return;
        const w = n.measured?.width ?? 140;
        const h = n.measured?.height ?? 80;
        const cx = n.position.x + w / 2;
        const cy = n.position.y + h / 2;
        void setCenter(cx, cy, { zoom: getZoom(), duration: 320 });
      });
    },
    [getNode, setCenter, getZoom]
  );

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
              data: { label: ln.label ?? t("defaultGroupLabel"), color: ln.color, icon: ln.icon } satisfies GroupNodeData,
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
          if (!ln.type || ln.type === "service") {
            const svc = data.services.find((s) => s.id === ln.id) ?? null;
            const cfg = serviceConfigs.current[ln.id] ?? {};
            if (svc) {
              return serviceToNode(svc, { x: ln.x, y: ln.y }, cfg.icon, cfg.description, cfg.actions, ln.matchServiceId ?? null);
            }
            // Узел service без метрик: сервис мог исчезнуть во время сохранения
            return {
              id: ln.id,
              type: "service",
              position: { x: ln.x, y: ln.y },
              data: {
                label: ln.label ?? ln.id,
                ports: [],
                icon: cfg.icon,
                description: cfg.description,
                actions: cfg.actions,
                matchServiceId: ln.matchServiceId ?? null,
              } satisfies ServiceNodeData,
            } as Node;
          }
          return null;
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
        const d = n.data as unknown as ServiceNodeData;
        const directSvc = data.services.find((s) => s.id === n.id) ?? null;
        const matchIdSvc = d.matchServiceId ? (data.services.find((s) => s.id === d.matchServiceId) ?? null) : null;

        let byNameSvc = null as Service | null;
        if (!directSvc && !matchIdSvc && (d.ports ?? []).length === 0) {
          const candidates = data.services.filter((s) => s.name === (d.label ?? ""));
          if (candidates.length === 1) byNameSvc = candidates[0];
        }

        const svc = directSvc ?? matchIdSvc ?? byNameSvc;
        if (!svc) {
          // Даунгрейд: метрики пропали
          return { ...n, data: { ...d, ports: [] } };
        }

        const nextMatch = d.matchServiceId ?? byNameSvc?.id ?? null;
        return {
          ...n,
          data: {
            ...d,
            label: svc.name,
            ports: svc.ports,
            matchServiceId: nextMatch,
            icon: d.icon,
            description: d.description,
            actions: d.actions,
          },
        };
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
            data: { label: t("defaultGroupLabel"), icon: "FaLayerGroup" } satisfies GroupNodeData,
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
      setNodes((ns) => [...ns, customToNode("custom", t("defaultNodeLabel"), "FaBox", position)]);
    },
    [setNodes, screenToFlowPosition]
  );

  const addNoMetricsService = useCallback(
    (screenX: number, screenY: number) => {
      const position = screenToFlowPosition({ x: screenX, y: screenY });
      const id = `nometrics-${Date.now()}`;
      serviceConfigs.current[id] = { icon: "FaBox" };
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "service",
          position,
          data: {
            label: t("defaultNodeLabel"),
            ports: [],
            icon: "FaBox",
            description: undefined,
            actions: undefined,
            matchServiceId: null,
          } satisfies ServiceNodeData,
        } as Node,
      ]);
    },
    [setNodes, screenToFlowPosition]
  );

  /** Тот же путь, что пункт «сервис из мониторинга» в ПКМ (позиция — экранные координаты). */
  const addServiceAtScreen = useCallback(
    (svc: Service, screenX: number, screenY: number) => {
      const position = screenToFlowPosition({ x: screenX, y: screenY });
      const cfg = serviceConfigs.current[svc.id] ?? {};
      setNodes((ns) => [...ns, serviceToNode(svc, position, cfg.icon, cfg.description, cfg.actions, null)]);
    },
    [screenToFlowPosition, setNodes]
  );

  const addServiceFromPalette = useCallback(
    (svc: Service) => {
      const rect = wrapperRef.current?.getBoundingClientRect() ?? null;
      setNodes((ns) => {
        const position = findFreePositionViewportLeftColumn(ns, screenToFlowPosition, rect);
        const cfg = serviceConfigs.current[svc.id] ?? {};
        return [...ns, serviceToNode(svc, position, cfg.icon, cfg.description, cfg.actions, null)];
      });
    },
    [screenToFlowPosition, setNodes]
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
            label: (n.data as unknown as ServiceNodeData).label,
            icon: (n.data as unknown as ServiceNodeData).icon,
            description: (n.data as unknown as ServiceNodeData).description,
            actions: (n.data as unknown as ServiceNodeData).actions,
            matchServiceId: (n.data as unknown as ServiceNodeData).matchServiceId ?? null,
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
    <ServicesContext.Provider value={{ services: data.services, probe_sources: data.probe_sources }}>
      <div style={{ display: "flex", height: "100%", width: "100%", minHeight: 0 }}>
        <Palette
          services={data.services}
          onCanvas={onCanvas}
          onDragStart={(svc) => { dragging.current = { kind: "service", svc }; }}
          onAddService={addServiceFromPalette}
          selectedId={paletteSelectedId}
          onSelect={onPaletteSelect}
          onHoverChange={setPaletteHoverId}
        />
        <div
          ref={wrapperRef}
          style={{ flex: 1, minHeight: 0, position: "relative" }}
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
          {t("refresh")}
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
          {t("autosave")}
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
          {saved ? t("saved") : t("save")}
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
            onAddNoMetricsService={() => addNoMetricsService(contextMenu.screenX, contextMenu.screenY)}
            onAddService={(svc) => addServiceAtScreen(svc, contextMenu.screenX, contextMenu.screenY)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
    </ServicesContext.Provider>

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
            {t("removeFromCanvas")}
          </div>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 14, lineHeight: 1.5 }}>
            {t("deleteFromMapPrompt").replace("{name}", confirmDelete.label)}
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
              {t("cancel")}
            </button>
            <button onClick={doConfirmDelete} disabled={confirmText !== confirmDelete.label}
              style={{
                padding: "6px 16px", borderRadius: 6, border: "none", fontSize: 13, cursor: "pointer",
                background: confirmText === confirmDelete.label ? "#ef4444" : "#f1f5f9",
                color: confirmText === confirmDelete.label ? "#fff" : "#94a3b8",
                transition: "background 0.15s, color 0.15s",
              }}>
              {t("delete")}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )}

    </CollisionContext.Provider>
  );
}

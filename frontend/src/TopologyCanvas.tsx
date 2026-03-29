import {
  ReactFlow,
  addEdge,
  reconnectEdge,
  Background,
  Controls,
  ConnectionMode,
  MarkerType,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
  type OnConnect,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLayout, saveLayout, type Service, type ServicesResponse } from "./api";
import { ServiceNode, type ServiceNodeData } from "./nodes/ServiceNode";
import { CustomNode, type CustomNodeData } from "./nodes/CustomNode";
import { GroupNode, type GroupNodeData } from "./nodes/GroupNode";
import { DeletableEdge } from "./edges/DeletableEdge";
import { Palette, type CustomStencil } from "./Palette";

const NODE_TYPES = { service: ServiceNode, custom: CustomNode, group: GroupNode };
const EDGE_TYPES = { default: DeletableEdge };

function serviceToNode(svc: Service, position: { x: number; y: number }): Node {
  return {
    id: svc.id,
    type: "service",
    position,
    data: { label: svc.name, ports: svc.ports } satisfies ServiceNodeData,
  };
}

function customToNode(stencil: CustomStencil, position: { x: number; y: number }): Node {
  return {
    id: `custom-${Date.now()}`,
    type: "custom",
    position,
    data: { label: stencil.label, kind: stencil.kind } satisfies CustomNodeData,
  };
}

interface Props {
  data: ServicesResponse;
  onRefresh: () => void;
}

type DragTarget = { kind: "service"; svc: Service } | { kind: "custom"; stencil: CustomStencil };

export function TopologyCanvas({ data, onRefresh }: Props) {
  const { screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const dragging = useRef<DragTarget | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load saved layout on mount
  useEffect(() => {
    fetchLayout().then((layout) => {
      if (!layout.nodes.length) return;
      const placed = layout.nodes
        .map((ln) => {
          if (ln.type === "group") {
            return {
              id: ln.id,
              type: "group",
              position: { x: ln.x, y: ln.y },
              style: { width: ln.width ?? 260, height: ln.height ?? 180, zIndex: ln.zIndex ?? -1 },
              data: { label: ln.label ?? "Группа", color: ln.color } satisfies GroupNodeData,
            } as Node;
          }
          if (ln.type === "custom") {
            return {
              id: ln.id,
              type: "custom",
              position: { x: ln.x, y: ln.y },
              data: { label: ln.label ?? "", kind: ln.kind ?? "custom" } satisfies CustomNodeData,
            } as Node;
          }
          const svc = data.services.find((s) => s.id === ln.id);
          return svc ? serviceToNode(svc, { x: ln.x, y: ln.y }) : null;
        })
        .filter(Boolean) as Node[];
      setNodes(placed);
      if (layout.edges?.length) {
        setEdges(layout.edges.map((e) => ({
          ...(e as unknown as Edge),
          markerEnd: { type: MarkerType.ArrowClosed },
        })));
      }
    });
  }, []);

  // Update port statuses on data refresh without moving nodes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.type !== "service") return n;
        const svc = data.services.find((s) => s.id === n.id);
        if (!svc) return n;
        return { ...n, data: { label: svc.name, ports: svc.ports } };
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
      if (target.kind === "service") {
        setNodes((ns) => [...ns, serviceToNode(target.svc, position)]);
      } else {
        setNodes((ns) => [...ns, customToNode(target.stencil, position)]);
      }
      dragging.current = null;
    },
    [setNodes, screenToFlowPosition]
  );

  const addGroup = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : 400;
    const cy = rect ? rect.top + rect.height / 2 : 300;
    const position = screenToFlowPosition({ x: cx, y: cy });
    setNodes((ns) => {
      const groupCount = ns.filter((n) => n.type === "group").length;
      const newNode: Node = {
        id: `group-${Date.now()}`,
        type: "group",
        position,
        style: { width: 260, height: 180, zIndex: -10 + groupCount },
        data: { label: "Группа" } satisfies GroupNodeData,
      };
      return [newNode, ...ns];
    });
  }, [setNodes, screenToFlowPosition]);

  const addCustomNode = useCallback(
    (stencil: CustomStencil) => {
      const rect = wrapperRef.current?.getBoundingClientRect();
      const cx = rect ? rect.left + rect.width / 2 : 400;
      const cy = rect ? rect.top + rect.height / 2 : 300;
      const position = screenToFlowPosition({ x: cx, y: cy });
      setNodes((ns) => [...ns, customToNode(stencil, { x: position.x + ns.length * 20, y: position.y + ns.length * 20 })]);
    },
    [setNodes, screenToFlowPosition]
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
            width: n.measured?.width ?? (n.style?.width as number) ?? 260,
            height: n.measured?.height ?? (n.style?.height as number) ?? 180,
            zIndex: (n.style?.zIndex as number) ?? -1,
          }
        : {}),
      ...(n.type === "custom"
        ? {
            label: (n.data as unknown as CustomNodeData).label,
            kind: (n.data as unknown as CustomNodeData).kind,
          }
        : {}),
    }));
    saveLayout({ nodes: layoutNodes, groups: [], edges: edges.map((e) => ({ ...e })) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [nodes, edges]);

  useEffect(() => {
    if (autosave) persistLayout();
  }, [nodes, edges, autosave]);

  const onCanvas = new Set(nodes.filter((n) => n.type === "service").map((n) => n.id));

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Palette
        services={data.services}
        onCanvas={onCanvas}
        onDragStart={(svc) => { dragging.current = { kind: "service", svc }; }}
        onDragStartCustom={(stencil) => { dragging.current = { kind: "custom", stencil }; }}
        onAddCustom={addCustomNode}
        onAddGroup={addGroup}
      />
      <div
        ref={wrapperRef}
        style={{ flex: 1, position: "relative" }}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
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
            color: saved ? "#16a34a" : "inherit",
            transition: "all 0.2s",
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
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          connectionMode={ConnectionMode.Loose}
          deleteKeyCode={["Backspace", "Delete"]}
          defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed } }}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

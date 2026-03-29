import {
  ReactFlow,
  addEdge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef } from "react";
import { fetchLayout, saveLayout, type Service, type ServicesResponse } from "./api";
import { ServiceNode, type ServiceNodeData } from "./nodes/ServiceNode";
import { Palette } from "./Palette";

const NODE_TYPES = { service: ServiceNode };

function serviceToNode(svc: Service, position: { x: number; y: number }): Node {
  return {
    id: svc.id,
    type: "service",
    position,
    data: { label: svc.name, ports: svc.ports } satisfies ServiceNodeData,
  };
}

interface Props {
  data: ServicesResponse;
  onRefresh: () => void;
}

export function TopologyCanvas({ data, onRefresh }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const dragging = useRef<Service | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Load saved layout on mount
  useEffect(() => {
    fetchLayout().then((layout) => {
      if (!layout.nodes.length) return;
      const placed = layout.nodes
        .map((ln) => {
          const svc = data.services.find((s) => s.id === ln.id);
          return svc ? serviceToNode(svc, { x: ln.x, y: ln.y }) : null;
        })
        .filter(Boolean) as Node[];
      setNodes(placed);
    });
  }, []);

  // Update port statuses on data refresh without moving nodes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
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

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const svc = dragging.current;
      if (!svc || !wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const position = { x: e.clientX - rect.left - 70, y: e.clientY - rect.top - 30 };
      setNodes((ns) => [...ns, serviceToNode(svc, position)]);
      dragging.current = null;
    },
    [setNodes]
  );

  const persistLayout = useCallback(() => {
    const layoutNodes = nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    saveLayout({ nodes: layoutNodes, groups: [], edges: [] });
  }, [nodes]);

  const onCanvas = new Set(nodes.map((n) => n.id));

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw" }}>
      <Palette
        services={data.services}
        onCanvas={onCanvas}
        onDragStart={(svc) => { dragging.current = svc; }}
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
            position: "absolute",
            top: 12,
            right: 12,
            zIndex: 10,
            padding: "6px 14px",
            borderRadius: 6,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Обновить
        </button>
        <button
          onClick={persistLayout}
          style={{
            position: "absolute",
            top: 12,
            right: 110,
            zIndex: 10,
            padding: "6px 14px",
            borderRadius: 6,
            border: "1.5px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Сохранить
        </button>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={NODE_TYPES}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </div>
  );
}

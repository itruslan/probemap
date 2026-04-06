import {
  ReactFlow,
  addEdge,
  reconnectEdge,
  Background,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  useStore,
  useStoreApi,
  type Node,
  type Edge,
  type EdgeChange,
  type OnConnect,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  fetchProjectLayout,
  normalizeLayoutEdgeData,
  saveProjectLayout,
  type LayoutEdgeData,
  type Service,
  type ServicesResponse,
  type ServiceAction,
  type ServiceConfig,
} from "./api";
import { POLL_INTERVAL_OPTIONS_SEC } from "./pollInterval";
import { ServiceNode, type ServiceNodeData } from "./nodes/ServiceNode";
import { GroupNode, type GroupNodeData } from "./nodes/GroupNode";
import {
  ContainerNode,
  type ContainerNodeData,
  CONTAINER_WIDTH,
  CONTAINER_INNER_W,
  CONTAINER_SIDE_PAD,
  CONTAINER_HEADER_H,
  CONTAINER_TOP_PAD,
  CONTAINER_CARD_H,
  CONTAINER_CARD_GAP,
  containerHeight,
  slotTopInContainer,
} from "./nodes/ContainerNode";
import { ContainerDropContext, type ContainerDropState } from "./ContainerDropContext";
import { DeletableEdge } from "./edges/DeletableEdge";
import { EdgeMetadataModal } from "./edges/EdgeMetadataModal";
import { EdgeInteractionContext } from "./edges/edgeInteractionContext";
import { Palette } from "./Palette";
import { MapObjectsBar } from "./MapObjectsBar";
import { CollisionContext } from "./CollisionContext";
import { DragContext } from "./DragContext";
import { ServicesContext } from "./ServicesContext";
import { TraceContext } from "./TraceContext";
import { useI18n } from "./i18n";
import { DeleteConfirmNameHint } from "./DeleteConfirmNameHint";
import { effectiveServiceIdForNode, probeNodeStatus } from "./probeAlert";
import { NODE_KIND_MAP, type NodeKindDef } from "./nodeKinds";

/** Сессия: восстановить режим «замок» после перезагрузки страницы */
const CANVAS_LOCK_STORAGE_KEY = "probemap_canvas_locked";

const NODE_TYPES = { service: ServiceNode, group: GroupNode, container: ContainerNode };
const EDGE_TYPES = { default: DeletableEdge };

type MapEdge = Edge<LayoutEdgeData>;

function layoutRowToMapEdge(raw: Record<string, unknown>): MapEdge | null {
  const id = typeof raw.id === "string" ? raw.id : String(raw.id ?? "");
  const source =
    typeof raw.source === "string" ? raw.source : String(raw.source ?? "");
  const target =
    typeof raw.target === "string" ? raw.target : String(raw.target ?? "");
  if (!id || !source || !target) return null;
  const type = typeof raw.type === "string" ? raw.type : "default";
  const edge: MapEdge = {
    id,
    source,
    target,
    type,
    data: normalizeLayoutEdgeData(raw.data),
  };
  if (typeof raw.sourceHandle === "string") edge.sourceHandle = raw.sourceHandle;
  if (typeof raw.targetHandle === "string") edge.targetHandle = raw.targetHandle;
  if (raw.style && typeof raw.style === "object" && raw.style !== null) {
    edge.style = raw.style as MapEdge["style"];
  }
  return edge;
}

/** BFS по входящим рёбрам от startId вверх по цепочке зависимостей.
 *  Подсвечивает весь путь к сервису (user → vpn → nlb → service),
 *  не затрагивая "соседей" промежуточных узлов. */
function traceConnected(
  startId: string,
  edges: MapEdge[],
): { nodeIds: Set<string>; edgeIds: Set<string> } {
  const nodeIds = new Set<string>([startId]);
  const edgeIds = new Set<string>();
  const queue: string[] = [startId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of edges) {
      if (e.target !== current) continue;
      if (edgeIds.has(e.id)) continue;
      edgeIds.add(e.id);
      if (!nodeIds.has(e.source)) {
        nodeIds.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return { nodeIds, edgeIds };
}

function serviceToNode(
  svc: Service,
  position: { x: number; y: number },
  icon?: string,
  description?: string,
  actions?: ServiceAction[],
  ignored_sources?: string[],
  kind?: string,
): Node {
  return {
    id: svc.id,
    type: "service",
    position,
    data: {
      label: svc.name,
      ports: svc.ports,
      icon,
      description,
      actions,
      ignored_sources,
      kind: kind ?? "service",
    } satisfies ServiceNodeData,
  };
}

const PLACEABLE_TYPES = ["service"] as const;

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
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

const NEW_NODE_W = 140;
const NEW_NODE_H = 80;
const PLACE_GAP = 10;
const VIEW_PAD = 16;

/** Запасной вариант: спираль от точки, если сетка по вьюпорту не нашла место. */
function findFreePositionNearPreferred(
  preferred: { x: number; y: number },
  nodes: Node[],
): { x: number; y: number } {
  const others = nodes.filter((n) =>
    PLACEABLE_TYPES.includes(n.type as "service"),
  );
  const newRect = (pos: { x: number; y: number }) => ({
    x: pos.x,
    y: pos.y,
    w: NEW_NODE_W,
    h: NEW_NODE_H,
  });
  const clashes = (pos: { x: number; y: number }) =>
    others.some((n) => rectsOverlap(newRect(pos), nodeRect(n)));

  if (!clashes(preferred)) return preferred;

  const step = 28;
  for (let r = 1; r <= 40; r++) {
    for (const [dx, dy] of [
      [r, 0],
      [0, r],
      [r, r],
      [-r, 0],
      [0, -r],
      [r, -r],
      [-r, r],
      [-r, -r],
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
  screenToFlowPosition: (p: { x: number; y: number }) => {
    x: number;
    y: number;
  },
  rect: DOMRect | null,
): { x: number; y: number } {
  const others = nodes.filter((n) =>
    PLACEABLE_TYPES.includes(n.type as "service"),
  );
  const newRect = (pos: { x: number; y: number }) => ({
    x: pos.x,
    y: pos.y,
    w: NEW_NODE_W,
    h: NEW_NODE_H,
  });
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

  return findFreePositionNearPreferred(
    { x: minX + VIEW_PAD, y: minY + VIEW_PAD },
    nodes,
  );
}

interface Props {
  data: ServicesResponse;
  projectId: string;
  onRefresh: () => void;
  /** Ручное обновление по кнопке «Обновить» — disabled до ответа */
  refreshPending: boolean;
  pollIntervalSec: (typeof POLL_INTERVAL_OPTIONS_SEC)[number];
  onPollIntervalSecChange: (
    sec: (typeof POLL_INTERVAL_OPTIONS_SEC)[number],
  ) => void;
  /** Данные мониторинга устарели — затемнение канваса, без правок */
  metricsStale: boolean;
  /** false = viewer mode: карта только для просмотра, редактирование отключено */
  isAdmin?: boolean;
  datasourceStatus?: {
    configured: boolean;
    ok: boolean;
    name?: string | null;
  } | null;
  endpointLabel?: string | null;
}

export function TopologyCanvas({
  data,
  projectId,
  onRefresh,
  refreshPending,
  pollIntervalSec,
  onPollIntervalSecChange,
  metricsStale,
  isAdmin = true,
  datasourceStatus,
  endpointLabel,
}: Props) {
  const { t, lang } = useI18n();
  const {
    screenToFlowPosition,
    getNodes,
    getNode,
    setCenter,
    getZoom,
    fitView,
    zoomIn,
    zoomOut,
  } = useReactFlow();
  /** Стабильный вызов fitView: иначе при смене языка меняется identity fitView → scheduleFitAfterLayout → повторный fetch layout и «центрирование». */
  const fitViewRef = useRef(fitView);
  fitViewRef.current = fitView;
  const store = useStoreApi();
  const canvasInteractive = useStore(
    (s) => s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
  );
  /** Для CSS подсветки с палитры: размеры теней компенсируют zoom viewport (иначе при отдалении «пятно» исчезает). */
  const viewportZoom = useStore((s) => s.transform[2]);
  useLayoutEffect(() => {
    try {
      if (sessionStorage.getItem(CANVAS_LOCK_STORAGE_KEY) === "1") {
        store.setState({
          nodesDraggable: false,
          nodesConnectable: false,
          elementsSelectable: false,
        });
      }
    } catch {
      /* private mode / недоступно */
    }
  }, [store]);
  const removedPositions = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );
  const serviceConfigs = useRef<Record<string, ServiceConfig>>({});
  const layoutLoaded = useRef(false);
  const HISTORY_MAX = 10;
  type Snapshot = {
    nodes: Node[];
    edges: MapEdge[];
    service_configs: Record<string, ServiceConfig>;
  };
  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);
  const applyingHistory = useRef(false);
  const dragStartSnapshot = useRef<Snapshot | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<MapEdge>([]);
  const [edgeEditId, setEdgeEditId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const cloneSnapshot = useCallback((): Snapshot => {
    return structuredClone({ nodes, edges, service_configs: serviceConfigs.current }) as Snapshot;
  }, [nodes, edges]);

  const pushSnapshot = useCallback(() => {
    if (!layoutLoaded.current) return;
    if (applyingHistory.current) return;
    undoStack.current.push(cloneSnapshot());
    if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
    redoStack.current = [];
    setHistoryTick((x) => x + 1);
  }, [cloneSnapshot]);

  const applySnapshot = useCallback(
    (snap: Snapshot) => {
      applyingHistory.current = true;
      try {
        serviceConfigs.current = snap.service_configs;
        setNodes(snap.nodes);
        setEdges(snap.edges);
        setPaletteSelectedId(null);
        setPaletteHoverId(null);
      } finally {
        applyingHistory.current = false;
        setHistoryTick((x) => x + 1);
      }
    },
    [setEdges, setNodes],
  );

  const undo = useCallback(() => {
    if (metricsStale || !canvasInteractive) return;
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(cloneSnapshot());
    if (redoStack.current.length > HISTORY_MAX) redoStack.current.shift();
    applySnapshot(prev);
  }, [applySnapshot, cloneSnapshot, metricsStale, canvasInteractive]);

  const redo = useCallback(() => {
    if (metricsStale || !canvasInteractive) return;
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(cloneSnapshot());
    if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
    applySnapshot(next);
  }, [applySnapshot, cloneSnapshot, metricsStale, canvasInteractive]);

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (metricsStale || !canvasInteractive) {
        onEdgesChangeBase(changes.filter((c) => c.type !== "remove"));
        return;
      }
      if (
        !applyingHistory.current &&
        changes.some((c) => c.type === "remove")
      ) {
        pushSnapshot();
      }
      onEdgesChangeBase(changes);
    },
    [metricsStale, canvasInteractive, onEdgesChangeBase, pushSnapshot],
  );

  const [collidingIds, setCollidingIds] = useState<Set<string>>(new Set());
  const [draggingService, setDraggingService] = useState(false);
  const [pendingContainerDrop, setPendingContainerDrop] =
    useState<ContainerDropState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [paletteSelectedId, setPaletteSelectedId] = useState<string | null>(
    null,
  );
  const [paletteHoverId, setPaletteHoverId] = useState<string | null>(null);
  const [tracedNodeId, setTracedNodeId] = useState<string | null>(null);
  const [refreshLabelBold, setRefreshLabelBold] = useState(false);
  const refreshBoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const persistLayoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const handleToolbarRefresh = useCallback(() => {
    if (refreshBoldTimerRef.current) clearTimeout(refreshBoldTimerRef.current);
    setRefreshLabelBold(true);
    refreshBoldTimerRef.current = setTimeout(() => {
      setRefreshLabelBold(false);
      refreshBoldTimerRef.current = null;
    }, 1000);
    onRefresh();
  }, [onRefresh]);

  useEffect(() => {
    return () => {
      if (refreshBoldTimerRef.current)
        clearTimeout(refreshBoldTimerRef.current);
    };
  }, []);

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
    [getNode, setCenter, getZoom],
  );

  const COLLIDABLE = ["service"];

  const getBounds = (n: Node) => ({
    x: n.position.x,
    y: n.position.y,
    w: n.measured?.width ?? 140,
    h: n.measured?.height ?? 80,
  });

  const overlaps = (
    a: ReturnType<typeof getBounds>,
    b: ReturnType<typeof getBounds>,
  ) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /** Compute which container slot the dragged node center falls into. */
  const getContainerInsertIndex = useCallback(
    (dragged: Node, container: Node): number => {
      const items = (container.data as ContainerNodeData).items;
      const dcy =
        dragged.position.y + (dragged.measured?.height ?? CONTAINER_CARD_H) / 2;
      const bodyTop =
        container.position.y + CONTAINER_HEADER_H + CONTAINER_TOP_PAD;
      const rel = dcy - bodyTop;
      return Math.max(
        0,
        Math.min(
          Math.round(rel / (CONTAINER_CARD_H + CONTAINER_CARD_GAP)),
          items.length,
        ),
      );
    },
    [],
  );

  const onNodeDrag = useCallback(
    (_: React.MouseEvent, dragged: Node) => {
      // ── Container drag: items move automatically via parentId ──────────────
      if (dragged.type === "container") {
        if (
          !dragStartSnapshot.current &&
          !applyingHistory.current &&
          layoutLoaded.current
        ) {
          dragStartSnapshot.current = cloneSnapshot();
        }
        return;
      }

      if (!COLLIDABLE.includes(dragged.type ?? "")) return;
      if (
        !dragStartSnapshot.current &&
        !applyingHistory.current &&
        layoutLoaded.current
      ) {
        dragStartSnapshot.current = cloneSnapshot();
      }
      setDraggingService(true);

      const allNodes = getNodes();

      // ── If dragged node belongs to a container: track drag-out ─────────────
      const ownContainerId = (dragged.data as ServiceNodeData & { containerNode?: string })
        .containerNode;
      if (ownContainerId) {
        // We just let it drag; detach decision is made on dragStop
        return;
      }

      // ── Check if dragged node is hovering over a container ─────────────────
      const dw = dragged.measured?.width ?? CONTAINER_INNER_W;
      const dh = dragged.measured?.height ?? CONTAINER_CARD_H;
      const dcx = dragged.position.x + dw / 2;
      const dcy = dragged.position.y + dh / 2;

      const targetContainer = allNodes.find((n) => {
        if (n.type !== "container") return false;
        const cItems = (n.data as ContainerNodeData).items;
        if (cItems.includes(dragged.id)) return false; // already a member
        const ch = containerHeight(cItems.length);
        return (
          dcx >= n.position.x &&
          dcx <= n.position.x + CONTAINER_WIDTH &&
          dcy >= n.position.y &&
          dcy <= n.position.y + ch
        );
      }) ?? null;

      if (targetContainer) {
        const insertIndex = getContainerInsertIndex(dragged, targetContainer);
        const nodeLabel = (dragged.data as ServiceNodeData).label ?? dragged.id;
        setPendingContainerDrop({
          containerId: targetContainer.id,
          insertIndex,
          nodeLabel,
        });
      } else {
        setPendingContainerDrop(null);
      }

      // ── Service-service collision detection ────────────────────────────────
      const db = getBounds(dragged);
      const hasOverlap = allNodes
        .filter(
          (n) =>
            n.id !== dragged.id &&
            COLLIDABLE.includes(n.type ?? "") &&
            !(n.data as ServiceNodeData & { containerNode?: string }).containerNode,
        )
        .some((n) => overlaps(db, getBounds(n)));
      setCollidingIds(hasOverlap ? new Set([dragged.id]) : new Set());
    },
    [getNodes, setNodes, cloneSnapshot, getContainerInsertIndex],
  );

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, dragged: Node) => {
      setCollidingIds(new Set());
      setDraggingService(false);

      // ── Container drag stop ────────────────────────────────────────────────
      if (dragged.type === "container") {
        if (!applyingHistory.current && dragStartSnapshot.current) {
          undoStack.current.push(dragStartSnapshot.current);
          if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
          redoStack.current = [];
          setHistoryTick((x) => x + 1);
        }
        dragStartSnapshot.current = null;
        return;
      }

      if (!COLLIDABLE.includes(dragged.type ?? "")) return;
      if (!applyingHistory.current && dragStartSnapshot.current) {
        undoStack.current.push(dragStartSnapshot.current);
        if (undoStack.current.length > HISTORY_MAX) undoStack.current.shift();
        redoStack.current = [];
        setHistoryTick((x) => x + 1);
      }
      dragStartSnapshot.current = null;

      const allNodes = getNodes();

      // ── Drop into container ───────────────────────────────────────────────
      if (pendingContainerDrop) {
        const { containerId, insertIndex } = pendingContainerDrop;
        setPendingContainerDrop(null);
        const container = allNodes.find((n) => n.id === containerId);
        if (container) {
          const containerData = container.data as ContainerNodeData;
          const newItems = [...containerData.items];
          newItems.splice(insertIndex, 0, dragged.id);
          setNodes((ns) =>
            ns.map((n) => {
              if (n.id === containerId) {
                return {
                  ...n,
                  data: { ...n.data, items: newItems } as ContainerNodeData,
                };
              }
              // Reposition all members (including newly added) with RELATIVE positions
              const idx = newItems.indexOf(n.id);
              if (idx === -1) return n;
              return {
                ...n,
                parentId: containerId,
                position: {
                  x: CONTAINER_SIDE_PAD,
                  y: slotTopInContainer(idx),
                },
                style: { ...n.style, width: CONTAINER_INNER_W },
                selectable: false,
                data: { ...n.data, containerNode: containerId },
              };
            }),
          );
          return; // skip collision resolution
        }
      }
      setPendingContainerDrop(null);

      // ── Drag-out from container ───────────────────────────────────────────
      const ownContainerId = (dragged.data as ServiceNodeData & { containerNode?: string })
        .containerNode;
      if (ownContainerId) {
        const container = allNodes.find((n) => n.id === ownContainerId);
        if (container) {
          const ch = containerHeight(
            (container.data as ContainerNodeData).items.length,
          );
          // dragged.position is relative to container (parentId)
          const dw = dragged.measured?.width ?? CONTAINER_INNER_W;
          const dh = dragged.measured?.height ?? CONTAINER_CARD_H;
          const relCx = dragged.position.x + dw / 2;
          const relCy = dragged.position.y + dh / 2;
          const isStillInside =
            relCx >= 0 &&
            relCx <= CONTAINER_WIDTH &&
            relCy >= 0 &&
            relCy <= ch;

          if (!isStillInside) {
            // Detach — convert relative position back to absolute
            const absPos = {
              x: container.position.x + dragged.position.x,
              y: container.position.y + dragged.position.y,
            };
            const updatedItems = (container.data as ContainerNodeData).items.filter(
              (id) => id !== dragged.id,
            );
            setNodes((ns) =>
              ns.map((n) => {
                if (n.id === ownContainerId) {
                  return {
                    ...n,
                    data: { ...n.data, items: updatedItems } as ContainerNodeData,
                  };
                }
                if (n.id === dragged.id) {
                  const { containerNode: _cn, ...restData } = n.data as ServiceNodeData & {
                    containerNode?: string;
                  };
                  void _cn;
                  return {
                    ...n,
                    parentId: undefined,
                    data: restData,
                    style: { ...n.style, width: undefined },
                    selectable: true,
                    position: absPos,
                  };
                }
                // Reposition remaining members (already have parentId, relative positions)
                const idx = updatedItems.indexOf(n.id);
                if (idx === -1) return n;
                return {
                  ...n,
                  position: {
                    x: CONTAINER_SIDE_PAD,
                    y: slotTopInContainer(idx),
                  },
                };
              }),
            );
            return;
          } else {
            // Snap back to slot (relative position)
            const items = (container.data as ContainerNodeData).items;
            const idx = items.indexOf(dragged.id);
            if (idx !== -1) {
              setNodes((ns) =>
                ns.map((n) =>
                  n.id === dragged.id
                    ? {
                        ...n,
                        position: {
                          x: CONTAINER_SIDE_PAD,
                          y: slotTopInContainer(idx),
                        },
                      }
                    : n,
                ),
              );
            }
            return;
          }
        }
      }

      // ── Collision detection for free nodes ────────────────────────────────
      const others = allNodes.filter(
        (n) =>
          n.id !== dragged.id &&
          COLLIDABLE.includes(n.type ?? "") &&
          !(n.data as ServiceNodeData & { containerNode?: string }).containerNode,
      );
      const db = getBounds(dragged);
      if (!others.some((n) => overlaps(db, getBounds(n)))) return;

      // Find nearest non-overlapping position by spiral offsets
      let pos = dragged.position;
      const step = 20;
      outer: for (let r = 1; r <= 15; r++) {
        for (const [dx, dy] of [
          [r, 0],
          [0, r],
          [r, r],
          [-r, 0],
          [0, -r],
          [r, -r],
          [-r, r],
          [-r, -r],
        ] as [number, number][]) {
          const candidate = {
            x: dragged.position.x + dx * step,
            y: dragged.position.y + dy * step,
          };
          const tb = { ...db, ...candidate };
          if (!others.some((n) => overlaps(tb, getBounds(n)))) {
            pos = candidate;
            break outer;
          }
        }
      }
      setNodes((ns) =>
        ns.map((n) => (n.id === dragged.id ? { ...n, position: pos } : n)),
      );
    },
    [getNodes, setNodes, pendingContainerDrop],
  );

  const onNodesChange: typeof onNodesChangeRaw = useCallback(
    (changes) => {
      if (metricsStale) {
        onNodesChangeRaw(
          changes.filter((c) => c.type !== "remove" && c.type !== "add"),
        );
        return;
      }
      if (!canvasInteractive) {
        onNodesChangeRaw(
          changes.filter((c) => c.type !== "remove" && c.type !== "add"),
        );
        return;
      }
      const allowed = changes.filter((c) => {
        if (c.type !== "remove") return true;
        const node = getNodes().find((n) => n.id === c.id);
        if (!node) return true;
        if (node.type === "service") {
          // Service nodes are deleted via confirmation modal, not directly
          return false;
        }
        return true;
      });
      if (
        !applyingHistory.current &&
        allowed.some((c) => c.type === "remove" || c.type === "add")
      ) {
        pushSnapshot();
      }
      onNodesChangeRaw(allowed);
    },
    [onNodesChangeRaw, getNodes, metricsStale, canvasInteractive, pushSnapshot],
  );

  // Handle Backspace/Delete on selected node (canvas selection or palette selection)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (metricsStale || !canvasInteractive || !isAdmin) return;
      if (confirmDelete) return;
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Try ReactFlow selected first, then palette selection
      const rfSelected = getNodes().filter(
        (n) => n.selected && n.type === "service",
      );
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
  }, [
    getNodes,
    confirmDelete,
    paletteSelectedId,
    metricsStale,
    canvasInteractive,
  ]);

  // Undo/redo hotkeys (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (metricsStale || !canvasInteractive) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toUpperCase();
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [undo, redo, metricsStale, canvasInteractive]);

  // Clear path trace when metrics go stale
  useEffect(() => {
    if (metricsStale) setTracedNodeId(null);
  }, [metricsStale]);

  // Escape clears active path trace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTracedNodeId(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Listen for delete-request events from ServiceNode trash icon
  useEffect(() => {
    const handler = (e: Event) => {
      if (metricsStale || !canvasInteractive) return;
      const { id, label } = (e as CustomEvent).detail;
      setConfirmDelete({ id, label });
      setConfirmText("");
    };
    document.addEventListener("delete-node-request", handler);
    return () => document.removeEventListener("delete-node-request", handler);
  }, [metricsStale, canvasInteractive]);

  const doConfirmDelete = useCallback(() => {
    if (!confirmDelete) return;
    if (!applyingHistory.current) pushSnapshot();
    const allNodes = getNodes();
    const node = allNodes.find((n) => n.id === confirmDelete.id);
    if (node)
      removedPositions.current.set(confirmDelete.id, {
        x: node.position.x,
        y: node.position.y,
      });
    setNodes((ns) => {
      const filtered = ns.filter((n) => n.id !== confirmDelete.id);
      // When deleting a container: free all its member nodes
      if (node?.type === "container") {
        return filtered.map((n) => {
          const nd = n.data as ServiceNodeData & { containerNode?: string };
          if (nd.containerNode !== confirmDelete.id) return n;
          const { containerNode: _cn, ...restData } = nd;
          void _cn;
          return {
            ...n,
            data: restData,
            style: { ...n.style, width: undefined },
            selectable: true,
          };
        });
      }
      return filtered;
    });
    setEdges((es) =>
      es.filter(
        (e) => e.source !== confirmDelete.id && e.target !== confirmDelete.id,
      ),
    );
    setPaletteSelectedId(null);
    setPaletteHoverId(null);
    setTracedNodeId(null);
    setConfirmDelete(null);
    setConfirmText("");
  }, [confirmDelete, getNodes, setNodes, setEdges, pushSnapshot]);

  /** Один раз после загрузки раскладки — не при смене языка (иначе fitView на каждом ререндере) */
  const scheduleFitAfterLayout = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitViewRef.current({ padding: 0.15 });
      });
    });
  }, []);

  // Load saved layout on mount (отдельный файл раскладки на проект)
  useEffect(() => {
    fetchProjectLayout(projectId).then((layout) => {
      // Restore service configs (for all services, including those not on canvas)
      if (layout.service_configs) {
        serviceConfigs.current = layout.service_configs;
      }
      layoutLoaded.current = true;
      // Reset history on project load
      undoStack.current = [];
      redoStack.current = [];
      dragStartSnapshot.current = null;
      setHistoryTick((x) => x + 1);
      if (!layout.nodes.length) {
        scheduleFitAfterLayout();
        return;
      }
      const placed = layout.nodes
        .map((ln) => {
          if (ln.type === "group") {
            return {
              id: ln.id,
              type: "group",
              position: { x: ln.x, y: ln.y },
              style: {
                width: ln.width ?? 260,
                height: ln.height ?? 180,
                zIndex: ln.zIndex ?? -1,
              },
              data: {
                label: ln.label ?? t("defaultGroupLabel"),
                color: ln.color,
              } satisfies GroupNodeData,
            } as Node;
          }
          if (ln.type === "container") {
            const items = ln.containerItems ?? [];
            return {
              id: ln.id,
              type: "container",
              position: { x: ln.x, y: ln.y },
              style: {
                width: CONTAINER_WIDTH,
                height: containerHeight(items.length),
              },
              data: {
                label: ln.label ?? t("defaultContainerLabel"),
                icon: ln.icon,
                path: ln.path,
                description: ln.description,
                endpoint: ln.endpoint,
                items,
              } satisfies ContainerNodeData,
            } as Node;
          }
          const legacyType = ln.type as string | undefined;
          if (legacyType === "custom") {
            // Migrate legacy custom nodes to service type
            const cfg = serviceConfigs.current[ln.id] ?? {};
            return {
              id: ln.id,
              type: "service",
              position: { x: ln.x, y: ln.y },
              data: {
                label: ln.label ?? ln.id,
                ports: [],
                icon: ln.icon ?? cfg.icon,
                description: ln.description ?? cfg.description,
                actions: ln.actions ?? cfg.actions,
                ignored_sources: cfg.ignored_sources,
                kind: ln.kind ?? "custom",
              } satisfies ServiceNodeData,
            } as Node;
          }
          if (legacyType === "linkAnchor" || legacyType === "freeArrow") {
            return null;
          }
          if (!ln.type || ln.type === "service") {
            const migratedKind =
              ln.kind === "k8s-cluster" ? "cluster" : ln.kind;
            const svc = data.services.find((s) => s.id === ln.id) ?? null;
            const cfg = serviceConfigs.current[ln.id] ?? {};
            const inContainer = ln.containerNode ?? undefined;
            const baseNode: Partial<Node> = inContainer
              ? { selectable: false, style: { width: CONTAINER_INNER_W }, parentId: inContainer }
              : {};
            if (svc) {
              const n = serviceToNode(
                svc,
                { x: ln.x, y: ln.y },
                cfg.icon,
                cfg.description,
                cfg.actions,
                cfg.ignored_sources,
                migratedKind,
              );
              return inContainer
                ? {
                    ...n,
                    ...baseNode,
                    data: { ...n.data, containerNode: inContainer },
                  }
                : n;
            }
            // Узел service без метрик: сервис мог исчезнуть во время сохранения
            return {
              id: ln.id,
              type: "service",
              position: { x: ln.x, y: ln.y },
              ...baseNode,
              data: {
                label: ln.label ?? ln.id,
                ports: [],
                icon: cfg.icon,
                description: cfg.description,
                actions: cfg.actions,
                ignored_sources: cfg.ignored_sources,
                kind: migratedKind ?? "service",
                ...(inContainer ? { containerNode: inContainer } : {}),
              } satisfies ServiceNodeData & { containerNode?: string },
            } as Node;
          }
          return null;
        })
        .filter(Boolean) as Node[];
      // Groups and containers first so they render behind service nodes
      placed.sort((a, b) => {
        const aBack = a.type === "group" || a.type === "container";
        const bBack = b.type === "group" || b.type === "container";
        if (aBack && !bBack) return -1;
        if (!aBack && bBack) return 1;
        return 0;
      });
      const seenServiceIds = new Set<string>();
      const deduped: Node[] = [];
      for (const n of placed) {
        if (n.type === "service") {
          if (seenServiceIds.has(n.id)) continue;
          seenServiceIds.add(n.id);
        }
        deduped.push(n);
      }
      setNodes(deduped);
      if (layout.edges?.length) {
        setEdges(
          layout.edges
            .map((row) => layoutRowToMapEdge(row as Record<string, unknown>))
            .filter((x): x is MapEdge => x !== null),
        );
      } else {
        setEdges([]);
      }
      scheduleFitAfterLayout();
    });
  }, [projectId, scheduleFitAfterLayout]);

  const probeStatusMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of data.services) {
      map[s.id] = probeNodeStatus(s.ports);
    }
    return map;
  }, [data.services]);

  // Подсветка с палитры (selected / hover)
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => {
        let cls: string | undefined;
        const eff = effectiveServiceIdForNode(n, data.services);
        const status = eff ? (probeStatusMap[eff] ?? "unknown") : "unknown";
        if (n.id === paletteSelectedId)
          cls = `palette-selected palette-selected--${status}`;
        else if (paletteHoverId && n.id === paletteHoverId)
          cls = `palette-hover palette-hover--${status}`;
        return { ...n, className: cls };
      }),
    );
  }, [
    paletteSelectedId,
    paletteHoverId,
    probeStatusMap,
    data.services,
    setNodes,
  ]);

  // Keep serviceConfigs in sync with node data changes
  useEffect(() => {
    nodes.forEach((n) => {
      if (n.type !== "service") return;
      const d = n.data as unknown as ServiceNodeData;
      serviceConfigs.current[n.id] = {
        icon: d.icon,
        description: d.description,
        actions: d.actions,
        ignored_sources: d.ignored_sources,
      };
    });
  }, [nodes]);

  // Обновление портов по каталогу; узлы без записи в каталоге остаются на карте с пустыми портами (серый вид в ServiceNode)
  useEffect(() => {
    if (metricsStale) return;

    setNodes((prev) => {
      const next: Node[] = [];

      for (const n of prev) {
        if (n.type !== "service") {
          next.push(n);
          continue;
        }
        const d = n.data as unknown as ServiceNodeData;
        const directSvc = data.services.find((s) => s.id === n.id) ?? null;
        let byNameSvc: Service | null = null;
        if (!directSvc && (d.ports ?? []).length === 0) {
          const candidates = data.services.filter(
            (s) => s.name === (d.label ?? ""),
          );
          if (candidates.length === 1) byNameSvc = candidates[0];
        }
        const svc = directSvc ?? byNameSvc;

        if (!svc) {
          next.push({ ...n, data: { ...d, ports: [] } });
          continue;
        }

        const nextLabel =
          d.kind && d.kind !== "service" ? (d.label ?? svc.name) : svc.name;
        next.push({
          ...n,
          data: {
            ...d,
            label: nextLabel,
            ports: svc.ports,
            icon: d.icon,
            description: d.description,
            actions: d.actions,
          },
        });
      }

      return next;
    });
  }, [data, metricsStale, setEdges]);

  const onConnect: OnConnect = useCallback(
    (conn) => {
      if (metricsStale || !canvasInteractive) return;
      if (!applyingHistory.current) pushSnapshot();
      setEdges((eds) => addEdge(conn, eds));
    },
    [metricsStale, canvasInteractive, setEdges, pushSnapshot],
  );

  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConn) => {
      if (metricsStale || !canvasInteractive) return;
      if (!applyingHistory.current) pushSnapshot();
      setEdges((eds) => reconnectEdge(oldEdge, newConn, eds));
    },
    [metricsStale, canvasInteractive, setEdges, pushSnapshot],
  );

  /** Как из палитры: свободная позиция в видимой области холста. */
  const addAreaFromSidebar = useCallback(() => {
    if (metricsStale || !canvasInteractive) return;
    if (!applyingHistory.current) pushSnapshot();
    const rect = wrapperRef.current?.getBoundingClientRect() ?? null;
    setNodes((ns) => {
      const position = findFreePositionViewportLeftColumn(
        ns,
        screenToFlowPosition,
        rect,
      );
      const groupCount = ns.filter((n) => n.type === "group").length;
      return [
        {
          id: `group-${Date.now()}`,
          type: "group",
          position,
          style: { width: 260, height: 180, zIndex: -10 + groupCount },
          data: { label: t("defaultGroupLabel") } satisfies GroupNodeData,
        } as Node,
        ...ns,
      ];
    });
  }, [
    metricsStale,
    canvasInteractive,
    setNodes,
    screenToFlowPosition,
    t,
    pushSnapshot,
  ]);

  const addContainerFromSidebar = useCallback(() => {
    if (metricsStale || !canvasInteractive) return;
    if (!applyingHistory.current) pushSnapshot();
    const rect = wrapperRef.current?.getBoundingClientRect() ?? null;
    setNodes((ns) => {
      const rawPos = findFreePositionViewportLeftColumn(
        ns,
        screenToFlowPosition,
        rect,
      );
      // Container is wider than NEW_NODE_W — shift right so it doesn't hug the left edge
      const position = { x: rawPos.x + (CONTAINER_WIDTH - NEW_NODE_W), y: rawPos.y };
      return [
        {
          id: `container-${Date.now()}`,
          type: "container",
          position,
          style: { width: CONTAINER_WIDTH, height: containerHeight(0) },
          data: {
            label: t("defaultContainerLabel"),
            items: [],
          } satisfies ContainerNodeData,
        } as Node,
        ...ns,
      ];
    });
  }, [
    metricsStale,
    canvasInteractive,
    setNodes,
    screenToFlowPosition,
    t,
    pushSnapshot,
  ]);

  const addServiceFromPalette = useCallback(
    (svc: Service) => {
      if (metricsStale || !canvasInteractive) return;
      if (!applyingHistory.current) pushSnapshot();
      const rect = wrapperRef.current?.getBoundingClientRect() ?? null;
      setNodes((ns) => {
        if (ns.some((n) => n.type === "service" && n.id === svc.id)) return ns;
        const position = findFreePositionViewportLeftColumn(
          ns,
          screenToFlowPosition,
          rect,
        );
        const cfg = serviceConfigs.current[svc.id] ?? {};
        return [
          ...ns,
          serviceToNode(
            svc,
            position,
            cfg.icon,
            cfg.description,
            cfg.actions,
            cfg.ignored_sources,
          ),
        ];
      });
    },
    [
      screenToFlowPosition,
      setNodes,
      metricsStale,
      canvasInteractive,
      pushSnapshot,
    ],
  );

  const addComponentFromPalette = useCallback(
    (kindDef: NodeKindDef) => {
      if (metricsStale || !canvasInteractive) return;
      if (!applyingHistory.current) pushSnapshot();
      const rect = wrapperRef.current?.getBoundingClientRect() ?? null;
      const id = `${kindDef.kind}-${Date.now()}`;
      setNodes((ns) => {
        const position = findFreePositionViewportLeftColumn(
          ns,
          screenToFlowPosition,
          rect,
        );
        return [
          ...ns,
          {
            id,
            type: "service",
            position,
            data: {
              label: kindDef.label[lang as "ru" | "en"],
              ports: [],
              kind: kindDef.kind,
            } satisfies ServiceNodeData,
          } as Node,
        ];
      });
    },
    [
      screenToFlowPosition,
      setNodes,
      metricsStale,
      canvasInteractive,
      pushSnapshot,
      lang,
    ],
  );

  const addObjectFromPalette = useCallback(() => {
    const kindDef = NODE_KIND_MAP.get("custom");
    if (kindDef) addComponentFromPalette(kindDef);
  }, [addComponentFromPalette]);

  const persistLayout = useCallback(() => {
    const layoutNodes = nodes.map((n) => ({
      id: n.id,
      x: n.position.x,
      y: n.position.y,
      type: (n.type as "service" | "group" | "container") ?? "service",
      ...(n.type === "group"
        ? {
            label: (n.data as unknown as GroupNodeData).label,
            color: (n.data as unknown as GroupNodeData).color,
            width: n.measured?.width ?? (n.style?.width as number) ?? 260,
            height: n.measured?.height ?? (n.style?.height as number) ?? 180,
            zIndex: (n.style?.zIndex as number) ?? -1,
          }
        : {}),
      ...(n.type === "container"
        ? {
            label: (n.data as unknown as ContainerNodeData).label,
            icon: (n.data as unknown as ContainerNodeData).icon,
            path: (n.data as unknown as ContainerNodeData).path,
            description: (n.data as unknown as ContainerNodeData).description,
            endpoint: (n.data as unknown as ContainerNodeData).endpoint,
            containerItems: (n.data as unknown as ContainerNodeData).items,
          }
        : {}),
      ...(n.type === "service"
        ? {
            label: (n.data as unknown as ServiceNodeData).label,
            kind: (n.data as unknown as ServiceNodeData).kind,
            icon: (n.data as unknown as ServiceNodeData).icon,
            description: (n.data as unknown as ServiceNodeData).description,
            actions: (n.data as unknown as ServiceNodeData).actions,
            ...((n.data as unknown as ServiceNodeData & { containerNode?: string })
              .containerNode
              ? {
                  containerNode: (
                    n.data as unknown as ServiceNodeData & { containerNode: string }
                  ).containerNode,
                }
              : {}),
          }
        : {}),
    }));
    const edgeRows = edges.map((e) => {
      const d = normalizeLayoutEdgeData(e.data);
      const row: Record<string, unknown> = {
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type ?? "default",
      };
      if (Object.keys(d).length > 0) row.data = d;
      if (e.sourceHandle) row.sourceHandle = e.sourceHandle;
      if (e.targetHandle) row.targetHandle = e.targetHandle;
      if (
        e.style &&
        typeof e.style === "object" &&
        e.style !== null &&
        Object.keys(e.style).length > 0
      ) {
        row.style = e.style;
      }
      return row;
    });
    const payload = {
      nodes: layoutNodes,
      groups: [],
      edges: edgeRows,
      service_configs: serviceConfigs.current,
    };
    saveProjectLayout(projectId, payload);
  }, [nodes, edges, projectId]);

  const handleEdgeMetadataSave = useCallback(
    (next: LayoutEdgeData) => {
      if (!edgeEditId) return;
      if (!applyingHistory.current) pushSnapshot();
      setEdges((eds) =>
        eds.map((e) => (e.id === edgeEditId ? { ...e, data: { ...next } } : e)),
      );
      setEdgeEditId(null);
    },
    [edgeEditId, pushSnapshot, setEdges],
  );

  const editingEdge = useMemo(
    () =>
      edgeEditId ? (edges.find((e) => e.id === edgeEditId) ?? null) : null,
    [edgeEditId, edges],
  );

  useEffect(() => {
    if (edgeEditId && !edges.some((e) => e.id === edgeEditId))
      setEdgeEditId(null);
  }, [edges, edgeEditId]);

  useEffect(() => {
    if (!layoutLoaded.current || metricsStale || !isAdmin) return;
    if (persistLayoutTimerRef.current)
      clearTimeout(persistLayoutTimerRef.current);
    persistLayoutTimerRef.current = setTimeout(() => {
      persistLayout();
      persistLayoutTimerRef.current = null;
    }, 500);
    return () => {
      if (persistLayoutTimerRef.current)
        clearTimeout(persistLayoutTimerRef.current);
    };
  }, [nodes, edges, metricsStale, persistLayout]);

  const onCanvas = useMemo(
    () => new Set(nodes.filter((n) => n.type === "service").map((n) => n.id)),
    [nodes],
  );

  const tracedSet = useMemo(() => {
    if (!tracedNodeId) return null;
    return traceConnected(tracedNodeId, edges);
  }, [tracedNodeId, edges]);

  const displayNodes = useMemo(
    () =>
      tracedSet
        ? nodes.map((n) => ({
            ...n,
            style: {
              ...n.style,
              opacity: tracedSet.nodeIds.has(n.id) ? 1 : 0.15,
              transition: "opacity 0.18s",
            },
          }))
        : nodes,
    [nodes, tracedSet],
  );

  const displayEdges = useMemo(
    () =>
      tracedSet
        ? edges.map((e) => ({
            ...e,
            style: {
              ...e.style,
              opacity: tracedSet.edgeIds.has(e.id) ? 1 : 0.08,
              transition: "opacity 0.18s",
            },
          }))
        : edges,
    [edges, tracedSet],
  );

  const tracedNodeLabel = useMemo(() => {
    if (!tracedNodeId) return null;
    const n = nodes.find((x) => x.id === tracedNodeId);
    return (n?.data as { label?: string })?.label ?? tracedNodeId;
  }, [tracedNodeId, nodes]);

  const toggleTrace = useCallback((nodeId: string) => {
    setTracedNodeId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const onBeforeDelete = useCallback(async () => {
    if (metricsStale) return false;
    const s = store.getState();
    return Boolean(
      s.nodesDraggable || s.nodesConnectable || s.elementsSelectable,
    );
  }, [metricsStale, store]);

  const handleZoomIn = useCallback(() => {
    void zoomIn({ duration: 200 });
  }, [zoomIn]);

  const handleZoomOut = useCallback(() => {
    void zoomOut({ duration: 200 });
  }, [zoomOut]);

  const handleFitView = useCallback(() => {
    void fitView({ duration: 320, padding: 0.15 });
  }, [fitView]);

  const handleToggleCanvasInteraction = useCallback(() => {
    if (metricsStale) return;
    const s = store.getState();
    const active =
      s.nodesDraggable || s.nodesConnectable || s.elementsSelectable;
    const next = !active;
    store.setState({
      nodesDraggable: next,
      nodesConnectable: next,
      elementsSelectable: next,
    });
    try {
      sessionStorage.setItem(CANVAS_LOCK_STORAGE_KEY, next ? "0" : "1");
    } catch {
      /* ignore */
    }
  }, [store, metricsStale]);

  return (
    <TraceContext.Provider value={{ tracedNodeId, toggleTrace, canEdit: !metricsStale && isAdmin }}>
      <CollisionContext.Provider value={collidingIds}>
        <DragContext.Provider value={draggingService}>
          <ContainerDropContext.Provider value={pendingContainerDrop}>
          <ServicesContext.Provider
            value={{
              services: data.services,
              probe_sources: data.probe_sources,
              endpoint_label: endpointLabel,
            }}
          >
            <div
              style={{
                display: "flex",
                height: "100%",
                width: "100%",
                minHeight: 0,
              }}
            >
              <div className="palette-sidebar-column">
                <Palette
                  services={data.services}
                  onCanvas={onCanvas}
                  onAddService={addServiceFromPalette}
                  onAddObject={addObjectFromPalette}
                  onAddArea={addAreaFromSidebar}
                  onAddContainer={addContainerFromSidebar}
                  readOnly={metricsStale || !canvasInteractive || !isAdmin}
                  selectedId={paletteSelectedId}
                  onSelect={onPaletteSelect}
                  onHoverChange={setPaletteHoverId}
                  statusMap={probeStatusMap}
                />
              </div>
              <EdgeInteractionContext.Provider
                value={{
                  openEditor: (id) => setEdgeEditId(id),
                  editable: !metricsStale && isAdmin && canvasInteractive,
                }}
              >
                <div
                  ref={wrapperRef}
                  style={{ flex: 1, minHeight: 0, position: "relative" }}
                >
                  {metricsStale && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 4,
                        background: "var(--probemap-metrics-stale-overlay)",
                        pointerEvents: "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 24,
                        boxSizing: "border-box",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: 400,
                          textAlign: "center",
                          fontSize: 14,
                          lineHeight: 1.55,
                          color: "var(--probemap-metrics-stale-text)",
                          fontWeight: 500,
                        }}
                      >
                        {t("metricsStaleOverlay")}
                      </div>
                    </div>
                  )}
                  <div className="probemap-map-poll">
                    <span className="probemap-map-poll__label">
                      {t("pollDataInterval")}
                    </span>
                    <select
                      value={pollIntervalSec}
                      disabled={metricsStale}
                      onChange={(e) => {
                        const v = Number(
                          e.target.value,
                        ) as (typeof POLL_INTERVAL_OPTIONS_SEC)[number];
                        onPollIntervalSecChange(v);
                      }}
                      className="probemap-map-poll__select"
                      aria-label={t("pollDataInterval")}
                    >
                      {POLL_INTERVAL_OPTIONS_SEC.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                          {t("pollIntervalSecondsSuffix")}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleToolbarRefresh}
                      disabled={refreshPending}
                      aria-busy={refreshPending}
                      aria-label={
                        refreshPending ? t("refreshPendingAria") : t("refresh")
                      }
                      className="probemap-outline-hover-btn probemap-toolbar-refresh probemap-map-poll__refresh"
                    >
                      <span
                        style={{
                          fontWeight: refreshLabelBold ? 700 : 400,
                        }}
                      >
                        {t("refresh")}
                      </span>
                    </button>
                  </div>
                  {typeof document !== "undefined" &&
                    document.getElementById("probemap-toolbar-host") &&
                    datasourceStatus &&
                    createPortal(
                      <div
                        title={
                          !datasourceStatus.configured
                            ? t("datasourceStatusUnknown")
                            : datasourceStatus.ok
                              ? t("datasourceStatusOk")
                              : t("datasourceStatusBad")
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "3px 8px",
                          borderRadius: 999,
                          border: "1.5px solid var(--probemap-border)",
                          background: "var(--probemap-bg)",
                          flexShrink: 0,
                          maxWidth: 260,
                        }}
                      >
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            flexShrink: 0,
                            background: !datasourceStatus.configured
                              ? "var(--probemap-border-strong)"
                              : datasourceStatus.ok
                                ? "var(--probemap-status-ok)"
                                : "var(--probemap-danger)",
                            boxShadow: "0 0 0 1px rgba(15,23,42,0.08)",
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--probemap-text)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {datasourceStatus.name || "VictoriaMetrics"}
                        </span>
                      </div>,
                      document.getElementById("probemap-toolbar-host")!,
                    )}
                  <div
                    className="probemap-reactflow-root"
                    style={{
                      width: "100%",
                      height: "100%",
                      minHeight: 0,
                      position: "relative",
                      ["--probemap-vp-zoom" as string]: String(
                        Math.max(0.08, viewportZoom),
                      ),
                    }}
                  >
                    {tracedNodeId && tracedNodeLabel && (
                      <div
                        style={{
                          position: "absolute",
                          top: 10,
                          left: "50%",
                          transform: "translateX(-50%)",
                          zIndex: 5,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 10px 5px 12px",
                          borderRadius: 999,
                          background: "var(--probemap-bg)",
                          border: "1.5px solid var(--probemap-border)",
                          boxShadow: "0 2px 8px rgba(15,23,42,0.12)",
                          fontSize: 12,
                          color: "var(--probemap-text)",
                          fontWeight: 500,
                          whiteSpace: "nowrap",
                          pointerEvents: "all",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: "var(--probemap-trace-accent)",
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {tracedNodeLabel}
                        </span>
                        <button
                          type="button"
                          aria-label={t("pathTraceClearAria")}
                          onClick={() => setTracedNodeId(null)}
                          className="probemap-btn probemap-btn--close"
                          style={{ fontSize: 14 }}
                        >
                          ×
                        </button>
                      </div>
                    )}
                    <ReactFlow
                      className={!isAdmin ? "probemap--viewer" : undefined}
                      nodes={displayNodes}
                      edges={displayEdges}
                      onNodesChange={onNodesChange}
                      onEdgesChange={onEdgesChange}
                      onConnect={onConnect}
                      onReconnect={onReconnect}
                      onNodeDrag={onNodeDrag}
                      onNodeDragStop={onNodeDragStop}
                      nodeTypes={NODE_TYPES}
                      edgeTypes={EDGE_TYPES}
                      connectionMode={ConnectionMode.Loose}
                      defaultEdgeOptions={{ type: "default", data: {}, zIndex: 1 }}
                      nodesDraggable={!metricsStale && isAdmin && canvasInteractive}
                      nodesConnectable={!metricsStale && isAdmin && canvasInteractive}
                      edgesReconnectable={!metricsStale && isAdmin && canvasInteractive}
                      elementsSelectable={!metricsStale && canvasInteractive}
                      onBeforeDelete={onBeforeDelete}
                    >
                      <Background color="var(--probemap-text-faint)" gap={16} />
                    </ReactFlow>
                  </div>

                  <MapObjectsBar
                    onZoomIn={handleZoomIn}
                    onZoomOut={handleZoomOut}
                    onFitView={handleFitView}
                    onUndo={undo}
                    onRedo={redo}
                    canUndo={historyTick >= 0 && undoStack.current.length > 0}
                    canRedo={historyTick >= 0 && redoStack.current.length > 0}
                    canvasInteractive={!metricsStale && canvasInteractive}
                    onToggleCanvasInteraction={isAdmin ? handleToggleCanvasInteraction : undefined}
                    readOnly={metricsStale}
                    addBlocked={!metricsStale && !canvasInteractive}
                    freezeToolbar={metricsStale}
                  />
                </div>
              </EdgeInteractionContext.Provider>
            </div>

            <EdgeMetadataModal
              open={edgeEditId !== null && editingEdge !== null}
              initial={normalizeLayoutEdgeData(editingEdge?.data)}
              onSave={handleEdgeMetadataSave}
              onClose={() => setEdgeEditId(null)}
            />

            {confirmDelete &&
              createPortal(
                <div
                  data-probemap-modal
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setConfirmDelete(null);
                      setConfirmText("");
                    }
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
                    style={{
                      background: "var(--probemap-modal-bg)",
                      borderRadius: 10,
                      width: 360,
                      maxWidth: "min(360px, calc(100vw - 48px))",
                      boxSizing: "border-box",
                      overflow: "hidden",
                      boxShadow: "0 8px 32px rgba(0,0,0,.18)",
                      padding: "20px 24px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "var(--probemap-text)",
                        marginBottom: 12,
                      }}
                    >
                      {t("removeFromCanvas")}
                    </div>
                    <DeleteConfirmNameHint name={confirmDelete.label} />
                    <input
                      autoFocus
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          confirmText === confirmDelete.label
                        )
                          doConfirmDelete();
                        if (e.key === "Escape") {
                          setConfirmDelete(null);
                          setConfirmText("");
                        }
                      }}
                      placeholder={confirmDelete.label}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "7px 10px",
                        borderRadius: 6,
                        fontSize: 13,
                        border: "1.5px solid var(--probemap-border)",
                        outline: "none",
                        color: "var(--probemap-text)",
                        background: "var(--probemap-input-bg)",
                        marginBottom: 16,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(null);
                          setConfirmText("");
                        }}
                        className="probemap-btn probemap-btn--ghost probemap-btn--sm"
                      >
                        {t("cancel")}
                      </button>
                      <button
                        type="button"
                        onClick={doConfirmDelete}
                        disabled={confirmText !== confirmDelete.label}
                        className="probemap-btn probemap-btn--danger probemap-btn--sm"
                      >
                        {t("delete")}
                      </button>
                    </div>
                  </div>
                </div>,
                document.body,
              )}
          </ServicesContext.Provider>
          </ContainerDropContext.Provider>
        </DragContext.Provider>
      </CollisionContext.Provider>
    </TraceContext.Provider>
  );
}

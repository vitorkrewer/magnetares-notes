import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { CustomSelect } from "./CustomSelect";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Grid,
  Hand,
  Link2,
  ListTodo,
  Maximize2,
  Minus,
  MousePointer2,
  Plus,
  Redo2,
  Save,
  Sparkles,
  SquareDashed,
  StickyNote,
  Target,
  Trash2,
  Undo2,
} from "lucide-react";
import { downloadBlob } from "./exportUtils";
import { getIdeaFlowIconComponent, resolveIdeaFlowColorHex } from "./IdeaFlowDialog";
import {
  computeEdgeGeometry,
  computeRawEdgeGeometry,
  getHandlePoint,
  getNodeDimensions,
  HandleSide,
  IDEA_NODE_COLORS,
  inferBestHandles,
  NODE_TYPE_DEFAULTS,
} from "./ideaFlowGeometry";
import { base64ToPngBlob, exportIdeaFlowToPngBase64 } from "./ideaFlowPngExport";
import { IdeaNodeLinkModal, IdeaReferenceKind, IdeaReferenceSelection } from "./IdeaNodeLinkModal";
import {
  IdeaEdgeRecord,
  IdeaFlowGraphRecord,
  IdeaFlowRecord,
  IdeaNodeRecord,
  NavigationRecord,
  SaveIdeaFlowGraphInput,
} from "./types";

export type IdeaFlowCanvasProps = {
  flow: IdeaFlowRecord;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onBack: () => void;
  onGraphSaved?: (flow: IdeaFlowRecord) => void;
  onNavigateToReference?: (
    kind: IdeaReferenceKind,
    id: string
  ) => void;
  navigation?: NavigationRecord;
  theme?: "light" | "dark";
  demoGraph?: IdeaFlowGraphRecord;
  onSaveDemoGraph?: (input: SaveIdeaFlowGraphInput) => IdeaFlowGraphRecord;
};

type ToolMode = "select" | "pan";
type SaveStatus = "saved" | "saving" | "error";

type GraphSnapshot = {
  nodes: IdeaNodeRecord[];
  edges: IdeaEdgeRecord[];
};

type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

type InteractionState =
  | { kind: "none" }
  | {
      kind: "pan";
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
    }
  | {
      kind: "drag-node";
      nodeId: string;
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
      snapshotBefore: GraphSnapshot;
      moved: boolean;
    }
  | {
      kind: "resize-node";
      nodeId: string;
      startClientX: number;
      startClientY: number;
      originW: number;
      originH: number;
      snapshotBefore: GraphSnapshot;
      resized: boolean;
    }
  | {
      kind: "connect";
      sourceNodeId: string;
      sourceHandle: HandleSide;
      pointerWorldX: number;
      pointerWorldY: number;
      hoverNodeId: string | null;
      hoverHandle: HandleSide | null;
    };

const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3.5;
const GRID_SIZE = 16;
const MAX_HISTORY = 60;

const EMPTY_NAVIGATION: NavigationRecord = {
  folders: [],
  tags: [],
  smartFolders: [],
  stickerBoards: [],
  taskLists: [],
};

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function snapValue(val: number, enabled: boolean): number {
  if (!enabled) return Math.round(val);
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

function cloneSnapshot(nodes: IdeaNodeRecord[], edges: IdeaEdgeRecord[]): GraphSnapshot {
  return {
    nodes: nodes.map((n) => ({ ...n })),
    edges: edges.map((e) => ({ ...e })),
  };
}

function getReferenceMeta(kind: string): { label: string; color: string } {
  switch (kind) {
    case "note":
      return { label: "Nota", color: "#4b75ff" };
    case "taskList":
      return { label: "Lista", color: "#10b981" };
    case "task":
      return { label: "Tarefa", color: "#059669" };
    case "stickerBoard":
      return { label: "Quadro", color: "#f59e0b" };
    case "sticker":
      return { label: "Sticker", color: "#d97706" };
    default:
      return { label: "Referência", color: "#a855f7" };
  }
}

export function IdeaFlowCanvas({
  flow,
  sidebarOpen,
  onOpenSidebar,
  onBack,
  onGraphSaved,
  onNavigateToReference,
  navigation = EMPTY_NAVIGATION,
  theme = "light",
  demoGraph,
  onSaveDemoGraph,
}: IdeaFlowCanvasProps) {
  const [nodes, setNodes] = useState<IdeaNodeRecord[]>([]);
  const [edges, setEdges] = useState<IdeaEdgeRecord[]>([]);
  const [viewport, setViewport] = useState<ViewportState>({
    x: flow.viewportX || 0,
    y: flow.viewportY || 0,
    zoom: clampZoom(flow.viewportZoom || 1),
  });
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [exportingPng, setExportingPng] = useState(false);

  const [toolMode, setToolMode] = useState<ToolMode>("select");
  const [spacePressed, setSpacePressed] = useState(false);
  const [snapToGrid, setSnapToGrid] = useState(true);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const [linkModalState, setLinkModalState] = useState<
    | { mode: "create" }
    | { mode: "edit"; nodeId: string; currentKind?: string; currentId?: string }
    | null
  >(null);

  const [undoStack, setUndoStack] = useState<GraphSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<GraphSnapshot[]>([]);

  const stageRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState>({ kind: "none" });
  const [connectPreview, setConnectPreview] = useState<{
    sourceNodeId: string;
    sourceHandle: HandleSide;
    pointerWorldX: number;
    pointerWorldY: number;
    hoverNodeId: string | null;
    hoverHandle: HandleSide | null;
  } | null>(null);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const snapRef = useRef(snapToGrid);
  snapRef.current = snapToGrid;

  const hasLoadedRef = useRef(false);
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const minimapDraggingRef = useRef(false);

  const colorHex = resolveIdeaFlowColorHex(flow.color);
  const FlowIcon = getIdeaFlowIconComponent(flow.icon);

  const persistGraph = useCallback(
    async (
      nextNodes: IdeaNodeRecord[],
      nextEdges: IdeaEdgeRecord[],
      nextViewport: ViewportState
    ) => {
      setSaveStatus("saving");
      const input: SaveIdeaFlowGraphInput = {
        flowId: flow.id,
        viewportX: nextViewport.x,
        viewportY: nextViewport.y,
        viewportZoom: nextViewport.zoom,
        nodes: nextNodes,
        edges: nextEdges,
      };
      try {
        const bridge = window.go?.main?.App;
        if (bridge?.SaveIdeaFlowGraph) {
          const saved = await bridge.SaveIdeaFlowGraph(input);
          onGraphSaved?.(saved.flow);
        } else if (onSaveDemoGraph) {
          const saved = onSaveDemoGraph(input);
          onGraphSaved?.(saved.flow);
        }
        dirtyRef.current = false;
        setSaveStatus("saved");
      } catch {
        setSaveStatus("error");
      }
    },
    [flow.id, onGraphSaved, onSaveDemoGraph]
  );

  const scheduleAutoSave = useCallback(() => {
    if (!hasLoadedRef.current) return;
    dirtyRef.current = true;
    setSaveStatus("saving");
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistGraph(nodesRef.current, edgesRef.current, viewportRef.current);
    }, 650);
  }, [persistGraph]);

  // Mantém rótulos de listas de tarefas e quadros de stickers sincronizados caso sejam renomeados na sidebar
  useEffect(() => {
    if (!hasLoadedRef.current) return;
    const taskListMap = new Map((navigation.taskLists ?? []).map((l) => [l.id, l.name]));
    const boardMap = new Map((navigation.stickerBoards ?? []).map((b) => [b.id, b.name]));

    setNodes((prev) => {
      let changed = false;
      const next = prev.map((node) => {
        if (!node.linkedKind || !node.linkedId) return node;
        let freshName: string | undefined;
        if (node.linkedKind === "taskList") {
          freshName = taskListMap.get(node.linkedId);
        } else if (node.linkedKind === "stickerBoard") {
          freshName = boardMap.get(node.linkedId);
        }
        if (!freshName || freshName === node.linkedLabel) return node;
        changed = true;
        const oldLinked = node.linkedLabel;
        const nextLabel = !node.label || node.label === oldLinked ? freshName : node.label;
        return { ...node, label: nextLabel, linkedLabel: freshName };
      });
      return changed ? next : prev;
    });
  }, [navigation.taskLists, navigation.stickerBoards]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (dirtyRef.current) {
        void persistGraph(nodesRef.current, edgesRef.current, viewportRef.current);
      }
    };
  }, [persistGraph]);

  // Load graph when flow.id changes
  useEffect(() => {
    let cancelled = false;
    hasLoadedRef.current = false;
    dirtyRef.current = false;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEditingNodeId(null);
    setUndoStack([]);
    setRedoStack([]);

    const loadGraph = async () => {
      setLoading(true);
      setError("");
      const bridge = window.go?.main?.App;
      try {
        let loaded: IdeaFlowGraphRecord;
        if (bridge?.GetIdeaFlowGraph) {
          loaded = await bridge.GetIdeaFlowGraph(flow.id);
        } else {
          loaded = demoGraph ?? { flow, nodes: [], edges: [] };
        }
        if (cancelled) return;
        setNodes(loaded.nodes ?? []);
        setEdges(loaded.edges ?? []);
        setViewport({
          x: loaded.flow.viewportX || 0,
          y: loaded.flow.viewportY || 0,
          zoom: clampZoom(loaded.flow.viewportZoom || 1),
        });
        hasLoadedRef.current = true;
        setSaveStatus("saved");
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Não foi possível carregar o mapa mental.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadGraph();
    return () => {
      cancelled = true;
    };
  }, [flow.id]);

  const pushHistory = useCallback((snapshot: GraphSnapshot) => {
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY - 1)), snapshot]);
    setRedoStack([]);
  }, []);

  const commitGraphChange = useCallback(
    (
      nextNodes: IdeaNodeRecord[],
      nextEdges: IdeaEdgeRecord[],
      recordHistory = true
    ) => {
      if (recordHistory) {
        pushHistory(cloneSnapshot(nodesRef.current, edgesRef.current));
      }
      setNodes(nextNodes);
      setEdges(nextEdges);
      scheduleAutoSave();
    },
    [pushHistory, scheduleAutoSave]
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      setRedoStack((r) => [...r, cloneSnapshot(nodesRef.current, edgesRef.current)]);
      setNodes(target.nodes);
      setEdges(target.edges);
      scheduleAutoSave();
      return prev.slice(0, -1);
    });
  }, [scheduleAutoSave]);

  const handleRedo = useCallback(() => {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      const target = prev[prev.length - 1];
      setUndoStack((u) => [...u, cloneSnapshot(nodesRef.current, edgesRef.current)]);
      setNodes(target.nodes);
      setEdges(target.edges);
      scheduleAutoSave();
      return prev.slice(0, -1);
    });
  }, [scheduleAutoSave]);

  const screenToWorld = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const vp = viewportRef.current;
    return {
      x: (clientX - rect.left - vp.x) / vp.zoom,
      y: (clientY - rect.top - vp.y) / vp.zoom,
    };
  }, []);

  const getViewportCenterWorld = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    if (!rect) return { x: 240, y: 180 };
    return {
      x: (rect.width / 2 - vp.x) / vp.zoom,
      y: (rect.height / 2 - vp.y) / vp.zoom,
    };
  }, []);

  const addNode = useCallback(
    (
      nodeType: string,
      opts?: {
        label?: string;
        color?: string;
        linkedKind?: string;
        linkedId?: string;
        linkedLabel?: string;
      }
    ) => {
      const defaults = NODE_TYPE_DEFAULTS[nodeType] ?? NODE_TYPE_DEFAULTS.idea;
      const center = getViewportCenterWorld();
      const offsetCount = nodesRef.current.length % 6;
      const rawX = center.x - defaults.width / 2 + offsetCount * 18;
      const rawY = center.y - defaults.height / 2 + offsetCount * 18;
      const now = new Date().toISOString();

      const newNode: IdeaNodeRecord = {
        id: makeId("node"),
        flowId: flow.id,
        nodeType,
        label: opts?.label ?? defaults.label,
        content: "",
        x: snapValue(rawX, snapRef.current),
        y: snapValue(rawY, snapRef.current),
        width: defaults.width,
        height: defaults.height,
        color: opts?.color ?? defaults.color,
        linkedKind: opts?.linkedKind ?? "",
        linkedId: opts?.linkedId ?? "",
        linkedLabel: opts?.linkedLabel ?? "",
        styleJson: "{}",
        createdAt: now,
        updatedAt: now,
      };

      const nextNodes = [...nodesRef.current, newNode];
      commitGraphChange(nextNodes, edgesRef.current);
      setSelectedNodeId(newNode.id);
      setSelectedEdgeId(null);
      if (nodeType !== "reference") {
        setEditingNodeId(newNode.id);
        setEditingLabel(newNode.label);
      }
    },
    [commitGraphChange, flow.id, getViewportCenterWorld]
  );

  const duplicateSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;
    const source = nodesRef.current.find((n) => n.id === selectedNodeId);
    if (!source) return;
    const now = new Date().toISOString();
    const copy: IdeaNodeRecord = {
      ...source,
      id: makeId("node"),
      x: snapValue(source.x + 32, snapRef.current),
      y: snapValue(source.y + 32, snapRef.current),
      label: source.label ? `${source.label} (cópia)` : "Cópia",
      createdAt: now,
      updatedAt: now,
    };
    commitGraphChange([...nodesRef.current, copy], edgesRef.current);
    setSelectedNodeId(copy.id);
    setSelectedEdgeId(null);
  }, [commitGraphChange, selectedNodeId]);

  const deleteSelection = useCallback(() => {
    if (selectedNodeId) {
      const nextNodes = nodesRef.current.filter((n) => n.id !== selectedNodeId);
      const nextEdges = edgesRef.current.filter(
        (e) => e.sourceNodeId !== selectedNodeId && e.targetNodeId !== selectedNodeId
      );
      commitGraphChange(nextNodes, nextEdges);
      setSelectedNodeId(null);
      return;
    }
    if (selectedEdgeId) {
      const nextEdges = edgesRef.current.filter((e) => e.id !== selectedEdgeId);
      commitGraphChange(nodesRef.current, nextEdges);
      setSelectedEdgeId(null);
    }
  }, [commitGraphChange, selectedEdgeId, selectedNodeId]);

  const fitView = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentNodes = nodesRef.current;
    if (currentNodes.length === 0) {
      setViewport({ x: 0, y: 0, zoom: 1 });
      scheduleAutoSave();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of currentNodes) {
      const { width, height } = getNodeDimensions(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    }
    const pad = 72;
    const contentW = Math.max(1, maxX - minX + pad * 2);
    const contentH = Math.max(1, maxY - minY + pad * 2);
    const zoom = clampZoom(Math.min(rect.width / contentW, rect.height / contentH, 1.35));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    setViewport({
      x: rect.width / 2 - centerX * zoom,
      y: rect.height / 2 - centerY * zoom,
      zoom,
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const zoomAroundCenter = useCallback(
    (factor: number) => {
      const rect = stageRef.current?.getBoundingClientRect();
      if (!rect) return;
      setViewport((prev) => {
        const nextZoom = clampZoom(prev.zoom * factor);
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const wx = (cx - prev.x) / prev.zoom;
        const wy = (cy - prev.y) / prev.zoom;
        return {
          x: cx - wx * nextZoom,
          y: cy - wy * nextZoom,
          zoom: nextZoom,
        };
      });
      scheduleAutoSave();
    },
    [scheduleAutoSave]
  );

  // Wheel zoom centered on pointer
  useEffect(() => {
    const stageEl = stageRef.current;
    if (!stageEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = stageEl.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const zoomFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;

      setViewport((prev) => {
        const nextZoom = clampZoom(prev.zoom * zoomFactor);
        const wx = (px - prev.x) / prev.zoom;
        const wy = (py - prev.y) / prev.zoom;
        return {
          x: px - wx * nextZoom,
          y: py - wy * nextZoom,
          zoom: nextZoom,
        };
      });
      scheduleAutoSave();
    };

    stageEl.addEventListener("wheel", handleWheel, { passive: false });
    return () => stageEl.removeEventListener("wheel", handleWheel);
  }, [loading, scheduleAutoSave]);

  // Keyboard shortcuts
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (linkModalState) return;

      if (e.code === "Space" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpacePressed(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        void persistGraph(nodesRef.current, edgesRef.current, viewportRef.current);
        return;
      }

      if (isTypingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicateSelectedNode();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    deleteSelection,
    duplicateSelectedNode,
    handleRedo,
    handleUndo,
    linkModalState,
    persistGraph,
  ]);

  // Global mouse move/up for dragging, panning, resizing, connecting
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const state = interactionRef.current;
      if (state.kind === "none") return;

      if (state.kind === "pan") {
        const dx = e.clientX - state.startClientX;
        const dy = e.clientY - state.startClientY;
        setViewport((prev) => ({
          ...prev,
          x: state.originX + dx,
          y: state.originY + dy,
        }));
        return;
      }

      if (state.kind === "drag-node") {
        const zoom = viewportRef.current.zoom;
        const dx = (e.clientX - state.startClientX) / zoom;
        const dy = (e.clientY - state.startClientY) / zoom;
        if (!state.moved && Math.hypot(dx, dy) > 2) {
          state.moved = true;
        }
        const nextX = snapValue(state.originX + dx, snapRef.current);
        const nextY = snapValue(state.originY + dy, snapRef.current);
        setNodes((prev) =>
          prev.map((n) => (n.id === state.nodeId ? { ...n, x: nextX, y: nextY } : n))
        );
        return;
      }

      if (state.kind === "resize-node") {
        const zoom = viewportRef.current.zoom;
        const dx = (e.clientX - state.startClientX) / zoom;
        const dy = (e.clientY - state.startClientY) / zoom;
        if (!state.resized && Math.hypot(dx, dy) > 2) {
          state.resized = true;
        }
        const target = nodesRef.current.find((n) => n.id === state.nodeId);
        const isGroup = target?.nodeType === "group";
        const minW = isGroup ? 220 : 140;
        const minH = isGroup ? 140 : 56;
        const nextW = Math.max(minW, snapValue(state.originW + dx, snapRef.current));
        const nextH = Math.max(minH, snapValue(state.originH + dy, snapRef.current));
        setNodes((prev) =>
          prev.map((n) =>
            n.id === state.nodeId ? { ...n, width: nextW, height: nextH } : n
          )
        );
        return;
      }

      if (state.kind === "connect") {
        const world = screenToWorld(e.clientX, e.clientY);
        state.pointerWorldX = world.x;
        state.pointerWorldY = world.y;

        // Detect hover over another node
        let hoverNodeId: string | null = null;
        let hoverHandle: HandleSide | null = null;
        const sourceNode = nodesRef.current.find((n) => n.id === state.sourceNodeId);
        for (let i = nodesRef.current.length - 1; i >= 0; i -= 1) {
          const candidate = nodesRef.current[i];
          if (candidate.id === state.sourceNodeId) continue;
          const dim = getNodeDimensions(candidate);
          if (
            world.x >= candidate.x - 14 &&
            world.x <= candidate.x + dim.width + 14 &&
            world.y >= candidate.y - 14 &&
            world.y <= candidate.y + dim.height + 14
          ) {
            hoverNodeId = candidate.id;
            if (sourceNode) {
              hoverHandle = inferBestHandles(sourceNode, candidate).targetHandle;
            }
            break;
          }
        }
        state.hoverNodeId = hoverNodeId;
        state.hoverHandle = hoverHandle;
        setConnectPreview({
          sourceNodeId: state.sourceNodeId,
          sourceHandle: state.sourceHandle,
          pointerWorldX: world.x,
          pointerWorldY: world.y,
          hoverNodeId,
          hoverHandle,
        });
      }
    };

    const handleMouseUp = () => {
      const state = interactionRef.current;
      if (state.kind === "none") return;

      if (state.kind === "pan") {
        scheduleAutoSave();
      } else if (state.kind === "drag-node") {
        if (state.moved) {
          pushHistory(state.snapshotBefore);
          scheduleAutoSave();
        }
      } else if (state.kind === "resize-node") {
        if (state.resized) {
          pushHistory(state.snapshotBefore);
          scheduleAutoSave();
        }
      } else if (state.kind === "connect") {
        if (state.hoverNodeId && state.hoverNodeId !== state.sourceNodeId) {
          const targetNode = nodesRef.current.find((n) => n.id === state.hoverNodeId);
          const sourceNode = nodesRef.current.find((n) => n.id === state.sourceNodeId);
          if (sourceNode && targetNode) {
            const targetHandle =
              state.hoverHandle ?? inferBestHandles(sourceNode, targetNode).targetHandle;
            const now = new Date().toISOString();
            const newEdge: IdeaEdgeRecord = {
              id: makeId("edge"),
              flowId: flow.id,
              sourceNodeId: sourceNode.id,
              targetNodeId: targetNode.id,
              sourceHandle: state.sourceHandle,
              targetHandle,
              label: "",
              edgeType: "bezier",
              color: "",
              animated: false,
              styleJson: "{}",
              createdAt: now,
              updatedAt: now,
            };
            commitGraphChange(nodesRef.current, [...edgesRef.current, newEdge]);
            setSelectedEdgeId(newEdge.id);
            setSelectedNodeId(null);
          }
        }
        setConnectPreview(null);
      }

      interactionRef.current = { kind: "none" };
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [commitGraphChange, flow.id, pushHistory, scheduleAutoSave, screenToWorld]);

  const handleStageMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    const isMiddle = e.button === 1;
    const isPanMode = toolMode === "pan" || spacePressed;
    if (isMiddle || (e.button === 0 && isPanMode) || e.button === 0) {
      if (e.button === 0 && !isPanMode) {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setEditingNodeId(null);
      }
      interactionRef.current = {
        kind: "pan",
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: viewportRef.current.x,
        originY: viewportRef.current.y,
      };
    }
  };

  const handleNodeMouseDown = (e: ReactMouseEvent, node: IdeaNodeRecord) => {
    if (e.button === 1 || toolMode === "pan" || spacePressed) {
      return;
    }
    e.stopPropagation();
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
    if (editingNodeId && editingNodeId !== node.id) {
      setEditingNodeId(null);
    }

    interactionRef.current = {
      kind: "drag-node",
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: node.x,
      originY: node.y,
      snapshotBefore: cloneSnapshot(nodesRef.current, edgesRef.current),
      moved: false,
    };
  };

  const handleResizeMouseDown = (e: ReactMouseEvent, node: IdeaNodeRecord) => {
    e.stopPropagation();
    const { width, height } = getNodeDimensions(node);
    interactionRef.current = {
      kind: "resize-node",
      nodeId: node.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originW: width,
      originH: height,
      snapshotBefore: cloneSnapshot(nodesRef.current, edgesRef.current),
      resized: false,
    };
  };

  const handleHandleMouseDown = (
    e: ReactMouseEvent,
    node: IdeaNodeRecord,
    side: HandleSide
  ) => {
    e.stopPropagation();
    const pt = getHandlePoint(node, side);
    interactionRef.current = {
      kind: "connect",
      sourceNodeId: node.id,
      sourceHandle: side,
      pointerWorldX: pt.x,
      pointerWorldY: pt.y,
      hoverNodeId: null,
      hoverHandle: null,
    };
    setConnectPreview({
      sourceNodeId: node.id,
      sourceHandle: side,
      pointerWorldX: pt.x,
      pointerWorldY: pt.y,
      hoverNodeId: null,
      hoverHandle: null,
    });
  };

  const commitInlineLabel = () => {
    if (!editingNodeId) return;
    const trimmed = editingLabel.trim();
    const target = nodesRef.current.find((n) => n.id === editingNodeId);
    setEditingNodeId(null);
    if (!target || !trimmed || trimmed === target.label) return;
    const nextNodes = nodesRef.current.map((n) =>
      n.id === target.id
        ? { ...n, label: trimmed, updatedAt: new Date().toISOString() }
        : n
    );
    commitGraphChange(nextNodes, edgesRef.current);
  };

  const updateSelectedNode = (patch: Partial<IdeaNodeRecord>, pushUndo = false) => {
    if (!selectedNodeId) return;
    const now = new Date().toISOString();
    const nextNodes = nodesRef.current.map((n) =>
      n.id === selectedNodeId ? { ...n, ...patch, updatedAt: now } : n
    );
    commitGraphChange(nextNodes, edgesRef.current, pushUndo);
  };

  const updateSelectedEdge = (patch: Partial<IdeaEdgeRecord>, pushUndo = false) => {
    if (!selectedEdgeId) return;
    const now = new Date().toISOString();
    const nextEdges = edgesRef.current.map((edge) =>
      edge.id === selectedEdgeId ? { ...edge, ...patch, updatedAt: now } : edge
    );
    commitGraphChange(nodesRef.current, nextEdges, pushUndo);
  };

  const handleExportPng = async () => {
    if (exportingPng) return;
    setExportingPng(true);
    setExportNotice("");
    try {
      const base64 = await exportIdeaFlowToPngBase64(
        { title: flow.title, nodes: nodesRef.current, edges: edgesRef.current },
        theme
      );
      const safeName = (flow.title || "fluxo-de-ideias")
        .replace(/[\\/:*?"<>|]/g, "-")
        .trim();
      const bridge = window.go?.main?.App;
      if (bridge?.ExportIdeaFlowPNG) {
        const savedPath = await bridge.ExportIdeaFlowPNG(`${safeName}.png`, base64);
        if (savedPath) {
          setExportNotice("PNG exportado com sucesso!");
        }
      } else {
        downloadBlob(`${safeName}.png`, base64ToPngBlob(base64));
        setExportNotice("PNG baixado com sucesso!");
      }
      window.setTimeout(() => setExportNotice(""), 3200);
    } catch (err: any) {
      setError(err?.message || "Não foi possível exportar a imagem PNG.");
    } finally {
      setExportingPng(false);
    }
  };

  const handleLinkSelected = (selection: IdeaReferenceSelection) => {
    if (!linkModalState) return;
    const refMeta = getReferenceMeta(selection.linkedKind);
    if (linkModalState.mode === "create") {
      addNode("reference", {
        label: selection.linkedLabel,
        color: refMeta.color,
        linkedKind: selection.linkedKind,
        linkedId: selection.linkedId,
        linkedLabel: selection.linkedLabel,
      });
    } else {
      const targetId = linkModalState.nodeId;
      const now = new Date().toISOString();
      const nextNodes = nodesRef.current.map((n) =>
        n.id === targetId
          ? {
              ...n,
              linkedKind: selection.linkedKind,
              linkedId: selection.linkedId,
              linkedLabel: selection.linkedLabel,
              label:
                !n.label || n.label === "Referência"
                  ? selection.linkedLabel
                  : n.label,
              updatedAt: now,
            }
          : n
      );
      commitGraphChange(nextNodes, edgesRef.current);
    }
    setLinkModalState(null);
  };

  const selectedNode = useMemo(
    () => (selectedNodeId ? nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [nodes, selectedNodeId]
  );

  const selectedEdge = useMemo(
    () => (selectedEdgeId ? edges.find((e) => e.id === selectedEdgeId) ?? null : null),
    [edges, selectedEdgeId]
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, IdeaNodeRecord>();
    for (const n of nodes) map.set(n.id, n);
    return map;
  }, [nodes]);

  const groupNodes = useMemo(
    () => nodes.filter((n) => n.nodeType === "group"),
    [nodes]
  );
  const regularNodes = useMemo(
    () => nodes.filter((n) => n.nodeType !== "group"),
    [nodes]
  );

  // Minimap bounds calculation
  const minimapBounds = useMemo(() => {
    let minX = -200;
    let minY = -150;
    let maxX = 800;
    let maxY = 550;
    if (nodes.length > 0) {
      minX = Infinity;
      minY = Infinity;
      maxX = -Infinity;
      maxY = -Infinity;
      for (const n of nodes) {
        const d = getNodeDimensions(n);
        minX = Math.min(minX, n.x - 100);
        minY = Math.min(minY, n.y - 100);
        maxX = Math.max(maxX, n.x + d.width + 100);
        maxY = Math.max(maxY, n.y + d.height + 100);
      }
    }
    const width = Math.max(400, maxX - minX);
    const height = Math.max(300, maxY - minY);
    return { minX, minY, width, height };
  }, [nodes]);

  const handleMinimapPointer = (e: ReactMouseEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const stageRect = stageRef.current?.getBoundingClientRect();
    if (!stageRect) return;
    const relX = (e.clientX - svgRect.left) / svgRect.width;
    const relY = (e.clientY - svgRect.top) / svgRect.height;
    const worldX = minimapBounds.minX + relX * minimapBounds.width;
    const worldY = minimapBounds.minY + relY * minimapBounds.height;
    setViewport((prev) => ({
      ...prev,
      x: stageRect.width / 2 - worldX * prev.zoom,
      y: stageRect.height / 2 - worldY * prev.zoom,
    }));
  };

  // Preview connection path
  const previewPath = useMemo(() => {
    if (!connectPreview) return null;
    const source = nodeMap.get(connectPreview.sourceNodeId);
    if (!source) return null;
    const start = getHandlePoint(source, connectPreview.sourceHandle);
    const end = {
      x: connectPreview.pointerWorldX,
      y: connectPreview.pointerWorldY,
    };
    return computeRawEdgeGeometry(
      start,
      end,
      connectPreview.sourceHandle,
      connectPreview.hoverHandle || "left",
      "bezier"
    ).svgPath;
  }, [connectPreview, nodeMap]);

  // Scalable SVG grid pattern
  const gridStep = GRID_SIZE * viewport.zoom;
  const patternOffsetX = ((viewport.x % gridStep) + gridStep) % gridStep;
  const patternOffsetY = ((viewport.y % gridStep) + gridStep) % gridStep;
  const dotRadius = Math.max(0.8, Math.min(1.8, viewport.zoom * 1.15));

  const stageRect = stageRef.current?.getBoundingClientRect();
  const vpWorldX = -viewport.x / viewport.zoom;
  const vpWorldY = -viewport.y / viewport.zoom;
  const vpWorldW = (stageRect?.width ?? 900) / viewport.zoom;
  const vpWorldH = (stageRect?.height ?? 600) / viewport.zoom;

  const isPanCursor = toolMode === "pan" || spacePressed;

  const renderNodeCard = (node: IdeaNodeRecord) => {
    const { width, height } = getNodeDimensions(node);
    const isSelected = selectedNodeId === node.id;
    const isEditing = editingNodeId === node.id;
    const isGroup = node.nodeType === "group";
    const isRoot = node.nodeType === "root";
    const isDecision = node.nodeType === "decision";
    const isReference = node.nodeType === "reference" || Boolean(node.linkedId);
    const nodeColor = node.color || NODE_TYPE_DEFAULTS[node.nodeType]?.color || "#4b75ff";
    const refMeta = getReferenceMeta(node.linkedKind);
    const isConnectTarget = connectPreview?.hoverNodeId === node.id;

    return (
      <div
        key={node.id}
        className={`idea-node ${isGroup ? "idea-node-group" : ""} ${
          isRoot ? "idea-node-root" : ""
        } ${isDecision ? "idea-node-decision" : ""} ${
          node.nodeType === "note" ? "idea-node-note" : ""
        } ${isSelected ? "selected" : ""} ${
          isConnectTarget ? "connect-target" : ""
        }`}
        style={{
          left: node.x,
          top: node.y,
          width,
          height,
          ["--node-color" as string]: nodeColor,
        }}
        onMouseDown={(e) => handleNodeMouseDown(e, node)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingNodeId(node.id);
          setEditingLabel(node.label);
        }}
      >
        {/* Top/Side accent */}
        {!isGroup && <div className="idea-node-accent" />}

        {/* Content */}
        <div className="idea-node-inner">
          {isReference && node.linkedKind && (
            <div className="idea-node-ref-row">
              <span
                className="idea-node-ref-badge"
                style={{
                  backgroundColor: `${refMeta.color}20`,
                  color: refMeta.color,
                }}
              >
                {node.linkedKind === "note" ? (
                  <FileText size={11} aria-hidden="true" />
                ) : node.linkedKind === "taskList" || node.linkedKind === "task" ? (
                  <ListTodo size={11} aria-hidden="true" />
                ) : (
                  <StickyNote size={11} aria-hidden="true" />
                )}
                <span>{refMeta.label}</span>
              </span>
              {node.linkedId && onNavigateToReference && (
                <button
                  type="button"
                  className="idea-node-open-ref"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateToReference(
                      node.linkedKind as IdeaReferenceKind,
                      node.linkedId
                    );
                  }}
                  title={`Abrir ${node.linkedLabel || refMeta.label}`}
                >
                  <span>Abrir</span>
                  <ExternalLink size={11} aria-hidden="true" />
                </button>
              )}
            </div>
          )}

          {isDecision && !isReference && (
            <span className="idea-node-kind-tag" style={{ color: nodeColor }}>
              DECISÃO
            </span>
          )}

          {isEditing ? (
            <input
              type="text"
              className="idea-node-inline-input"
              autoFocus
              value={editingLabel}
              onChange={(e) => setEditingLabel(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onBlur={commitInlineLabel}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitInlineLabel();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingNodeId(null);
                }
              }}
            />
          ) : (
            <div className="idea-node-title">
              {node.label || node.linkedLabel || "Sem título"}
            </div>
          )}

          {isReference &&
            node.linkedLabel &&
            node.linkedLabel !== node.label && (
              <div className="idea-node-ref-subtitle" style={{ color: nodeColor }}>
                ↗ {node.linkedLabel}
              </div>
            )}

          {node.content?.trim() && !isGroup && (
            <div className="idea-node-content">{node.content}</div>
          )}
        </div>

        {/* 4 Connection Handles */}
        {(["top", "right", "bottom", "left"] as HandleSide[]).map((side) => (
          <button
            key={side}
            type="button"
            className={`idea-node-handle handle-${side}`}
            aria-label={`Conectar pelo lado ${side}`}
            title="Arraste para conectar a outro nó"
            onMouseDown={(e) => handleHandleMouseDown(e, node, side)}
          />
        ))}

        {/* Resize Handle */}
        {isSelected && (
          <div
            className="idea-node-resize"
            title="Arraste para redimensionar"
            onMouseDown={(e) => handleResizeMouseDown(e, node)}
          />
        )}
      </div>
    );
  };

  return (
    <section
      className="idea-canvas-shell"
      aria-label={`Fluxo de ideias: ${flow.title}`}
    >
      {/* Top Toolbar */}
      <header className="idea-canvas-header">
        <div className="idea-canvas-header-left">
          {!sidebarOpen && (
            <button
              type="button"
              className="icon-button"
              onClick={onOpenSidebar}
              title="Mostrar barra lateral"
              aria-label="Mostrar barra lateral"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="idea-back-button"
            onClick={onBack}
            title="Voltar para Fluxos"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>Voltar</span>
          </button>

          <div className="idea-canvas-title-group">
            <span
              className="idea-flow-icon-badge small"
              style={{ backgroundColor: `${colorHex}1f`, color: colorHex }}
            >
              <FlowIcon size={15} aria-hidden="true" />
            </span>
            <div className="idea-canvas-title-text">
              <h1>{flow.title}</h1>
            </div>
            <span className={`idea-save-pill ${saveStatus}`}>
              {saveStatus === "saving"
                ? "Salvando..."
                : saveStatus === "error"
                ? "Erro ao salvar"
                : "Salvo"}
            </span>
          </div>
        </div>

        {/* Quick Node Creation Toolbar */}
        <div className="idea-canvas-tools" role="toolbar" aria-label="Ferramentas do canvas">
          <div className="idea-tool-group">
            <button
              type="button"
              className="idea-tool-btn"
              onClick={() => addNode("root")}
              title="Adicionar Tópico Central"
            >
              <Target size={13} aria-hidden="true" />
              <span>+ Tópico Central</span>
            </button>
            <button
              type="button"
              className="idea-tool-btn"
              onClick={() => addNode("idea")}
              title="Adicionar Ideia"
            >
              <Sparkles size={13} aria-hidden="true" />
              <span>+ Ideia</span>
            </button>
            <button
              type="button"
              className="idea-tool-btn"
              onClick={() => addNode("decision")}
              title="Adicionar Decisão"
            >
              <GitBranch size={13} aria-hidden="true" />
              <span>+ Decisão</span>
            </button>
            <button
              type="button"
              className="idea-tool-btn"
              onClick={() => addNode("note")}
              title="Adicionar Anotação"
            >
              <FileText size={13} aria-hidden="true" />
              <span>+ Anotação</span>
            </button>
            <button
              type="button"
              className="idea-tool-btn"
              onClick={() => addNode("group")}
              title="Adicionar Grupo"
            >
              <SquareDashed size={13} aria-hidden="true" />
              <span>+ Grupo</span>
            </button>
            <button
              type="button"
              className="idea-tool-btn accent"
              onClick={() => setLinkModalState({ mode: "create" })}
              title="Vincular Nota, Lista de Tarefas ou Stickers"
            >
              <Link2 size={13} aria-hidden="true" />
              <span>+ Referência Magnetares</span>
            </button>
          </div>

          <div className="idea-tool-divider" />

          <div className="idea-tool-group">
            <button
              type="button"
              className={`idea-tool-icon-btn ${toolMode === "select" ? "active" : ""}`}
              onClick={() => setToolMode("select")}
              title="Selecionar"
              aria-label="Ferramenta Selecionar"
            >
              <MousePointer2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`idea-tool-icon-btn ${toolMode === "pan" ? "active" : ""}`}
              onClick={() => setToolMode("pan")}
              title="Mover (Mão) — ou segure Espaço"
              aria-label="Ferramenta Mover"
            >
              <Hand size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`idea-tool-icon-btn ${snapToGrid ? "active" : ""}`}
              onClick={() => setSnapToGrid((v) => !v)}
              title="Snap Grade (16px)"
              aria-label="Alternar Snap na Grade"
            >
              <Grid size={14} aria-hidden="true" />
            </button>
          </div>

          <div className="idea-tool-divider" />

          <div className="idea-tool-group">
            <button
              type="button"
              className="idea-tool-icon-btn"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              title="Desfazer (Ctrl+Z)"
              aria-label="Desfazer"
            >
              <Undo2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="idea-tool-icon-btn"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              title="Refazer (Ctrl+Y)"
              aria-label="Refazer"
            >
              <Redo2 size={14} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="idea-canvas-header-right">
          <button
            type="button"
            className="idea-canvas-save-btn"
            onClick={() =>
              void persistGraph(nodesRef.current, edgesRef.current, viewportRef.current)
            }
            disabled={loading || saveStatus === "saving"}
            title="Salvar agora (Ctrl+S)"
          >
            <Save size={14} aria-hidden="true" />
            <span>Salvar</span>
          </button>
          <button
            type="button"
            className="idea-export-png-btn"
            onClick={() => void handleExportPng()}
            disabled={loading || exportingPng}
            title="Exportar mapa mental em PNG de alta definição"
          >
            <Download size={14} aria-hidden="true" />
            <span>{exportingPng ? "Exportando..." : "Exportar PNG"}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="idea-canvas-workspace">
        <div
          ref={stageRef}
          className={`idea-canvas-viewport ${isPanCursor ? "pan-cursor" : ""}`}
          onMouseDown={handleStageMouseDown}
        >
          {loading ? (
            <div className="idea-canvas-overlay-msg">
              <GitBranch size={26} style={{ color: colorHex }} aria-hidden="true" />
              <span>Carregando mapa mental...</span>
            </div>
          ) : error ? (
            <div className="idea-canvas-overlay-msg">
              <p className="dialog-error">{error}</p>
              <button type="button" className="idea-back-button" onClick={onBack}>
                Voltar para Fluxos
              </button>
            </div>
          ) : (
            <>
              {/* Scalable HD Dot Grid */}
              <svg className="idea-canvas-grid-svg" aria-hidden="true">
                <defs>
                  <pattern
                    id={`idea-grid-${flow.id}`}
                    width={gridStep}
                    height={gridStep}
                    patternUnits="userSpaceOnUse"
                    x={patternOffsetX}
                    y={patternOffsetY}
                  >
                    <circle
                      cx={dotRadius}
                      cy={dotRadius}
                      r={dotRadius}
                      className="idea-grid-dot"
                    />
                  </pattern>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill={`url(#idea-grid-${flow.id})`}
                />
              </svg>

              {/* World Layer */}
              <div
                className="idea-canvas-world"
                style={{
                  transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
                }}
              >
                {/* Group Nodes Layer (under edges & regular nodes) */}
                {groupNodes.map(renderNodeCard)}

                {/* SVG Edges Layer */}
                <svg className="idea-edges-svg">
                  <defs>
                    <marker
                      id="idea-arrow-default"
                      markerWidth="10"
                      markerHeight="10"
                      refX="8"
                      refY="5"
                      orient="auto"
                    >
                      <path d="M 0 1 L 9 5 L 0 9 z" fill="currentColor" />
                    </marker>
                  </defs>

                  {edges.map((edge) => {
                    const source = nodeMap.get(edge.sourceNodeId);
                    const target = nodeMap.get(edge.targetNodeId);
                    if (!source || !target) return null;
                    const geom = computeEdgeGeometry(source, target, edge);
                    const isSelected = selectedEdgeId === edge.id;
                    const strokeColor =
                      edge.color || (isSelected ? "#4b75ff" : undefined);

                    return (
                      <g
                        key={edge.id}
                        className={`idea-edge-group ${isSelected ? "selected" : ""} ${
                          edge.animated ? "animated" : ""
                        }`}
                        style={strokeColor ? { color: strokeColor } : undefined}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedEdgeId(edge.id);
                          setSelectedNodeId(null);
                          setEditingNodeId(null);
                        }}
                      >
                        <path className="idea-edge-hit" d={geom.svgPath} />
                        <path
                          className="idea-edge-path"
                          d={geom.svgPath}
                          markerEnd="url(#idea-arrow-default)"
                        />
                        {edge.label?.trim() && (
                          <foreignObject
                            x={geom.labelPoint.x - 80}
                            y={geom.labelPoint.y - 14}
                            width={160}
                            height={28}
                            className="idea-edge-label-fo"
                          >
                            <div className="idea-edge-label-pill">{edge.label}</div>
                          </foreignObject>
                        )}
                      </g>
                    );
                  })}

                  {previewPath && (
                    <path className="idea-edge-preview" d={previewPath} />
                  )}
                </svg>

                {/* Regular Nodes Layer */}
                {regularNodes.map(renderNodeCard)}
              </div>

              {/* Empty hint */}
              {nodes.length === 0 && (
                <div className="idea-canvas-empty-hint">
                  Use os botões acima para adicionar tópicos, ideias, grupos ou referências do Magnetares.
                </div>
              )}

              {/* Export Notice Toast */}
              {exportNotice && (
                <div className="idea-canvas-toast">{exportNotice}</div>
              )}

              {/* Bottom-Left Floating Zoom Bar */}
              <div
                className="idea-zoom-bar"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => zoomAroundCenter(1 / 1.2)}
                  title="Diminuir zoom"
                  aria-label="Diminuir zoom"
                >
                  <Minus size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="idea-zoom-pct"
                  onClick={() => {
                    setViewport((prev) => ({ ...prev, zoom: 1 }));
                    scheduleAutoSave();
                  }}
                  title="Redefinir zoom para 100%"
                >
                  {Math.round(viewport.zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => zoomAroundCenter(1.2)}
                  title="Aumentar zoom"
                  aria-label="Aumentar zoom"
                >
                  <Plus size={14} aria-hidden="true" />
                </button>
                <div className="idea-zoom-sep" />
                <button
                  type="button"
                  onClick={fitView}
                  title="Ajustar à Tela"
                  aria-label="Ajustar à Tela"
                >
                  <Maximize2 size={13} aria-hidden="true" />
                  <span>Ajustar</span>
                </button>
              </div>

              {/* Bottom-Right Interactive Minimap */}
              <div
                className="idea-minimap"
                onMouseDown={(e) => e.stopPropagation()}
                title="Minimapa — clique ou arraste para navegar"
              >
                <svg
                  viewBox={`${minimapBounds.minX} ${minimapBounds.minY} ${minimapBounds.width} ${minimapBounds.height}`}
                  onMouseDown={(e) => {
                    minimapDraggingRef.current = true;
                    handleMinimapPointer(e);
                  }}
                  onMouseMove={(e) => {
                    if (minimapDraggingRef.current) handleMinimapPointer(e);
                  }}
                  onMouseUp={() => {
                    minimapDraggingRef.current = false;
                    scheduleAutoSave();
                  }}
                  onMouseLeave={() => {
                    if (minimapDraggingRef.current) {
                      minimapDraggingRef.current = false;
                      scheduleAutoSave();
                    }
                  }}
                >
                  {nodes.map((n) => {
                    const dim = getNodeDimensions(n);
                    return (
                      <rect
                        key={n.id}
                        x={n.x}
                        y={n.y}
                        width={dim.width}
                        height={dim.height}
                        rx={8}
                        fill={n.color || "#4b75ff"}
                        fillOpacity={n.nodeType === "group" ? 0.18 : 0.72}
                      />
                    );
                  })}
                  <rect
                    x={vpWorldX}
                    y={vpWorldY}
                    width={vpWorldW}
                    height={vpWorldH}
                    className="idea-minimap-viewport"
                  />
                </svg>
              </div>
            </>
          )}
        </div>

        {/* Right Side Inspector Panel */}
        {(selectedNode || selectedEdge) && (
          <aside
            className="idea-inspector"
            aria-label="Inspetor de propriedades"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {selectedNode ? (
              <>
                <header className="idea-inspector-header">
                  <h2>Propriedades do Nó</h2>
                  <div className="idea-inspector-header-actions">
                    <button
                      type="button"
                      onClick={duplicateSelectedNode}
                      title="Duplicar nó (Ctrl+D)"
                      aria-label="Duplicar nó"
                    >
                      <Copy size={14} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={deleteSelection}
                      title="Excluir nó (Delete)"
                      aria-label="Excluir nó"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <div className="idea-inspector-body">
                  <label className="idea-inspector-field">
                    <span>Título</span>
                    <input
                      type="text"
                      value={selectedNode.label}
                      onChange={(e) =>
                        updateSelectedNode({ label: e.target.value })
                      }
                    />
                  </label>

                  <label className="idea-inspector-field">
                    <span>Descrição / Notas</span>
                    <textarea
                      rows={4}
                      value={selectedNode.content}
                      onChange={(e) =>
                        updateSelectedNode({ content: e.target.value })
                      }
                      placeholder="Detalhes adicionais do nó..."
                    />
                  </label>

                  <label className="idea-inspector-field">
                    <span>Tipo de Nó</span>
                    <CustomSelect
                      value={selectedNode.nodeType}
                      options={[
                        { value: "root", label: "Tópico Central" },
                        { value: "idea", label: "Ideia" },
                        { value: "decision", label: "Decisão" },
                        { value: "note", label: "Anotação" },
                        { value: "group", label: "Grupo" },
                        { value: "reference", label: "Referência Magnetares" },
                      ]}
                      onChange={(val) => updateSelectedNode({ nodeType: val }, true)}
                      ariaLabel="Tipo de Nó"
                    />
                  </label>

                  <div className="idea-inspector-field">
                    <span>Cor</span>
                    <div className="idea-inspector-swatches">
                      {IDEA_NODE_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className={`idea-swatch-btn ${
                            selectedNode.color === hex ? "active" : ""
                          }`}
                          style={{ backgroundColor: hex }}
                          onClick={() => updateSelectedNode({ color: hex }, true)}
                          aria-label={`Cor ${hex}`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="idea-inspector-field">
                    <span>Referência Magnetares</span>
                    {selectedNode.linkedId ? (
                      <div className="idea-inspector-ref-card">
                        <div>
                          <small>
                            {getReferenceMeta(selectedNode.linkedKind).label}
                          </small>
                          <strong>{selectedNode.linkedLabel}</strong>
                        </div>
                        <div className="idea-inspector-ref-actions">
                          {onNavigateToReference && (
                            <button
                              type="button"
                              onClick={() =>
                                onNavigateToReference(
                                  selectedNode.linkedKind as IdeaReferenceKind,
                                  selectedNode.linkedId
                                )
                              }
                            >
                              Abrir ↗
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setLinkModalState({
                                mode: "edit",
                                nodeId: selectedNode.id,
                                currentKind: selectedNode.linkedKind,
                                currentId: selectedNode.linkedId,
                              })
                            }
                          >
                            Alterar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="idea-inspector-link-btn"
                        onClick={() =>
                          setLinkModalState({
                            mode: "edit",
                            nodeId: selectedNode.id,
                          })
                        }
                      >
                        <Link2 size={14} aria-hidden="true" />
                        <span>Vincular Nota, Lista ou Stickers</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            ) : selectedEdge ? (
              <>
                <header className="idea-inspector-header">
                  <h2>Propriedades da Conexão</h2>
                  <div className="idea-inspector-header-actions">
                    <button
                      type="button"
                      className="danger"
                      onClick={deleteSelection}
                      title="Excluir conexão (Delete)"
                      aria-label="Excluir conexão"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                </header>

                <div className="idea-inspector-body">
                  <label className="idea-inspector-field">
                    <span>Rótulo</span>
                    <input
                      type="text"
                      value={selectedEdge.label}
                      placeholder="Ex: depende de, gera, aprova..."
                      onChange={(e) =>
                        updateSelectedEdge({ label: e.target.value })
                      }
                    />
                  </label>

                  <label className="idea-inspector-field">
                    <span>Estilo da Linha</span>
                    <CustomSelect
                      value={selectedEdge.edgeType || "bezier"}
                      options={[
                        { value: "bezier", label: "Curva Suave (Bezier)" },
                        { value: "step", label: "Degrau Ortogonal" },
                        { value: "straight", label: "Reta Direta" },
                      ]}
                      onChange={(val) => updateSelectedEdge({ edgeType: val }, true)}
                      ariaLabel="Estilo da Linha"
                    />
                  </label>

                  <div className="idea-inspector-field">
                    <span>Cor da Conexão</span>
                    <div className="idea-inspector-swatches">
                      <button
                        type="button"
                        className={`idea-swatch-btn default ${
                          !selectedEdge.color ? "active" : ""
                        }`}
                        onClick={() => updateSelectedEdge({ color: "" }, true)}
                        title="Cor padrão"
                        aria-label="Cor padrão"
                      />
                      {IDEA_NODE_COLORS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          className={`idea-swatch-btn ${
                            selectedEdge.color === hex ? "active" : ""
                          }`}
                          style={{ backgroundColor: hex }}
                          onClick={() => updateSelectedEdge({ color: hex }, true)}
                          aria-label={`Cor ${hex}`}
                        />
                      ))}
                    </div>
                  </div>

                  <label className="idea-inspector-checkbox">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedEdge.animated)}
                      onChange={(e) =>
                        updateSelectedEdge({ animated: e.target.checked }, true)
                      }
                    />
                    <span>Linha tracejada / animada</span>
                  </label>
                </div>
              </>
            ) : null}
          </aside>
        )}
      </div>

      {/* Reference Link Modal */}
      {linkModalState && (
        <IdeaNodeLinkModal
          navigation={navigation}
          currentKind={
            linkModalState.mode === "edit" ? linkModalState.currentKind : undefined
          }
          currentId={
            linkModalState.mode === "edit" ? linkModalState.currentId : undefined
          }
          onSelect={handleLinkSelected}
          onClose={() => setLinkModalState(null)}
        />
      )}
    </section>
  );
}

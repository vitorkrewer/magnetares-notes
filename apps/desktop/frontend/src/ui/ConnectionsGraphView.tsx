import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ChevronRight,
  Code2,
  Compass,
  Expand,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Folder,
  Hash,
  Maximize2,
  Minimize2,
  Minus,
  Network,
  PanelLeft,
  PictureInPicture2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { CustomSelect } from "./CustomSelect";
import {
  buildConnectionGraphData,
  computeVisibleSubgraphIds,
  GraphEdge,
  GraphFilterOptions,
  GraphNode,
  noteNodeId,
  runForceSimulation,
  TAG_NODE_COLOR,
  tagNodeId,
} from "./connectionsLayout";
import { ConnectionsGraphPayload } from "./types";

export type ConnectionsGraphViewProps = {
  payload: ConnectionsGraphPayload;
  loading?: boolean;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onRefresh: () => void;
  onOpenNoteSeparateWindow: (noteId: string) => void;
  onNavigateToNote: (noteId: string) => void;
  detachedFocusNoteIds: Set<string>;
};

type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

type DragState =
  | { kind: "none" }
  | {
    kind: "pan";
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  }
  | {
    kind: "node";
    nodeId: string;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    moved: boolean;
  };

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3.2;

export function ConnectionsGraphView({
  payload,
  loading = false,
  sidebarOpen,
  onOpenSidebar,
  onRefresh,
  onOpenNoteSeparateWindow,
  onNavigateToNote,
  detachedFocusNoteIds,
}: ConnectionsGraphViewProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pinnedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const pinnedIdsRef = useRef<Set<string>>(new Set());

  const [viewport, setViewport] = useState<ViewportState>({ x: 480, y: 320, zoom: 1 });
  const viewportRef = useRef<ViewportState>(viewport);
  viewportRef.current = viewport;

  const [showTags, setShowTags] = useState(true);
  const [showIsolated, setShowIsolated] = useState(true);
  const [folderFilter, setFolderFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusDepth, setFocusDepth] = useState<"all" | 1 | 2 | 3>("all");

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [layoutSeed, setLayoutSeed] = useState(0);
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [explorerTab, setExplorerTab] = useState<"notes" | "tags">("notes");
  const [explorerSearch, setExplorerSearch] = useState("");

  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [adjacency, setAdjacency] = useState<Map<string, Set<string>>>(new Map());

  const dragRef = useRef<DragState>({ kind: "none" });
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const filters: GraphFilterOptions = useMemo(
    () => ({
      showTags,
      showIsolated,
      folderId: folderFilter,
      tagFilter,
      searchQuery,
    }),
    [showTags, showIsolated, folderFilter, tagFilter, searchQuery]
  );

  // Recalcula estrutura e posições com force-directed layout
  useEffect(() => {
    const { nodes: rawNodes, edges: rawEdges, adjacency: adj } = buildConnectionGraphData(
      payload,
      filters,
      pinnedPositionsRef.current
    );
    const simulated = runForceSimulation(rawNodes, rawEdges, pinnedIdsRef.current, 180);
    const nextPositions = new Map<string, { x: number; y: number }>();
    for (const node of simulated) {
      nextPositions.set(node.id, { x: node.x, y: node.y });
    }
    pinnedPositionsRef.current = nextPositions;
    setNodes(simulated);
    setEdges(rawEdges);
    setAdjacency(adj);
  }, [payload, filters, layoutSeed]);

  // Calcula subgrafo visível quando há filtro de profundidade/expansão progressiva
  const visibleNodeIds = useMemo(() => {
    if (focusDepth === "all" || !selectedNodeId) {
      return null;
    }
    if (!adjacency.has(selectedNodeId)) {
      return null;
    }
    return computeVisibleSubgraphIds(selectedNodeId, focusDepth, expandedNodeIds, adjacency);
  }, [focusDepth, selectedNodeId, expandedNodeIds, adjacency]);

  const visibleNodes = useMemo(
    () => (visibleNodeIds ? nodes.filter((n) => visibleNodeIds.has(n.id)) : nodes),
    [nodes, visibleNodeIds]
  );

  const visibleEdges = useMemo(
    () =>
      visibleNodeIds
        ? edges.filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
        : edges,
    [edges, visibleNodeIds]
  );

  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const n of nodes) {
      map.set(n.id, n);
    }
    return map;
  }, [nodes]);

  const fitToScreen = useCallback((targetNodes: GraphNode[] = visibleNodes) => {
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    if (targetNodes.length === 0) {
      setViewport({ x: rect.width / 2, y: rect.height / 2, zoom: 1 });
      return;
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of targetNodes) {
      minX = Math.min(minX, n.x - n.radius - 48);
      maxX = Math.max(maxX, n.x + n.radius + 48);
      minY = Math.min(minY, n.y - n.radius - 36);
      maxY = Math.max(maxY, n.y + n.radius + 48);
    }

    const graphW = Math.max(200, maxX - minX);
    const graphH = Math.max(160, maxY - minY);
    const padding = 72;
    const scaleX = (rect.width - padding * 2) / graphW;
    const scaleY = (rect.height - padding * 2) / graphH;
    const zoom = Math.max(MIN_ZOOM, Math.min(1.35, Math.min(scaleX, scaleY)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setViewport({
      zoom,
      x: rect.width / 2 - centerX * zoom,
      y: rect.height / 2 - centerY * zoom,
    });
  }, [visibleNodes]);

  // Centraliza automaticamente na primeira montagem e quando o container redimensiona
  const hasAutoFittedRef = useRef(false);
  const userInteractedViewportRef = useRef(false);
  useEffect(() => {
    if (!hasAutoFittedRef.current && nodes.length > 0) {
      hasAutoFittedRef.current = true;
      requestAnimationFrame(() => fitToScreen(nodes));
    }
  }, [nodes, fitToScreen]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    let lastW = stage.clientWidth;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const nextW = entry.contentRect.width;
        if (Math.abs(nextW - lastW) > 40 && !userInteractedViewportRef.current && nodes.length > 0) {
          lastW = nextW;
          fitToScreen(nodes);
        }
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [nodes, fitToScreen]);

  const centerOnNode = useCallback((nodeId: string) => {
    const node = nodeById.get(nodeId);
    const stage = stageRef.current;
    if (!node || !stage) return;
    const rect = stage.getBoundingClientRect();
    const targetZoom = Math.max(viewportRef.current.zoom, 1.05);
    setViewport({
      zoom: targetZoom,
      x: rect.width / 2 - node.x * targetZoom,
      y: rect.height / 2 - node.y * targetZoom,
    });
  }, [nodeById]);

  const searchMatches = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    if (!needle) return [];
    return nodes
      .filter((n) => n.label.toLocaleLowerCase().includes(needle))
      .slice(0, 8);
  }, [nodes, searchQuery]);

  const activeHighlightId = hoveredNodeId || selectedNodeId;
  const activeNeighborIds = useMemo(() => {
    if (!activeHighlightId) return null;
    const set = new Set<string>([activeHighlightId]);
    const neigh = adjacency.get(activeHighlightId);
    if (neigh) {
      for (const id of neigh) set.add(id);
    }
    return set;
  }, [activeHighlightId, adjacency]);

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) ?? null : null;

  const selectedDetails = useMemo(() => {
    if (!selectedNode) return null;
    const outgoingNotes: GraphNode[] = [];
    const incomingNotes: GraphNode[] = [];
    const linkedTags: GraphNode[] = [];
    const tagConnectedNotes: GraphNode[] = [];

    if (selectedNode.kind === "note") {
      const seenOut = new Set<string>();
      const seenIn = new Set<string>();
      for (const edge of edges) {
        if (edge.kind === "note-note") {
          if (edge.source === selectedNode.id && !seenOut.has(edge.target)) {
            const target = nodeById.get(edge.target);
            if (target) {
              seenOut.add(edge.target);
              outgoingNotes.push(target);
            }
          } else if (edge.target === selectedNode.id && !seenIn.has(edge.source)) {
            const src = nodeById.get(edge.source);
            if (src) {
              seenIn.add(edge.source);
              incomingNotes.push(src);
            }
          }
        } else if (edge.kind === "note-tag" && edge.source === selectedNode.id) {
          const tagN = nodeById.get(edge.target);
          if (tagN) linkedTags.push(tagN);
        }
      }
      // Mesmo se o filtro "Etiquetas" estiver oculto no mapa, mostrar tags da nota
      if (!showTags) {
        const rawNote = payload.notes.find((n) => n.id === selectedNode.entityId);
        for (const tName of rawNote?.tags || []) {
          linkedTags.push({
            id: tagNodeId(tName),
            kind: "tag",
            entityId: tName,
            label: `#${tName}`,
            subtitle: "",
            color: TAG_NODE_COLOR,
            degree: 0,
            radius: 10,
            x: 0,
            y: 0,
          });
        }
      }
    } else {
      for (const edge of edges) {
        if (edge.kind === "note-tag" && edge.target === selectedNode.id) {
          const noteN = nodeById.get(edge.source);
          if (noteN) tagConnectedNotes.push(noteN);
        }
      }
    }

    return { outgoingNotes, incomingNotes, linkedTags, tagConnectedNotes };
  }, [selectedNode, edges, nodeById, showTags, payload.notes]);

  // Eventos globais de mouse para pan e arrasto de nós
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (drag.kind === "pan") {
        const dx = event.clientX - drag.startClientX;
        const dy = event.clientY - drag.startClientY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          drag.moved = true;
        }
        setViewport((prev) => ({
          ...prev,
          x: drag.originX + dx,
          y: drag.originY + dy,
        }));
      } else if (drag.kind === "node") {
        const zoom = viewportRef.current.zoom || 1;
        const dx = (event.clientX - drag.startClientX) / zoom;
        const dy = (event.clientY - drag.startClientY) / zoom;
        if (!drag.moved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) {
          return;
        }
        drag.moved = true;
        const nextX = drag.originX + dx;
        const nextY = drag.originY + dy;
        pinnedPositionsRef.current.set(drag.nodeId, { x: nextX, y: nextY });
        pinnedIdsRef.current.add(drag.nodeId);
        setNodes((prev) =>
          prev.map((n) => (n.id === drag.nodeId ? { ...n, x: nextX, y: nextY } : n))
        );
      }
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (drag.kind === "pan" && !drag.moved) {
        setSelectedNodeId(null);
      }
      dragRef.current = { kind: "none" };
      setDraggingNodeId(null);
      setIsPanning(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    const targetEl = event.target as HTMLElement | null;
    if (targetEl?.closest(".connections-inspector, .connections-explorer-sidebar")) {
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    event.preventDefault();
    userInteractedViewportRef.current = true;
    const rect = stage.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const factor = event.deltaY < 0 ? 1.12 : 0.89;
    setViewport((prev) => {
      const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
      const worldX = (pointerX - prev.x) / prev.zoom;
      const worldY = (pointerY - prev.y) / prev.zoom;
      return {
        zoom: nextZoom,
        x: pointerX - worldX * nextZoom,
        y: pointerY - worldY * nextZoom,
      };
    });
  };

  const handleStageMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const targetEl = event.target as HTMLElement | null;
    if (
      targetEl?.closest(
        ".connections-inspector, .connections-explorer-sidebar, .connections-legend, .connections-empty-state"
      )
    ) {
      return;
    }
    userInteractedViewportRef.current = true;
    setIsPanning(true);
    dragRef.current = {
      kind: "pan",
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: viewportRef.current.x,
      originY: viewportRef.current.y,
      moved: false,
    };
  };

  const handleNodeMouseDown = (event: ReactMouseEvent<SVGGElement>, node: GraphNode) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    setSelectedNodeId(node.id);
    setDraggingNodeId(node.id);
    dragRef.current = {
      kind: "node",
      nodeId: node.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: node.x,
      originY: node.y,
      moved: false,
    };
  };

  const handleNodeDoubleClick = (event: ReactMouseEvent<SVGGElement>, node: GraphNode) => {
    event.stopPropagation();
    if (node.kind === "note") {
      onOpenNoteSeparateWindow(node.entityId);
    } else {
      setSelectedNodeId(node.id);
      setFocusDepth((prev) => (prev === "all" ? 1 : prev));
      setExpandedNodeIds((prev) => new Set(prev).add(node.id));
      centerOnNode(node.id);
    }
  };

  const handleExpandNeighbors = (nodeId: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      next.add(nodeId);
      return next;
    });
    if (focusDepth === "all") {
      setFocusDepth(1);
    }
  };

  const handleResetLayout = () => {
    pinnedIdsRef.current.clear();
    pinnedPositionsRef.current.clear();
    setExpandedNodeIds(new Set());
    setLayoutSeed((s) => s + 1);
    hasAutoFittedRef.current = false;
  };

  const noteCount = useMemo(
    () => visibleNodes.filter((n) => n.kind === "note").length,
    [visibleNodes]
  );
  const tagCount = useMemo(
    () => visibleNodes.filter((n) => n.kind === "tag").length,
    [visibleNodes]
  );

  const folderOptions = useMemo(
    () => [
      { value: "", label: "Todas as pastas" },
      ...(payload.folders || []).map((f) => ({ value: f.id, label: f.name })),
    ],
    [payload.folders]
  );

  const tagOptions = useMemo(
    () => [
      { value: "", label: "Todas as etiquetas" },
      ...(payload.tags || []).map((t) => ({ value: t.name, label: `#${t.name}` })),
    ],
    [payload.tags]
  );

  return (
    <section className="connections-shell" aria-label="Mapa de Conexões entre Notas e Etiquetas">
      <header className="connections-toolbar">
        <div className="connections-toolbar-left">
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
            className={`icon-button ${explorerOpen ? "active-pin" : ""}`}
            onClick={() => setExplorerOpen((v) => !v)}
            title={explorerOpen ? "Ocultar painel lateral de notas e etiquetas" : "Mostrar painel lateral de notas e etiquetas"}
            aria-label={explorerOpen ? "Ocultar painel lateral de notas e etiquetas" : "Mostrar painel lateral de notas e etiquetas"}
          >
            <PanelLeft size={16} aria-hidden="true" />
          </button>

          <div className="connections-brand-badge">
            <Network size={18} aria-hidden="true" />
          </div>
          <div>
            <h1 className="connections-title">Minhas Conexões</h1>
            <p className="connections-stats">
              {noteCount} {noteCount === 1 ? "nota" : "notas"} · {tagCount}{" "}
              {tagCount === 1 ? "etiqueta" : "etiquetas"} · {visibleEdges.length}{" "}
              {visibleEdges.length === 1 ? "vínculo" : "vínculos"}
            </p>
          </div>
        </div>

        <div className="connections-toolbar-filters">
          <div className="connections-search-wrap">
            <Search size={14} className="connections-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="connections-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Localizar nó no mapa..."
              aria-label="Localizar nó no mapa de conexões"
            />
            {searchMatches.length > 0 && (
              <div className="connections-search-dropdown" role="listbox">
                {searchMatches.map((match) => (
                  <button
                    key={match.id}
                    type="button"
                    className="connections-search-hit"
                    onClick={() => {
                      setSelectedNodeId(match.id);
                      centerOnNode(match.id);
                      setSearchQuery("");
                    }}
                  >
                    {match.kind === "tag" ? (
                      <Hash size={13} aria-hidden="true" />
                    ) : (
                      <FileText size={13} aria-hidden="true" />
                    )}
                    <span>{match.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <CustomSelect
            compact
            value={folderFilter}
            options={folderOptions}
            onChange={(val) => {
              setFolderFilter(val);
              hasAutoFittedRef.current = false;
            }}
            ariaLabel="Filtrar por pasta"
            title="Filtrar grafo por pasta"
          />

          <CustomSelect
            compact
            value={tagFilter}
            options={tagOptions}
            onChange={(val) => {
              setTagFilter(val);
              hasAutoFittedRef.current = false;
            }}
            ariaLabel="Filtrar por etiqueta"
            title="Filtrar grafo por etiqueta"
          />

          <button
            type="button"
            className={`connections-pill-btn ${showTags ? "active" : ""}`}
            onClick={() => setShowTags((v) => !v)}
            title="Exibir ou ocultar nós de etiquetas no grafo"
          >
            <Hash size={13} aria-hidden="true" />
            <span>Etiquetas</span>
          </button>

          <button
            type="button"
            className={`connections-pill-btn ${showIsolated ? "active" : ""}`}
            onClick={() => setShowIsolated((v) => !v)}
            title="Exibir ou ocultar notas sem conexões ou etiquetas"
          >
            {showIsolated ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
            <span>Isoladas</span>
          </button>

          <CustomSelect
            compact
            value={String(focusDepth)}
            options={[
              { value: "all", label: "Visão Global" },
              { value: "1", label: "Expandir: 1 nível" },
              { value: "2", label: "Expandir: 2 níveis" },
              { value: "3", label: "Expandir: 3 níveis" },
            ]}
            onChange={(val) => {
              const nextDepth = val === "all" ? "all" : (Number(val) as 1 | 2 | 3);
              setFocusDepth(nextDepth);
              if (nextDepth !== "all" && !selectedNodeId && nodes.length > 0) {
                setSelectedNodeId(nodes[0].id);
              }
            }}
            ariaLabel="Profundidade de expansão"
            title="Profundidade de expansão ao selecionar um nó"
          />
        </div>

        <div className="connections-toolbar-actions">
          <div className="connections-zoom-group">
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setViewport((p) => ({ ...p, zoom: Math.max(MIN_ZOOM, p.zoom / 1.18) }))
              }
              title="Diminuir zoom"
              aria-label="Diminuir zoom"
            >
              <Minus size={14} aria-hidden="true" />
            </button>
            <span className="connections-zoom-label">{Math.round(viewport.zoom * 100)}%</span>
            <button
              type="button"
              className="icon-button"
              onClick={() =>
                setViewport((p) => ({ ...p, zoom: Math.min(MAX_ZOOM, p.zoom * 1.18) }))
              }
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
            >
              <Plus size={14} aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            className="icon-button"
            onClick={() => fitToScreen()}
            title="Ajustar grafo à tela"
            aria-label="Ajustar grafo à tela"
          >
            <Maximize2 size={15} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="icon-button"
            onClick={handleResetLayout}
            title="Reorganizar distribuição do grafo"
            aria-label="Reorganizar distribuição do grafo"
          >
            <Compass size={15} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`icon-button ${loading ? "spinning" : ""}`}
            onClick={onRefresh}
            title="Recarregar conexões do banco"
            aria-label="Recarregar conexões do banco"
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="connections-workspace">
        {explorerOpen && (
          <aside
            className="connections-explorer-sidebar"
            aria-label="Catálogo lateral de notas e etiquetas"
            onMouseDown={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <div className="connections-explorer-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={explorerTab === "notes"}
                className={`connections-explorer-tab ${explorerTab === "notes" ? "active" : ""}`}
                onClick={() => setExplorerTab("notes")}
              >
                <FileText size={13} aria-hidden="true" />
                <span>Notas ({payload.notes.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={explorerTab === "tags"}
                className={`connections-explorer-tab ${explorerTab === "tags" ? "active" : ""}`}
                onClick={() => setExplorerTab("tags")}
              >
                <Hash size={13} aria-hidden="true" />
                <span>Etiquetas ({payload.tags.length})</span>
              </button>
            </div>

            <div className="connections-explorer-search">
              <Search size={13} className="connections-search-icon" aria-hidden="true" />
              <input
                type="search"
                value={explorerSearch}
                onChange={(e) => setExplorerSearch(e.target.value)}
                placeholder={
                  explorerTab === "notes"
                    ? "Filtrar notas por título ou pasta..."
                    : "Filtrar etiquetas..."
                }
                aria-label="Filtrar itens no painel lateral"
              />
            </div>

            <div className="connections-explorer-list">
              {explorerTab === "notes" ? (
                (() => {
                  const needle = explorerSearch.trim().toLocaleLowerCase();
                  const filteredNotes = (payload.notes || []).filter((n) => {
                    if (!needle) return true;
                    return (
                      (n.title || "Sem título").toLocaleLowerCase().includes(needle) ||
                      (n.folder || "").toLocaleLowerCase().includes(needle) ||
                      (n.tags || []).some((t) => t.toLocaleLowerCase().includes(needle))
                    );
                  });

                  if (filteredNotes.length === 0) {
                    return (
                      <p className="connections-list-empty">Nenhuma nota encontrada.</p>
                    );
                  }

                  return filteredNotes.map((n) => {
                    const nId = noteNodeId(n.id);
                    const gNode = nodeById.get(nId);
                    const degree = gNode?.degree ?? (n.tags?.length || 0);
                    const isSelected = selectedNodeId === nId;
                    return (
                      <div
                        key={n.id}
                        className={`connections-explorer-row ${isSelected ? "selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="connections-explorer-item"
                          onClick={() => {
                            if (!showIsolated && degree === 0) {
                              setShowIsolated(true);
                            }
                            setSelectedNodeId(nId);
                            centerOnNode(nId);
                          }}
                          onDoubleClick={() => onOpenNoteSeparateWindow(n.id)}
                          title="Clique para focar no grafo · Duplo clique para abrir editor separado"
                        >
                          <span
                            className="connections-explorer-icon"
                            style={{
                              backgroundColor: gNode?.color || (n.noteType === "code" ? "#4f46e5" : "#d97706"),
                            }}
                          >
                            {n.noteType === "code" ? (
                              <Code2 size={12} aria-hidden="true" />
                            ) : (
                              <FileText size={12} aria-hidden="true" />
                            )}
                          </span>
                          <span className="connections-explorer-text">
                            <strong>{n.title || "Sem título"}</strong>
                            <small>
                              {n.folder || "Notas"}
                              {n.tags && n.tags.length > 0 ? ` · ${n.tags.length} etiq.` : ""}
                            </small>
                          </span>
                          {degree > 0 && (
                            <span
                              className="connections-explorer-badge"
                              title={`${degree} ${degree === 1 ? "conexão" : "conexões"}`}
                            >
                              {degree}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="icon-button mini"
                          onClick={() => onOpenNoteSeparateWindow(n.id)}
                          title="Abrir editor em janela separada"
                          aria-label={`Abrir ${n.title || "nota"} em janela separada`}
                        >
                          <PictureInPicture2 size={13} aria-hidden="true" />
                        </button>
                      </div>
                    );
                  });
                })()
              ) : (
                (() => {
                  const needle = explorerSearch.trim().toLocaleLowerCase();
                  const filteredTags = (payload.tags || []).filter((t) =>
                    !needle ? true : t.name.toLocaleLowerCase().includes(needle)
                  );

                  if (filteredTags.length === 0) {
                    return (
                      <p className="connections-list-empty">Nenhuma etiqueta encontrada.</p>
                    );
                  }

                  return filteredTags.map((t) => {
                    const tId = tagNodeId(t.name);
                    const isSelected = selectedNodeId === tId;
                    return (
                      <div
                        key={t.name}
                        className={`connections-explorer-row ${isSelected ? "selected" : ""}`}
                      >
                        <button
                          type="button"
                          className="connections-explorer-item"
                          onClick={() => {
                            if (!showTags) setShowTags(true);
                            setSelectedNodeId(tId);
                            centerOnNode(tId);
                          }}
                        >
                          <span
                            className="connections-explorer-icon tag"
                            style={{ backgroundColor: TAG_NODE_COLOR }}
                          >
                            <Hash size={12} aria-hidden="true" />
                          </span>
                          <span className="connections-explorer-text">
                            <strong>#{t.name}</strong>
                            <small>
                              {t.noteCount} {t.noteCount === 1 ? "nota associada" : "notas associadas"}
                            </small>
                          </span>
                          <span className="connections-explorer-badge">{t.noteCount}</span>
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </aside>
        )}

        <div
          ref={stageRef}
          className={`connections-stage ${isPanning ? "panning" : ""} ${draggingNodeId ? "dragging-node" : ""}`}
          onWheel={handleWheel}
          onMouseDown={handleStageMouseDown}
          style={{
            backgroundPosition: `${viewport.x}px ${viewport.y}px`,
            backgroundSize: `${Math.max(12, 24 * viewport.zoom)}px ${Math.max(12, 24 * viewport.zoom)}px`,
          }}
        >
          <svg className="connections-svg" aria-label="Visualização vetorial do mapa de grafos">
            <defs>
              <marker
                id="conn-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 10 5 L 0 9 z" fill="currentColor" />
              </marker>
              <filter id="conn-node-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodOpacity="0.18" />
              </filter>
            </defs>

            <g transform={`translate(${viewport.x}, ${viewport.y}) scale(${viewport.zoom})`}>
              {/* Arestas */}
              {visibleEdges.map((edge) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;

                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const dist = Math.hypot(dx, dy) || 1;
                const endOffset = target.radius + 5;
                const x1 = source.x + (dx / dist) * (source.radius + 2);
                const y1 = source.y + (dy / dist) * (source.radius + 2);
                const x2 = target.x - (dx / dist) * endOffset;
                const y2 = target.y - (dy / dist) * endOffset;

                const isHighlighted =
                  !activeHighlightId ||
                  edge.source === activeHighlightId ||
                  edge.target === activeHighlightId;

                return (
                  <line
                    key={edge.id}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className={`connections-edge ${edge.kind} ${activeHighlightId
                        ? isHighlighted
                          ? "highlighted"
                          : "dimmed"
                        : ""
                      }`}
                    markerEnd={edge.kind === "note-note" && isHighlighted ? "url(#conn-arrow)" : undefined}
                  />
                );
              })}

              {/* Nós com ícones sugestivos e indicadores visuais */}
              {visibleNodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                const isHovered = hoveredNodeId === node.id;
                const isDimmed =
                  Boolean(activeNeighborIds) && !activeNeighborIds?.has(node.id);
                const isExpanded = expandedNodeIds.has(node.id);
                const isFocusOpen =
                  node.kind === "note" && detachedFocusNoteIds.has(node.entityId);

                const showLabel =
                  viewport.zoom >= 0.35 || isSelected || isHovered || node.degree >= 1;
                const r = Math.max(15, node.radius);
                const iconScale = Math.max(0.75, Math.min(1.15, r / 17));
                const shortLabel =
                  node.label.length > 28 ? `${node.label.slice(0, 27)}…` : node.label;
                const pillWidth = Math.max(48, shortLabel.length * 6.4 + 16);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    className={`connections-node ${node.kind} ${isSelected ? "selected" : ""} ${isHovered ? "hovered" : ""
                      } ${isDimmed ? "dimmed" : ""}`}
                    onMouseEnter={() => setHoveredNodeId(node.id)}
                    onMouseLeave={() => setHoveredNodeId((cur) => (cur === node.id ? null : cur))}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    onDoubleClick={(e) => handleNodeDoubleClick(e, node)}
                  >
                    {/* Halo externo de seleção / hover / foco */}
                    {(isSelected || isHovered || isFocusOpen) && (
                      <circle
                        r={r + 6}
                        fill="none"
                        stroke={node.color}
                        strokeWidth={isSelected ? 2.6 : 1.8}
                        strokeOpacity={isFocusOpen ? 0.9 : 0.55}
                        strokeDasharray={isFocusOpen ? "3 3" : undefined}
                      />
                    )}

                    {/* Corpo do nó */}
                    {node.kind === "tag" ? (
                      <rect
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        rx={r * 0.42}
                        transform="rotate(45)"
                        fill={node.color}
                        stroke="#ffffff"
                        strokeWidth={1.8}
                        filter="url(#conn-node-shadow)"
                        className="connections-node-shape"
                      />
                    ) : (
                      <circle
                        r={r}
                        fill={node.color}
                        stroke="#ffffff"
                        strokeWidth={2}
                        filter="url(#conn-node-shadow)"
                        className="connections-node-shape"
                      />
                    )}

                    {/* Ícone vetorial interno sugestivo (Nota, Código ou Etiqueta #) */}
                    <g
                      transform={`scale(${iconScale})`}
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ pointerEvents: "none" }}
                    >
                      {node.kind === "tag" ? (
                        <>
                          <line x1="-5" y1="-2.5" x2="5" y2="-2.5" />
                          <line x1="-5" y1="2.5" x2="5" y2="2.5" />
                          <line x1="-2" y1="-6" x2="-3.2" y2="6" />
                          <line x1="3.2" y1="-6" x2="2" y2="6" />
                        </>
                      ) : node.noteType === "code" ? (
                        <>
                          <polyline points="-3.5,-4 -7,0 -3.5,4" />
                          <polyline points="3.5,-4 7,0 3.5,4" />
                          <line x1="1.5" y1="-5" x2="-1.5" y2="5" />
                        </>
                      ) : (
                        <>
                          <path d="M -4.5 -6.5 H 1.8 L 5 -3.3 V 6.5 H -4.5 Z" />
                          <polyline points="1.5,-6.5 1.5,-3 5,-3" />
                          <line x1="-2.2" y1="0" x2="2.5" y2="0" />
                          <line x1="-2.2" y1="3" x2="1.8" y2="3" />
                        </>
                      )}
                    </g>

                    {/* Contador de conexões (grau do nó) no canto superior direito */}
                    {node.degree > 0 && (
                      <g
                        transform={`translate(${r * 0.74}, ${-r * 0.74})`}
                        style={{ pointerEvents: "none" }}
                      >
                        <circle
                          r={7.5}
                          fill="#1e1b18"
                          stroke="#ffffff"
                          strokeWidth={1.4}
                        />
                        <text
                          y="3"
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="8.5"
                          fontWeight="700"
                        >
                          {node.degree}
                        </text>
                      </g>
                    )}

                    {/* Indicador de ramo expandido */}
                    {isExpanded && focusDepth !== "all" && (
                      <circle
                        cx={-r * 0.74}
                        cy={-r * 0.74}
                        r={4.5}
                        fill="#22c55e"
                        stroke="#ffffff"
                        strokeWidth={1.4}
                      />
                    )}

                    {showLabel && (
                      <g transform={`translate(0, ${r + 16})`} style={{ pointerEvents: "none" }}>
                        <rect
                          x={-pillWidth / 2}
                          y={-10}
                          width={pillWidth}
                          height={18}
                          rx={6}
                          className="connections-node-label-bg"
                        />
                        <text
                          y={2.5}
                          textAnchor="middle"
                          className="connections-node-label"
                        >
                          {shortLabel}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Estado vazio */}
          {visibleNodes.length === 0 && (
            <div className="connections-empty-state">
              <Network size={36} aria-hidden="true" />
              <h3>Nenhuma conexão visível com os filtros atuais</h3>
              <p>
                Crie vínculos digitando <code>[[</code> dentro de qualquer nota ou associe etiquetas para
                construir sua constelação de conhecimento.
              </p>
              <div className="connections-empty-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    setFolderFilter("");
                    setTagFilter("");
                    setShowTags(true);
                    setShowIsolated(true);
                    setFocusDepth("all");
                  }}
                >
                  Restaurar filtros globais
                </button>
              </div>
            </div>
          )}

          {/* Legenda discreta inferior esquerda */}
          <div className="connections-legend" aria-hidden="true">
            <span className="connections-legend-item">
              <span className="connections-dot note" />
              Nota
            </span>
            <span className="connections-legend-item">
              <span className="connections-dot code" />
              Código
            </span>
            <span className="connections-legend-item">
              <span className="connections-dot tag" />
              Etiqueta
            </span>
            <span className="connections-legend-hint">
              Clique: inspecionar · Duplo clique: abrir editor
            </span>
          </div>

          {/* Painel de inspeção / expansão lateral */}
          {selectedNode && selectedDetails && (
            <aside
              className="connections-inspector"
              aria-label="Detalhes do nó selecionado"
              onMouseDown={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="connections-inspector-head">
                <div className="connections-inspector-type">
                  <span
                    className="connections-inspector-color"
                    style={{ backgroundColor: selectedNode.color }}
                  />
                  <span>
                    {selectedNode.kind === "tag"
                      ? "Etiqueta"
                      : selectedNode.noteType === "code"
                        ? "Nota de Código"
                        : "Nota"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSelectedNodeId(null)}
                  aria-label="Fechar painel do nó"
                  title="Fechar"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              </div>

              <h2 className="connections-inspector-title">{selectedNode.label}</h2>
              <p className="connections-inspector-sub">
                {selectedNode.kind === "note" ? (
                  <>
                    <Folder size={13} aria-hidden="true" />
                    <span>{selectedNode.subtitle}</span>
                  </>
                ) : (
                  <>
                    <Hash size={13} aria-hidden="true" />
                    <span>{selectedNode.subtitle}</span>
                  </>
                )}
              </p>

              {/* Ações principais */}
              <div className="connections-inspector-actions">
                {selectedNode.kind === "note" && (
                  <>
                    <button
                      type="button"
                      className="connections-primary-btn"
                      onClick={() => onOpenNoteSeparateWindow(selectedNode.entityId)}
                    >
                      <PictureInPicture2 size={15} aria-hidden="true" />
                      <span>
                        {detachedFocusNoteIds.has(selectedNode.entityId)
                          ? "Já aberta em janela separada"
                          : "Abrir editor em janela separada"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="connections-secondary-btn"
                      onClick={() => onNavigateToNote(selectedNode.entityId)}
                    >
                      <ExternalLink size={14} aria-hidden="true" />
                      <span>Ir para a nota no painel</span>
                    </button>
                  </>
                )}

                <div className="connections-expand-row">
                  <button
                    type="button"
                    className="connections-secondary-btn"
                    onClick={() => handleExpandNeighbors(selectedNode.id)}
                    title="Expandir conexões diretas deste nó"
                  >
                    <Expand size={14} aria-hidden="true" />
                    <span>Expandir</span>
                  </button>
                  {focusDepth !== "all" ? (
                    <button
                      type="button"
                      className="connections-secondary-btn"
                      onClick={() => {
                        setFocusDepth("all");
                        setExpandedNodeIds(new Set());
                      }}
                      title="Voltar para o grafo completo"
                    >
                      <Minimize2 size={14} aria-hidden="true" />
                      <span>Visão Global</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="connections-secondary-btn"
                      onClick={() => {
                        setFocusDepth(1);
                        setExpandedNodeIds(new Set([selectedNode.id]));
                        centerOnNode(selectedNode.id);
                      }}
                      title="Isolar apenas este ramo e ir expandindo"
                    >
                      <Sparkles size={14} aria-hidden="true" />
                      <span>Focar ramo</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Listas de conexões */}
              <div className="connections-inspector-lists">
                {selectedNode.kind === "note" ? (
                  <>
                    <div className="connections-list-block">
                      <h4>Links nesta nota ({selectedDetails.outgoingNotes.length})</h4>
                      {selectedDetails.outgoingNotes.length > 0 ? (
                        selectedDetails.outgoingNotes.map((target) => (
                          <div key={target.id} className="connections-neighbor-row">
                            <button
                              type="button"
                              className="connections-neighbor-btn"
                              onClick={() => {
                                setSelectedNodeId(target.id);
                                centerOnNode(target.id);
                              }}
                            >
                              {target.noteType === "code" ? (
                                <Code2 size={13} aria-hidden="true" />
                              ) : (
                                <FileText size={13} aria-hidden="true" />
                              )}
                              <span>{target.label}</span>
                            </button>
                            <button
                              type="button"
                              className="icon-button mini"
                              onClick={() => onOpenNoteSeparateWindow(target.entityId)}
                              title="Abrir nota na janela separada"
                              aria-label={`Abrir ${target.label} em janela separada`}
                            >
                              <PictureInPicture2 size={12} aria-hidden="true" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="connections-list-empty">
                          Nenhum vínculo criado ainda nesta nota (digite <code>[[</code> no texto).
                        </p>
                      )}
                    </div>

                    <div className="connections-list-block">
                      <h4>Mencionada por ({selectedDetails.incomingNotes.length})</h4>
                      {selectedDetails.incomingNotes.length > 0 ? (
                        selectedDetails.incomingNotes.map((src) => (
                          <div key={src.id} className="connections-neighbor-row">
                            <button
                              type="button"
                              className="connections-neighbor-btn"
                              onClick={() => {
                                setSelectedNodeId(src.id);
                                centerOnNode(src.id);
                              }}
                            >
                              <FileText size={13} aria-hidden="true" />
                              <span>{src.label}</span>
                            </button>
                            <button
                              type="button"
                              className="icon-button mini"
                              onClick={() => onOpenNoteSeparateWindow(src.entityId)}
                              title="Abrir nota na janela separada"
                              aria-label={`Abrir ${src.label} em janela separada`}
                            >
                              <PictureInPicture2 size={12} aria-hidden="true" />
                            </button>
                          </div>
                        ))
                      ) : (
                        <p className="connections-list-empty">Nenhuma outra nota aponta para esta.</p>
                      )}
                    </div>

                    <div className="connections-list-block">
                      <h4>Etiquetas vinculadas ({selectedDetails.linkedTags.length})</h4>
                      {selectedDetails.linkedTags.length > 0 ? (
                        <div className="connections-tag-chips">
                          {selectedDetails.linkedTags.map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              className="connections-tag-chip"
                              onClick={() => {
                                if (!showTags) setShowTags(true);
                                setSelectedNodeId(t.id);
                                centerOnNode(t.id);
                              }}
                            >
                              {t.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="connections-list-empty">Sem etiquetas associadas.</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="connections-list-block">
                    <h4>Notas com esta etiqueta ({selectedDetails.tagConnectedNotes.length})</h4>
                    {selectedDetails.tagConnectedNotes.map((n) => (
                      <div key={n.id} className="connections-neighbor-row">
                        <button
                          type="button"
                          className="connections-neighbor-btn"
                          onClick={() => {
                            setSelectedNodeId(n.id);
                            centerOnNode(n.id);
                          }}
                        >
                          <FileText size={13} aria-hidden="true" />
                          <span>{n.label}</span>
                        </button>
                        <button
                          type="button"
                          className="icon-button mini"
                          onClick={() => onOpenNoteSeparateWindow(n.entityId)}
                          title="Abrir nota na janela separada"
                          aria-label={`Abrir ${n.label} em janela separada`}
                        >
                          <PictureInPicture2 size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}
        </div>
      </div>
    </section>
  );
}

export function buildDemoConnectionsPayload(
  notes: Array<{
    id: string;
    title: string;
    body: string;
    type?: string;
    language?: string;
    folderId?: string;
    folder?: string;
    pinnedAt?: string | null;
    tags?: string[];
    updatedAt?: string;
  }>,
  tags: Array<{ id: string; name: string; icon?: string; noteCount?: number }>,
  folders: Array<{ id: string; name: string; parentId?: string | null; color?: string; icon?: string; noteCount?: number }>
): ConnectionsGraphPayload {
  const activeNoteIds = new Set(notes.map((n) => n.id));
  const links: ConnectionsGraphPayload["links"] = [];
  const seen = new Set<string>();

  const walkBody = (sourceId: string, node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "noteLink" && node.attrs?.noteId) {
      const targetId = String(node.attrs.noteId).trim();
      if (targetId && targetId !== sourceId && activeNoteIds.has(targetId)) {
        const key = `${sourceId}->${targetId}`;
        if (!seen.has(key)) {
          seen.add(key);
          links.push({
            sourceNoteId: sourceId,
            targetNoteId: targetId,
            label: String(node.attrs.title || ""),
          });
        }
      }
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walkBody(sourceId, child);
      }
    }
  };

  for (const n of notes) {
    if (n.body && n.body.includes('"noteLink"')) {
      try {
        walkBody(n.id, JSON.parse(n.body));
      } catch {
        // Ignora
      }
    }
  }

  return {
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      noteType: n.type || "rtf",
      language: n.language || "plaintext",
      folderId: n.folderId || "folder-default",
      folder: n.folder || "Notas",
      pinned: Boolean(n.pinnedAt),
      tags: n.tags || [],
      updatedAt: n.updatedAt || "",
    })),
    links,
    tags: tags.map((t) => ({
      id: t.id,
      name: t.name,
      normalizedName: t.name.toLocaleLowerCase(),
      icon: t.icon || "tag",
      noteCount: t.noteCount || 0,
    })),
    folders: folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId ?? null,
      color: f.color || "#6366f1",
      icon: f.icon || "folder",
      noteCount: f.noteCount || 0,
    })),
  };
}

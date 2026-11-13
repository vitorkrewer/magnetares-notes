import { ConnectionsGraphPayload, FolderRecord } from "./types";

export type GraphNodeKind = "note" | "tag";
export type GraphEdgeKind = "note-note" | "note-tag";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  entityId: string;
  label: string;
  subtitle: string;
  folderId?: string;
  noteType?: string;
  pinned?: boolean;
  color: string;
  degree: number;
  radius: number;
  x: number;
  y: number;
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
};

export type GraphFilterOptions = {
  showTags: boolean;
  showIsolated: boolean;
  folderId: string; // "" = todas
  tagFilter: string; // "" = todas
  searchQuery: string;
};

export const NOTE_NODE_DEFAULT_COLOR = "#d97706";
export const CODE_NODE_COLOR = "#4f46e5";
export const TAG_NODE_COLOR = "#0284c7";

export function noteNodeId(noteId: string): string {
  return `note:${noteId}`;
}

export function tagNodeId(tagName: string): string {
  return `tag:${tagName.trim().toLocaleLowerCase()}`;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function buildConnectionGraphData(
  payload: ConnectionsGraphPayload,
  filters: GraphFilterOptions,
  existingPositions?: Map<string, { x: number; y: number }>
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
  adjacency: Map<string, Set<string>>;
} {
  const folderMap = new Map<string, FolderRecord>();
  for (const folder of payload.folders || []) {
    folderMap.set(folder.id, folder);
  }

  const normalizedTagFilter = filters.tagFilter.trim().toLocaleLowerCase();

  // Filtra notas pelos critérios de pasta e etiqueta
  const eligibleNotes = (payload.notes || []).filter((note) => {
    if (filters.folderId && note.folderId !== filters.folderId) {
      return false;
    }
    if (normalizedTagFilter) {
      const hasTag = (note.tags || []).some(
        (t) => t.trim().toLocaleLowerCase() === normalizedTagFilter
      );
      if (!hasTag) return false;
    }
    return true;
  });

  const eligibleNoteIds = new Set(eligibleNotes.map((n) => n.id));

  const rawEdges: GraphEdge[] = [];
  const edgeKeys = new Set<string>();

  for (const link of payload.links || []) {
    if (!eligibleNoteIds.has(link.sourceNoteId) || !eligibleNoteIds.has(link.targetNoteId)) {
      continue;
    }
    if (link.sourceNoteId === link.targetNoteId) continue;
    const source = noteNodeId(link.sourceNoteId);
    const target = noteNodeId(link.targetNoteId);
    const edgeKey = `nn:${source}->${target}`;
    if (edgeKeys.has(edgeKey)) continue;
    edgeKeys.add(edgeKey);
    rawEdges.push({
      id: edgeKey,
      source,
      target,
      kind: "note-note",
    });
  }

  const activeTagsMap = new Map<string, { displayName: string; count: number }>();

  if (filters.showTags) {
    for (const note of eligibleNotes) {
      for (const rawTag of note.tags || []) {
        const trimmed = rawTag.trim();
        if (!trimmed) continue;
        const norm = trimmed.toLocaleLowerCase();
        const tId = tagNodeId(norm);
        const existingTag = activeTagsMap.get(norm);
        if (existingTag) {
          existingTag.count += 1;
        } else {
          activeTagsMap.set(norm, { displayName: trimmed, count: 1 });
        }
        const nId = noteNodeId(note.id);
        const edgeKey = `nt:${nId}->${tId}`;
        if (!edgeKeys.has(edgeKey)) {
          edgeKeys.add(edgeKey);
          rawEdges.push({
            id: edgeKey,
            source: nId,
            target: tId,
            kind: "note-tag",
          });
        }
      }
    }
  }

  const degreeMap = new Map<string, number>();
  for (const edge of rawEdges) {
    degreeMap.set(edge.source, (degreeMap.get(edge.source) || 0) + 1);
    degreeMap.set(edge.target, (degreeMap.get(edge.target) || 0) + 1);
  }

  const rawNodes: GraphNode[] = [];
  let index = 0;

  for (const note of eligibleNotes) {
    const id = noteNodeId(note.id);
    const degree = degreeMap.get(id) || 0;
    if (!filters.showIsolated && degree === 0) {
      continue;
    }

    const folder = folderMap.get(note.folderId);
    const color =
      note.noteType === "code"
        ? CODE_NODE_COLOR
        : folder?.color || NOTE_NODE_DEFAULT_COLOR;

    const prev = existingPositions?.get(id);
    const angle = index * 2.399963229728653; // Golden angle
    const dist = 60 + Math.sqrt(index + 1) * 52;
    const jitter = (hashSeed(id) - 0.5) * 18;

    rawNodes.push({
      id,
      kind: "note",
      entityId: note.id,
      label: note.title?.trim() || "Sem título",
      subtitle: note.folder || "Notas",
      folderId: note.folderId,
      noteType: note.noteType,
      pinned: note.pinned,
      color,
      degree,
      radius: Math.min(28, 16 + Math.sqrt(degree) * 3.4),
      x: prev ? prev.x : Math.cos(angle) * dist + jitter,
      y: prev ? prev.y : Math.sin(angle) * dist + jitter,
    });
    index++;
  }

  if (filters.showTags) {
    for (const [norm, tagInfo] of activeTagsMap.entries()) {
      const id = tagNodeId(norm);
      const degree = degreeMap.get(id) || 0;
      if (degree === 0) continue;

      const prev = existingPositions?.get(id);
      const angle = index * 2.399963229728653;
      const dist = 70 + Math.sqrt(index + 1) * 48;

      rawNodes.push({
        id,
        kind: "tag",
        entityId: tagInfo.displayName,
        label: `#${tagInfo.displayName}`,
        subtitle: `${tagInfo.count} ${tagInfo.count === 1 ? "nota" : "notas"}`,
        color: TAG_NODE_COLOR,
        degree,
        radius: Math.min(26, 15 + Math.sqrt(degree) * 3.2),
        x: prev ? prev.x : Math.cos(angle) * dist,
        y: prev ? prev.y : Math.sin(angle) * dist,
      });
      index++;
    }
  }

  const includedIds = new Set(rawNodes.map((n) => n.id));
  const filteredEdges = rawEdges.filter(
    (e) => includedIds.has(e.source) && includedIds.has(e.target)
  );

  const adjacency = new Map<string, Set<string>>();
  for (const node of rawNodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of filteredEdges) {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  }

  return { nodes: rawNodes, edges: filteredEdges, adjacency };
}

export function runForceSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  pinnedIds?: Set<string>,
  iterations = 180
): GraphNode[] {
  if (nodes.length === 0) return [];
  const sim = nodes.map((n) => ({ ...n, vx: 0, vy: 0 }));
  const nodeIndex = new Map<string, number>();
  sim.forEach((n, idx) => nodeIndex.set(n.id, idx));

  const nCount = sim.length;
  const repulsion = Math.min(11500, Math.max(5800, 4200 + nCount * 110));
  const damping = 0.82;
  const centerGravity = 0.022;
  const maxStep = 34;

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / (iterations * 1.15);

    // 1. Repulsão entre pares
    for (let i = 0; i < nCount; i++) {
      for (let j = i + 1; j < nCount; j++) {
        const a = sim[i];
        const b = sim[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distSq = dx * dx + dy * dy;
        if (distSq < 16) {
          dx = 2.5;
          dy = -2.5;
          distSq = 12.5;
        }
        if (distSq > 700 * 700) continue;
        const dist = Math.sqrt(distSq);
        const minSpace = a.radius + b.radius + 78;
        const boost = dist < minSpace ? 2.1 : 1;
        const force = (repulsion * boost) / distSq;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    // 2. Atração pelas arestas
    for (const edge of edges) {
      const iA = nodeIndex.get(edge.source);
      const iB = nodeIndex.get(edge.target);
      if (iA === undefined || iB === undefined) continue;
      const a = sim[iA];
      const b = sim[iB];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetLen = edge.kind === "note-tag" ? 135 : 175;
      const springK = edge.kind === "note-tag" ? 0.045 : 0.06;
      const force = (dist - targetLen) * springK;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // 3. Gravidade suave ao centro + integração
    for (const node of sim) {
      if (pinnedIds?.has(node.id)) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx = (node.vx - node.x * centerGravity) * damping;
      node.vy = (node.vy - node.y * centerGravity) * damping;

      const stepX = Math.max(-maxStep, Math.min(maxStep, node.vx * cooling));
      const stepY = Math.max(-maxStep, Math.min(maxStep, node.vy * cooling));
      node.x += stepX;
      node.y += stepY;
    }
  }

  return sim.map(({ vx: _vx, vy: _vy, ...rest }) => rest);
}

/**
 * Calcula o conjunto de nós visíveis no modo foco/expansão progressiva.
 * Começa no nó raiz selecionado até `depth` saltos e acrescenta 1 salto
 * para cada nó adicional que o usuário clicou para expandir.
 */
export function computeVisibleSubgraphIds(
  rootId: string,
  depth: number,
  expandedIds: Set<string>,
  adjacency: Map<string, Set<string>>
): Set<string> {
  const visible = new Set<string>([rootId]);
  const visited = new Set<string>([rootId]);
  const queue: Array<{ id: string; dist: number }> = [{ id: rootId, dist: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.dist >= depth) continue;
    const neighbors = adjacency.get(current.id);
    if (!neighbors) continue;
    for (const nextId of neighbors) {
      visible.add(nextId);
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push({ id: nextId, dist: current.dist + 1 });
      }
    }
  }

  // Expansão sob demanda para qualquer nó aberto manualmente pelo usuário
  for (const expId of expandedIds) {
    visible.add(expId);
    const neighbors = adjacency.get(expId);
    if (!neighbors) continue;
    for (const nextId of neighbors) {
      visible.add(nextId);
    }
  }

  return visible;
}


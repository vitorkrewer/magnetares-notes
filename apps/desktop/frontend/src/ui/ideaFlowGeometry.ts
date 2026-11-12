import { IdeaEdgeRecord, IdeaNodeRecord } from "./types";

export type HandleSide = "top" | "right" | "bottom" | "left";

export type Point = {
  x: number;
  y: number;
};

export const NODE_TYPE_DEFAULTS: Record<
  string,
  { width: number; height: number; color: string; label: string }
> = {
  root: { width: 220, height: 84, color: "#4b75ff", label: "Tópico Central" },
  idea: { width: 200, height: 80, color: "#6366f1", label: "Nova Ideia" },
  decision: { width: 200, height: 84, color: "#f59e0b", label: "Decisão" },
  note: { width: 230, height: 112, color: "#10b981", label: "Anotação" },
  group: { width: 380, height: 240, color: "#64748b", label: "Grupo" },
  reference: { width: 240, height: 108, color: "#a855f7", label: "Referência" },
};

export const IDEA_NODE_COLORS = [
  "#4b75ff",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#14b8a6",
  "#64748b",
] as const;

export function getNodeDimensions(node: IdeaNodeRecord): { width: number; height: number } {
  const fallback = NODE_TYPE_DEFAULTS[node.nodeType] ?? NODE_TYPE_DEFAULTS.idea;
  return {
    width: node.width > 0 ? node.width : fallback.width,
    height: node.height > 0 ? node.height : fallback.height,
  };
}

export function getHandlePoint(node: IdeaNodeRecord, side: string): Point {
  const { width, height } = getNodeDimensions(node);
  switch (side) {
    case "top":
      return { x: node.x + width / 2, y: node.y };
    case "bottom":
      return { x: node.x + width / 2, y: node.y + height };
    case "left":
      return { x: node.x, y: node.y + height / 2 };
    case "right":
    default:
      return { x: node.x + width, y: node.y + height / 2 };
  }
}

export function getSideNormal(side: string): Point {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
    case "right":
    default:
      return { x: 1, y: 0 };
  }
}

export function inferBestHandles(
  source: IdeaNodeRecord,
  target: IdeaNodeRecord
): { sourceHandle: HandleSide; targetHandle: HandleSide } {
  const sDim = getNodeDimensions(source);
  const tDim = getNodeDimensions(target);
  const sx = source.x + sDim.width / 2;
  const sy = source.y + sDim.height / 2;
  const tx = target.x + tDim.width / 2;
  const ty = target.y + tDim.height / 2;
  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { sourceHandle: "right", targetHandle: "left" }
      : { sourceHandle: "left", targetHandle: "right" };
  }
  return dy >= 0
    ? { sourceHandle: "bottom", targetHandle: "top" }
    : { sourceHandle: "top", targetHandle: "bottom" };
}

export type EdgeGeometry = {
  svgPath: string;
  labelPoint: Point;
  start: Point;
  end: Point;
  control1?: Point;
  control2?: Point;
  stepPoints?: Point[];
  endAngleRad: number;
};

export function computeEdgeGeometry(
  source: IdeaNodeRecord,
  target: IdeaNodeRecord,
  edge: Pick<IdeaEdgeRecord, "edgeType" | "sourceHandle" | "targetHandle">
): EdgeGeometry {
  const sSide = (edge.sourceHandle || "right") as HandleSide;
  const tSide = (edge.targetHandle || "left") as HandleSide;
  const start = getHandlePoint(source, sSide);
  const end = getHandlePoint(target, tSide);

  return computeRawEdgeGeometry(start, end, sSide, tSide, edge.edgeType || "bezier");
}

export function computeRawEdgeGeometry(
  start: Point,
  end: Point,
  sSide: string,
  tSide: string,
  edgeType: string
): EdgeGeometry {
  if (edgeType === "straight") {
    const endAngleRad = Math.atan2(end.y - start.y, end.x - start.x);
    return {
      svgPath: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      start,
      end,
      endAngleRad,
    };
  }

  if (edgeType === "step") {
    const offset = 28;
    const sNorm = getSideNormal(sSide);
    const tNorm = getSideNormal(tSide);
    const p1 = { x: start.x + sNorm.x * offset, y: start.y + sNorm.y * offset };
    const p2 = { x: end.x + tNorm.x * offset, y: end.y + tNorm.y * offset };

    const points: Point[] = [start, p1];
    const isSourceHorizontal = sSide === "left" || sSide === "right";
    const isTargetHorizontal = tSide === "left" || tSide === "right";

    if (isSourceHorizontal && isTargetHorizontal) {
      const midX = (p1.x + p2.x) / 2;
      points.push({ x: midX, y: p1.y }, { x: midX, y: p2.y });
    } else if (!isSourceHorizontal && !isTargetHorizontal) {
      const midY = (p1.y + p2.y) / 2;
      points.push({ x: p1.x, y: midY }, { x: p2.x, y: midY });
    } else if (isSourceHorizontal) {
      points.push({ x: p2.x, y: p1.y });
    } else {
      points.push({ x: p1.x, y: p2.y });
    }
    points.push(p2, end);

    const svgPath = points
      .map((pt, idx) => `${idx === 0 ? "M" : "L"} ${pt.x} ${pt.y}`)
      .join(" ");

    const midIdx = Math.floor(points.length / 2);
    const a = points[midIdx - 1];
    const b = points[midIdx];
    const labelPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const prev = points[points.length - 2];
    const endAngleRad = Math.atan2(end.y - prev.y, end.x - prev.x);

    return {
      svgPath,
      labelPoint,
      start,
      end,
      stepPoints: points,
      endAngleRad,
    };
  }

  // Default: cubic bezier
  const dist = Math.hypot(end.x - start.x, end.y - start.y);
  const curvature = Math.max(48, Math.min(180, dist * 0.45));
  const sNorm = getSideNormal(sSide);
  const tNorm = getSideNormal(tSide);
  const control1 = { x: start.x + sNorm.x * curvature, y: start.y + sNorm.y * curvature };
  const control2 = { x: end.x + tNorm.x * curvature, y: end.y + tNorm.y * curvature };

  // Midpoint on cubic bezier at t = 0.5
  const labelPoint = {
    x: 0.125 * start.x + 0.375 * control1.x + 0.375 * control2.x + 0.125 * end.x,
    y: 0.125 * start.y + 0.375 * control1.y + 0.375 * control2.y + 0.125 * end.y,
  };
  const endAngleRad = Math.atan2(end.y - control2.y, end.x - control2.x);

  return {
    svgPath: `M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`,
    labelPoint,
    start,
    end,
    control1,
    control2,
    endAngleRad,
  };
}

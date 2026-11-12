import {
  computeEdgeGeometry,
  getNodeDimensions,
  IDEA_NODE_COLORS,
} from "./ideaFlowGeometry";
import { IdeaEdgeRecord, IdeaNodeRecord } from "./types";

const PADDING = 64;
const TARGET_SCALE = 2.5;
const MAX_CANVAS_SIDE = 12000;
const MAX_CANVAS_PIXELS = 64_000_000;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  if (!text.trim() || maxWidth <= 8) return [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  const lines: string[] = [];

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      if (lines.length >= maxLines) break;
      continue;
    }
    const words = para.split(/\s+/);
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push(current);
          if (lines.length >= maxLines) break;
          current = word;
        } else {
          // Word itself is wider than maxWidth: truncate gracefully
          let truncated = word;
          while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
            truncated = truncated.slice(0, -1);
          }
          lines.push(`${truncated}…`);
          if (lines.length >= maxLines) break;
          current = "";
        }
      }
    }
    if (lines.length >= maxLines) break;
    if (current) {
      lines.push(current);
      if (lines.length >= maxLines) break;
    }
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }
  return lines;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return `rgba(75, 117, 255, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getReferenceBadgeLabel(linkedKind: string): string {
  switch (linkedKind) {
    case "note":
      return "Nota";
    case "taskList":
      return "Lista";
    case "task":
      return "Tarefa";
    case "stickerBoard":
      return "Quadro";
    case "sticker":
      return "Sticker";
    default:
      return "Referência";
  }
}

export function base64ToPngBlob(base64: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "image/png" });
}

export async function exportIdeaFlowToPngBase64(
  graph: { title: string; nodes: IdeaNodeRecord[]; edges: IdeaEdgeRecord[] },
  theme: "light" | "dark"
): Promise<string> {
  const isDark = theme === "dark";
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  let minX = 0;
  let minY = 0;
  let maxX = 800;
  let maxY = 500;

  if (nodes.length > 0) {
    minX = Infinity;
    minY = Infinity;
    maxX = -Infinity;
    maxY = -Infinity;
    for (const node of nodes) {
      const { width, height } = getNodeDimensions(node);
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + width);
      maxY = Math.max(maxY, node.y + height);
    }
  }

  const worldWidth = Math.max(360, maxX - minX + PADDING * 2);
  const worldHeight = Math.max(240, maxY - minY + PADDING * 2);

  let scale = TARGET_SCALE;
  if (worldWidth * scale > MAX_CANVAS_SIDE) {
    scale = MAX_CANVAS_SIDE / worldWidth;
  }
  if (worldHeight * scale > MAX_CANVAS_SIDE) {
    scale = Math.min(scale, MAX_CANVAS_SIDE / worldHeight);
  }
  if (worldWidth * scale * (worldHeight * scale) > MAX_CANVAS_PIXELS) {
    scale = Math.min(
      scale,
      Math.sqrt(MAX_CANVAS_PIXELS / (worldWidth * worldHeight))
    );
  }
  scale = Math.max(1, scale);

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(worldWidth * scale);
  canvas.height = Math.round(worldHeight * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Não foi possível inicializar o contexto gráfico 2D.");
  }

  ctx.scale(scale, scale);

  const palette = {
    bg: isDark ? "#141412" : "#f8f7f3",
    dot: isDark ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)",
    cardBg: isDark ? "#1e1e1b" : "#ffffff",
    cardBorder: isDark ? "#383731" : "#d9d8d3",
    text: isDark ? "#e6e5df" : "#252522",
    muted: isDark ? "#9e9d95" : "#6c6b64",
    edgeDefault: isDark ? "#78766d" : "#8c8a80",
    pillBg: isDark ? "#252521" : "#f3f2ed",
  };

  // 1. Background
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, worldWidth, worldHeight);

  // Subtle dot grid
  ctx.fillStyle = palette.dot;
  const gridStep = 24;
  for (let gx = gridStep; gx < worldWidth; gx += gridStep) {
    for (let gy = gridStep; gy < worldHeight; gy += gridStep) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const offsetX = PADDING - minX;
  const offsetY = PADDING - minY;

  ctx.save();
  ctx.translate(offsetX, offsetY);

  // 2. Group nodes first
  const groupNodes = nodes.filter((n) => n.nodeType === "group");
  const regularNodes = nodes.filter((n) => n.nodeType !== "group");

  for (const group of groupNodes) {
    const { width, height } = getNodeDimensions(group);
    const color = group.color || IDEA_NODE_COLORS[9];

    ctx.save();
    drawRoundedRect(ctx, group.x, group.y, width, height, 14);
    ctx.fillStyle = hexToRgba(color, isDark ? 0.1 : 0.07);
    ctx.fill();
    ctx.setLineDash([7, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = hexToRgba(color, 0.55);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.font = '600 13px "Segoe UI Variable", "Aptos", sans-serif';
    ctx.fillStyle = color;
    ctx.textBaseline = "top";
    ctx.fillText(group.label || "Grupo", group.x + 14, group.y + 12, width - 28);
    ctx.restore();
  }

  // 3. Edges
  const nodeMap = new Map<string, IdeaNodeRecord>();
  for (const n of nodes) nodeMap.set(n.id, n);

  for (const edge of edges) {
    const source = nodeMap.get(edge.sourceNodeId);
    const target = nodeMap.get(edge.targetNodeId);
    if (!source || !target) continue;

    const geom = computeEdgeGeometry(source, target, edge);
    const strokeColor = edge.color || palette.edgeDefault;

    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (edge.animated) {
      ctx.setLineDash([7, 5]);
    }

    ctx.beginPath();
    ctx.moveTo(geom.start.x, geom.start.y);
    if (edge.edgeType === "straight") {
      ctx.lineTo(geom.end.x, geom.end.y);
    } else if (edge.edgeType === "step" && geom.stepPoints) {
      for (let i = 1; i < geom.stepPoints.length; i += 1) {
        ctx.lineTo(geom.stepPoints[i].x, geom.stepPoints[i].y);
      }
    } else if (geom.control1 && geom.control2) {
      ctx.bezierCurveTo(
        geom.control1.x,
        geom.control1.y,
        geom.control2.x,
        geom.control2.y,
        geom.end.x,
        geom.end.y
      );
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Arrowhead at target
    const arrowLen = 10;
    const arrowAngle = Math.PI / 6;
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(geom.end.x, geom.end.y);
    ctx.lineTo(
      geom.end.x - arrowLen * Math.cos(geom.endAngleRad - arrowAngle),
      geom.end.y - arrowLen * Math.sin(geom.endAngleRad - arrowAngle)
    );
    ctx.lineTo(
      geom.end.x - arrowLen * Math.cos(geom.endAngleRad + arrowAngle),
      geom.end.y - arrowLen * Math.sin(geom.endAngleRad + arrowAngle)
    );
    ctx.closePath();
    ctx.fill();

    // Edge label pill
    if (edge.label?.trim()) {
      ctx.font = '600 11.5px "Segoe UI Variable", "Aptos", sans-serif';
      const textWidth = ctx.measureText(edge.label.trim()).width;
      const pillW = textWidth + 16;
      const pillH = 22;
      const px = geom.labelPoint.x - pillW / 2;
      const py = geom.labelPoint.y - pillH / 2;

      drawRoundedRect(ctx, px, py, pillW, pillH, 11);
      ctx.fillStyle = palette.pillBg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = palette.cardBorder;
      ctx.stroke();

      ctx.fillStyle = palette.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(edge.label.trim(), geom.labelPoint.x, geom.labelPoint.y + 0.5);
    }
    ctx.restore();
  }

  // 4. Regular Nodes
  for (const node of regularNodes) {
    const { width, height } = getNodeDimensions(node);
    const color = node.color || IDEA_NODE_COLORS[0];
    const isRoot = node.nodeType === "root";
    const isDecision = node.nodeType === "decision";
    const isReference = node.nodeType === "reference" || Boolean(node.linkedId);

    ctx.save();
    ctx.shadowColor = isDark ? "rgba(0, 0, 0, 0.42)" : "rgba(0, 0, 0, 0.08)";
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    drawRoundedRect(ctx, node.x, node.y, width, height, isRoot ? 14 : 11);
    ctx.fillStyle = isRoot ? hexToRgba(color, isDark ? 0.22 : 0.1) : palette.cardBg;
    ctx.fill();
    ctx.restore();

    // Border
    ctx.save();
    drawRoundedRect(ctx, node.x, node.y, width, height, isRoot ? 14 : 11);
    ctx.lineWidth = isRoot ? 2 : 1.5;
    ctx.strokeStyle = isRoot ? color : isDecision ? hexToRgba(color, 0.8) : palette.cardBorder;
    ctx.stroke();

    // Top accent bar (or left stripe for note/decision)
    ctx.clip();
    ctx.fillStyle = color;
    if (node.nodeType === "note" || isDecision) {
      ctx.fillRect(node.x, node.y, 5, height);
    } else {
      ctx.fillRect(node.x, node.y, width, 4);
    }
    ctx.restore();

    // Inner content layout
    const padX = node.nodeType === "note" || isDecision ? 16 : 14;
    let cursorY = node.y + 13;
    const innerWidth = width - padX - 14;

    // Badge for reference or decision
    if (isReference && node.linkedKind) {
      const badgeText = getReferenceBadgeLabel(node.linkedKind);
      ctx.save();
      ctx.font = '700 10px "Segoe UI Variable", "Aptos", sans-serif';
      const bw = ctx.measureText(badgeText).width + 14;
      drawRoundedRect(ctx, node.x + padX, cursorY, bw, 18, 9);
      ctx.fillStyle = hexToRgba(color, isDark ? 0.28 : 0.14);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, node.x + padX + 7, cursorY + 9.5);
      ctx.restore();
      cursorY += 24;
    } else if (isDecision) {
      ctx.save();
      ctx.font = '700 10px "Segoe UI Variable", "Aptos", sans-serif';
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      ctx.fillText("DECISÃO", node.x + padX, cursorY);
      ctx.restore();
      cursorY += 16;
    }

    // Title
    ctx.save();
    ctx.font = `${isRoot ? "700 14.5px" : "650 13.5px"} "Segoe UI Variable", "Aptos", sans-serif`;
    ctx.fillStyle = palette.text;
    ctx.textBaseline = "top";
    const titleLines = wrapTextLines(
      ctx,
      node.label || node.linkedLabel || "Sem título",
      innerWidth,
      2
    );
    for (const line of titleLines) {
      ctx.fillText(line, node.x + padX, cursorY);
      cursorY += 18;
    }
    ctx.restore();

    // Linked label subtitle if different from title
    if (isReference && node.linkedLabel && node.linkedLabel !== node.label) {
      ctx.save();
      ctx.font = '500 11.5px "Segoe UI Variable", "Aptos", sans-serif';
      ctx.fillStyle = color;
      ctx.textBaseline = "top";
      const refLines = wrapTextLines(ctx, `↗ ${node.linkedLabel}`, innerWidth, 1);
      if (refLines[0]) {
        ctx.fillText(refLines[0], node.x + padX, cursorY + 1);
        cursorY += 16;
      }
      ctx.restore();
    }

    // Body content
    if (node.content?.trim() && cursorY < node.y + height - 16) {
      ctx.save();
      ctx.font = '400 11.5px "Segoe UI Variable", "Aptos", sans-serif';
      ctx.fillStyle = palette.muted;
      ctx.textBaseline = "top";
      const remainingLines = Math.max(1, Math.floor((node.y + height - 10 - cursorY) / 15));
      const bodyLines = wrapTextLines(ctx, node.content, innerWidth, remainingLines);
      for (const line of bodyLines) {
        ctx.fillText(line, node.x + padX, cursorY + 2);
        cursorY += 15;
      }
      ctx.restore();
    }
  }

  ctx.restore();

  // 5. Title & Discreet Signature
  if (graph.title?.trim()) {
    ctx.save();
    ctx.font = '600 12px "Segoe UI Variable", "Aptos", sans-serif';
    ctx.fillStyle = palette.muted;
    ctx.textBaseline = "bottom";
    ctx.textAlign = "left";
    ctx.fillText(graph.title.trim(), 20, worldHeight - 14);
    ctx.restore();
  }

  ctx.save();
  ctx.font = '600 11.5px "Segoe UI Variable", "Aptos", sans-serif';
  ctx.fillStyle = palette.muted;
  ctx.globalAlpha = 0.72;
  ctx.textBaseline = "bottom";
  ctx.textAlign = "right";
  ctx.fillText("Magnetares Notes", worldWidth - 20, worldHeight - 14);
  ctx.restore();

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  if (!base64) {
    throw new Error("Falha ao codificar imagem PNG.");
  }
  return base64;
}

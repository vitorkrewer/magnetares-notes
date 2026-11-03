import type { JSONContent } from "@tiptap/react";
import mermaid from "mermaid";

export interface PdfNoteInput {
  title: string;
  body: string;
  bodyText?: string;
  type?: string;
  language?: string;
  folder?: string;
  tags?: string[];
  updatedAt?: string;
}

/**
 * Constantes de página A4 (em pontos PDF: 1 pt = 1/72 pol; 1 mm = 2.83465 pt)
 * A4 = 210 mm x 297 mm = 595.28 pt x 841.89 pt
 */
const PAGE = {
  WIDTH: 595.28,
  HEIGHT: 841.89,
  MARGIN_TOP: 44,      // ~15.5 mm
  MARGIN_BOTTOM: 54,   // ~19 mm (inclui espaço reservado ao rodapé institucional)
  MARGIN_LEFT: 46,     // ~16.2 mm
  MARGIN_RIGHT: 46,    // ~16.2 mm
  FOOTER_Y: 28,
  FOOTER_LINE_Y: 39,
};

const CONTENT_WIDTH = PAGE.WIDTH - PAGE.MARGIN_LEFT - PAGE.MARGIN_RIGHT;

type FontKey = "F1" | "F2" | "F3" | "F4" | "F5" | "F6";
// F1 = Helvetica (Regular)
// F2 = Helvetica-Bold
// F3 = Helvetica-Oblique
// F4 = Helvetica-BoldOblique
// F5 = Courier (Monospace)
// F6 = Courier-Bold

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface InlineSpan {
  text: string;
  font: FontKey;
  size: number;
  color: RGB;
  bgColor?: RGB;
  strike?: boolean;
  underline?: boolean;
  isBadge?: boolean;
}

interface EmbeddedJpeg {
  name: string;
  widthPx: number;
  heightPx: number;
  bytes: Uint8Array;
}

interface PageStream {
  commands: string[];
}

/**
 * Mapeamento Unicode -> Windows-1252 (WinAnsiEncoding) para fontes Type1 padrão do PDF.
 * Garante acentuação completa do português (ã, õ, ç, é, ê, á, í, ó, ú, à, â, ô, etc.)
 * com texto 100% vetorial e selecionável.
 */
const WIN_ANSI_EXTRAS: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
};

const UNICODE_FALLBACKS: Record<string, string> = {
  "→": " -> ",
  "←": " <- ",
  "↔": " <-> ",
  "⇒": " => ",
  "⇌": " <=> ",
  "≤": "<=",
  "≥": ">=",
  "≠": "!=",
  "≈": "~=",
  "∞": "inf",
  "∑": "Sum",
  "∏": "Prod",
  "∫": "Int",
  "∬": "IntInt",
  "√": "sqrt",
  "∂": "d",
  "∇": "grad",
  "∆": "Delta",
  "Δ": "Delta",
  "α": "alpha",
  "β": "beta",
  "γ": "gamma",
  "δ": "delta",
  "ε": "epsilon",
  "θ": "theta",
  "λ": "lambda",
  "μ": "mu",
  "π": "pi",
  "ρ": "rho",
  "σ": "sigma",
  "τ": "tau",
  "φ": "phi",
  "ω": "omega",
  "Ω": "Omega",
  "▸": ">",
  "▶": ">",
  "▼": "v",
  "✔": "v",
  "✓": "v",
  "✗": "x",
  "✘": "x",
  "☐": "[ ]",
  "☑": "[x]",
  "💡": "[Nota]",
  "📐": "[Teorema]",
  "🔬": "[Experimento]",
  "⚠️": "[Atencao]",
  "⚡": "[Exemplo]",
};

function normalizeForWinAnsi(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (UNICODE_FALLBACKS[ch] !== undefined) {
      out += UNICODE_FALLBACKS[ch];
      continue;
    }
    const code = input.charCodeAt(i);
    // Ignora variation selectors ou surrogate pairs de emojis
    if (code >= 0xd800 && code <= 0xdfff) {
      continue;
    }
    if (code === 0xfe0f || code === 0xfe0e) {
      continue;
    }
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS[code] !== undefined) {
      out += ch;
    } else if (code === 0x09) {
      out += "    ";
    } else {
      out += " ";
    }
  }
  return out;
}

function toPdfHex(text: string): string {
  const clean = normalizeForWinAnsi(text);
  let hex = "<";
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    let byte = 0x20;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff)) {
      byte = code;
    } else if (WIN_ANSI_EXTRAS[code] !== undefined) {
      byte = WIN_ANSI_EXTRAS[code];
    }
    hex += byte.toString(16).padStart(2, "0").toUpperCase();
  }
  hex += ">";
  return hex;
}

/**
 * Converte expressões LaTeX simples para representação legível em texto vetorial
 */
function formatLatexReadable(latex: string): string {
  if (!latex) return "";
  let s = latex.trim();
  s = s.replace(/\\ce\{([^}]*)\}/g, "$1");
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\[([^\]]*)\]\{([^}]*)\}/g, "raiz($1, $2)");
  s = s.replace(/\\sqrt\{([^}]*)\}/g, "sqrt($1)");
  s = s.replace(/\\text\{([^}]*)\}/g, "$1");
  s = s.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  s = s.replace(/\\mathbf\{([^}]*)\}/g, "$1");
  s = s.replace(/\\left\(/g, "(").replace(/\\right\)/g, ")");
  s = s.replace(/\\left\[/g, "[").replace(/\\right\]/g, "]");
  s = s.replace(/\\pm/g, "±");
  s = s.replace(/\\times/g, "×");
  s = s.replace(/\\div/g, "÷");
  s = s.replace(/\\cdot/g, "·");
  s = s.replace(/\\le|\\leq/g, "<=");
  s = s.replace(/\\ge|\\geq/g, ">=");
  s = s.replace(/\\neq|\\ne/g, "!=");
  s = s.replace(/\\approx/g, "~=");
  s = s.replace(/\\infty/g, "inf");
  s = s.replace(/\\rightleftharpoons/g, " <=> ");
  s = s.replace(/\\rightarrow|\\to/g, " -> ");
  s = s.replace(/\\leftarrow/g, " <- ");
  s = s.replace(/\\Delta/g, "Delta");
  s = s.replace(/\\Omega/g, "Omega");
  s = s.replace(/\\alpha/g, "alpha");
  s = s.replace(/\\beta/g, "beta");
  s = s.replace(/\\gamma/g, "gamma");
  s = s.replace(/\\delta/g, "delta");
  s = s.replace(/\\theta/g, "theta");
  s = s.replace(/\\lambda/g, "lambda");
  s = s.replace(/\\mu/g, "mu");
  s = s.replace(/\\pi/g, "pi");
  s = s.replace(/\\rho/g, "rho");
  s = s.replace(/\\sigma/g, "sigma");
  s = s.replace(/\\tau/g, "tau");
  s = s.replace(/\\omega/g, "omega");
  s = s.replace(/\\partial/g, "d");
  s = s.replace(/\\nabla/g, "grad");
  s = s.replace(/\\sum/g, "Sum");
  s = s.replace(/\\prod/g, "Prod");
  s = s.replace(/\\int/g, "Int");
  s = s.replace(/\\iint/g, "IntInt");
  s = s.replace(/\\lim/g, "lim");
  s = s.replace(/\\vec\{([^}]*)\}/g, "$1");
  s = s.replace(/\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\/g, "");
  return normalizeForWinAnsi(s);
}

/**
 * Estimativa precisa de largura de string em pontos PDF para Helvetica e Courier
 */
function measureCharWidthFactor(ch: string, font: FontKey): number {
  if (font === "F5" || font === "F6") {
    return 0.6;
  }
  const isBold = font === "F2" || font === "F4";
  if ("ilI.,:;!|'` ".includes(ch)) return isBold ? 0.30 : 0.28;
  if ("ftrj()[]{}\"-".includes(ch)) return isBold ? 0.36 : 0.33;
  if ("mwMW@#%&QGDO0".includes(ch)) return isBold ? 0.78 : 0.74;
  if (ch >= "A" && ch <= "Z") return isBold ? 0.68 : 0.64;
  return isBold ? 0.56 : 0.52;
}

function measureTextWidth(text: string, font: FontKey, size: number): number {
  const clean = normalizeForWinAnsi(text);
  let total = 0;
  for (let i = 0; i < clean.length; i++) {
    total += measureCharWidthFactor(clean[i], font) * size;
  }
  return total;
}

function parseHexColor(hex?: string, fallback: RGB = { r: 0.1, g: 0.1, b: 0.09 }): RGB {
  if (!hex) return fallback;
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return { r: r / 255, g: g / 255, b: b / 255 };
    }
  }
  return fallback;
}

function fmtNum(n: number): string {
  return Number(n.toFixed(2)).toString();
}

function formatDatePtBr(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const validDate = Number.isNaN(d.getTime()) ? new Date() : d;
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(validDate);
  } catch {
    return validDate.toLocaleDateString("pt-BR");
  }
}

/**
 * Tenta renderizar um diagrama Mermaid em JPEG de alta resolução para embutir no PDF
 */
async function rasterizeMermaidToJpeg(code: string): Promise<{ widthPx: number; heightPx: number; bytes: Uint8Array } | null> {
  if (typeof document === "undefined" || !code.trim()) return null;
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: "default",
      securityLevel: "strict",
      fontFamily: "Segoe UI, Aptos, sans-serif",
    });
    const id = `mermaid-pdf-${Math.random().toString(36).slice(2, 9)}`;
    const { svg } = await mermaid.render(id, code.trim());
    if (!svg) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, "image/svg+xml");
    const svgEl = doc.querySelector("svg");
    if (!svgEl) return null;

    let width = 640;
    let height = 360;
    const viewBox = svgEl.getAttribute("viewBox");
    if (viewBox) {
      const parts = viewBox.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
        width = parts[2];
        height = parts[3];
      }
    }
    svgEl.setAttribute("width", String(width));
    svgEl.setAttribute("height", String(height));
    if (!svgEl.getAttribute("xmlns")) {
      svgEl.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }

    const serialized = new XMLSerializer().serializeToString(svgEl);
    const svgBase64 = window.btoa(unescape(encodeURIComponent(serialized)));
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = (e) => reject(e);
      image.src = dataUrl;
    });

    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64Part = jpegDataUrl.split(",")[1];
    if (!base64Part) return null;

    const binary = window.atob(base64Part);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return {
      widthPx: canvas.width,
      heightPx: canvas.height,
      bytes,
    };
  } catch {
    return null;
  }
}

/**
 * Extrai spans inline ricos a partir de nós filhos do TipTap
 */
function extractInlineSpans(
  nodes: JSONContent[] | undefined,
  baseSize = 10.5,
  baseColor: RGB = { r: 0.1, g: 0.1, b: 0.09 },
  forceBold = false,
  forceItalic = false,
  forceStrike = false
): InlineSpan[] {
  if (!nodes || !Array.isArray(nodes)) return [];
  const spans: InlineSpan[] = [];

  for (const node of nodes) {
    if (!node) continue;

    if (node.type === "hardBreak") {
      spans.push({
        text: "\n",
        font: "F1",
        size: baseSize,
        color: baseColor,
      });
      continue;
    }

    if (node.type === "calculation") {
      const expr = (node.attrs?.expression as string) || "";
      const res = (node.attrs?.result as string) || "";
      spans.push({
        text: ` ${expr} = ${res} `,
        font: "F6",
        size: Math.max(8.5, baseSize - 1),
        color: { r: 0.44, g: 0.31, b: 0.0 },
        bgColor: { r: 0.95, g: 0.94, b: 0.91 },
        isBadge: true,
        strike: forceStrike,
      });
      continue;
    }

    if (node.type === "mathInline") {
      const latex = (node.attrs?.latex as string) || "";
      const readable = formatLatexReadable(latex);
      spans.push({
        text: ` ${readable} `,
        font: "F3",
        size: baseSize,
        color: { r: 0.12, g: 0.11, b: 0.1 },
        bgColor: { r: 0.97, g: 0.965, b: 0.945 },
        isBadge: true,
        strike: forceStrike,
      });
      continue;
    }

    if (node.type === "text" && node.text) {
      let bold = forceBold;
      let italic = forceItalic;
      let strike = forceStrike;
      let underline = false;
      let code = false;
      let color: RGB = baseColor;
      let bgColor: RGB | undefined;

      for (const mark of node.marks || []) {
        if (mark.type === "bold") bold = true;
        if (mark.type === "italic") italic = true;
        if (mark.type === "strike") strike = true;
        if (mark.type === "underline") underline = true;
        if (mark.type === "code") {
          code = true;
          bgColor = { r: 0.95, g: 0.945, b: 0.925 };
        }
        if (mark.type === "highlight") {
          bgColor = { r: 0.97, g: 0.875, b: 0.45 };
        }
        if (mark.type === "link") {
          underline = true;
          color = { r: 0.54, g: 0.39, b: 0.0 };
        }
        if (mark.type === "textStyle" && mark.attrs?.color) {
          color = parseHexColor(mark.attrs.color as string, color);
        }
      }

      let font: FontKey = "F1";
      if (code) {
        font = bold ? "F6" : "F5";
      } else if (bold && italic) {
        font = "F4";
      } else if (bold) {
        font = "F2";
      } else if (italic) {
        font = "F3";
      }

      spans.push({
        text: normalizeForWinAnsi(node.text),
        font,
        size: code ? Math.max(8.5, baseSize - 1) : baseSize,
        color,
        bgColor,
        strike,
        underline,
      });
    } else if (node.content) {
      spans.push(
        ...extractInlineSpans(node.content, baseSize, baseColor, forceBold, forceItalic, forceStrike)
      );
    }
  }

  return spans;
}

interface PositionedToken {
  text: string;
  font: FontKey;
  size: number;
  width: number;
  color: RGB;
  bgColor?: RGB;
  strike?: boolean;
  underline?: boolean;
  isBadge?: boolean;
}

interface WrappedLine {
  tokens: PositionedToken[];
  width: number;
  height: number;
}

/**
 * Quebra uma lista de InlineSpans em linhas ajustadas à largura disponível (`maxWidth`)
 */
function wrapInlineSpans(spans: InlineSpan[], maxWidth: number, lineHeightFactor = 1.5): WrappedLine[] {
  const lines: WrappedLine[] = [];
  let currentTokens: PositionedToken[] = [];
  let currentWidth = 0;
  let currentMaxSize = 10.5;

  const pushCurrentLine = () => {
    lines.push({
      tokens: currentTokens,
      width: currentWidth,
      height: currentMaxSize * lineHeightFactor,
    });
    currentTokens = [];
    currentWidth = 0;
  };

  for (const span of spans) {
    if (span.size > currentMaxSize) currentMaxSize = span.size;
    const rawParts = span.text.split("\n");

    rawParts.forEach((part, partIdx) => {
      if (partIdx > 0) {
        pushCurrentLine();
      }
      if (!part) return;

      // Divide mantendo espaços
      const words = part.match(/\S+|\s+/g) || [];
      for (const word of words) {
        // Evita espaço inicial em linha quebrada
        if (currentTokens.length === 0 && /^\s+$/.test(word)) {
          continue;
        }

        const wordWidth = measureTextWidth(word, span.font, span.size);

        if (currentWidth + wordWidth <= maxWidth || currentTokens.length === 0) {
          // Se uma única palavra comprida ultrapassar maxWidth, quebra por caracteres
          if (wordWidth > maxWidth && word.length > 1) {
            let chunk = "";
            for (let c = 0; c < word.length; c++) {
              const candidate = chunk + word[c];
              if (measureTextWidth(candidate, span.font, span.size) > maxWidth && chunk.length > 0) {
                const cw = measureTextWidth(chunk, span.font, span.size);
                currentTokens.push({
                  text: chunk,
                  font: span.font,
                  size: span.size,
                  width: cw,
                  color: span.color,
                  bgColor: span.bgColor,
                  strike: span.strike,
                  underline: span.underline,
                  isBadge: span.isBadge,
                });
                currentWidth += cw;
                pushCurrentLine();
                chunk = word[c];
              } else {
                chunk = candidate;
              }
            }
            if (chunk) {
              const cw = measureTextWidth(chunk, span.font, span.size);
              currentTokens.push({
                text: chunk,
                font: span.font,
                size: span.size,
                width: cw,
                color: span.color,
                bgColor: span.bgColor,
                strike: span.strike,
                underline: span.underline,
                isBadge: span.isBadge,
              });
              currentWidth += cw;
            }
          } else {
            currentTokens.push({
              text: word,
              font: span.font,
              size: span.size,
              width: wordWidth,
              color: span.color,
              bgColor: span.bgColor,
              strike: span.strike,
              underline: span.underline,
              isBadge: span.isBadge,
            });
            currentWidth += wordWidth;
          }
        } else {
          pushCurrentLine();
          if (!/^\s+$/.test(word)) {
            currentTokens.push({
              text: word,
              font: span.font,
              size: span.size,
              width: wordWidth,
              color: span.color,
              bgColor: span.bgColor,
              strike: span.strike,
              underline: span.underline,
              isBadge: span.isBadge,
            });
            currentWidth = wordWidth;
          }
        }
      }
    });
  }

  if (currentTokens.length > 0 || lines.length === 0) {
    pushCurrentLine();
  }

  return lines;
}

/**
 * Construtor de páginas PDF com paginação automática e comandos vetoriais
 */
class PdfDocumentBuilder {
  public pages: PageStream[] = [];
  public images: EmbeddedJpeg[] = [];
  private currentPage!: PageStream;
  public cursorY = PAGE.HEIGHT - PAGE.MARGIN_TOP;

  constructor() {
    this.addPage();
  }

  public addPage(): void {
    this.currentPage = { commands: [] };
    // Garante fundo 100% branco puro em toda a folha A4
    this.currentPage.commands.push(
      `q 1 1 1 rg 0 0 ${fmtNum(PAGE.WIDTH)} ${fmtNum(PAGE.HEIGHT)} re f Q`
    );
    this.pages.push(this.currentPage);
    this.cursorY = PAGE.HEIGHT - PAGE.MARGIN_TOP;
  }

  public ensureSpace(neededHeight: number): void {
    if (this.cursorY - neededHeight < PAGE.MARGIN_BOTTOM) {
      this.addPage();
    }
  }

  public moveDown(pts: number): void {
    this.cursorY -= pts;
    if (this.cursorY < PAGE.MARGIN_BOTTOM) {
      this.addPage();
    }
  }

  public drawRect(x: number, y: number, w: number, h: number, fill?: RGB, stroke?: RGB, lineWidth = 0.75): void {
    const ops: string[] = ["q"];
    if (fill) {
      ops.push(`${fmtNum(fill.r)} ${fmtNum(fill.g)} ${fmtNum(fill.b)} rg`);
    }
    if (stroke) {
      ops.push(`${fmtNum(stroke.r)} ${fmtNum(stroke.g)} ${fmtNum(stroke.b)} RG`);
      ops.push(`${fmtNum(lineWidth)} w`);
    }
    const paintOp = fill && stroke ? "B" : fill ? "f" : "S";
    ops.push(`${fmtNum(x)} ${fmtNum(y)} ${fmtNum(w)} ${fmtNum(h)} re ${paintOp}`);
    ops.push("Q");
    this.currentPage.commands.push(ops.join(" "));
  }

  public drawLine(x1: number, y1: number, x2: number, y2: number, color: RGB, lineWidth = 0.75): void {
    this.currentPage.commands.push(
      `q ${fmtNum(color.r)} ${fmtNum(color.g)} ${fmtNum(color.b)} RG ${fmtNum(lineWidth)} w ${fmtNum(x1)} ${fmtNum(y1)} m ${fmtNum(x2)} ${fmtNum(y2)} l S Q`
    );
  }

  public drawCheckbox(x: number, y: number, size: number, checked: boolean): void {
    if (checked) {
      // Fundo âmbar Magnetares (#d19a13) com borda #b47e00 e checkmark branco vetorial
      this.drawRect(
        x,
        y,
        size,
        size,
        { r: 0.82, g: 0.604, b: 0.075 },
        { r: 0.706, g: 0.494, b: 0.0 },
        0.8
      );
      const x1 = x + size * 0.22;
      const y1 = y + size * 0.52;
      const x2 = x + size * 0.43;
      const y2 = y + size * 0.26;
      const x3 = x + size * 0.80;
      const y3 = y + size * 0.76;
      this.currentPage.commands.push(
        `q 1 1 1 RG 1.35 w 1 J 1 j ${fmtNum(x1)} ${fmtNum(y1)} m ${fmtNum(x2)} ${fmtNum(y2)} l ${fmtNum(x3)} ${fmtNum(y3)} l S Q`
      );
    } else {
      this.drawRect(
        x,
        y,
        size,
        size,
        { r: 1, g: 1, b: 1 },
        { r: 0.62, g: 0.61, b: 0.58 },
        0.85
      );
    }
  }

  public drawTextSingle(text: string, x: number, y: number, font: FontKey, size: number, color: RGB): void {
    if (!text) return;
    const hex = toPdfHex(text);
    this.currentPage.commands.push(
      `q ${fmtNum(color.r)} ${fmtNum(color.g)} ${fmtNum(color.b)} rg BT /${font} ${fmtNum(size)} Tf 1 0 0 1 ${fmtNum(x)} ${fmtNum(y)} Tm ${hex} Tj ET Q`
    );
  }

  public drawWrappedLine(
    line: WrappedLine,
    xLeft: number,
    baselineY: number,
    maxWidth: number,
    align: "left" | "center" | "right" | "justify" = "left"
  ): void {
    let curX = xLeft;
    if (align === "center") {
      curX = xLeft + Math.max(0, (maxWidth - line.width) / 2);
    } else if (align === "right") {
      curX = xLeft + Math.max(0, maxWidth - line.width);
    }

    for (const token of line.tokens) {
      if (token.bgColor) {
        this.drawRect(
          curX - 1,
          baselineY - 2.5,
          token.width + 2,
          token.size + 3.5,
          token.bgColor,
          token.isBadge ? { r: 0.86, g: 0.84, b: 0.79 } : undefined,
          0.5
        );
      }

      this.drawTextSingle(token.text, curX, baselineY, token.font, token.size, token.color);

      if (token.underline) {
        this.drawLine(curX, baselineY - 1.5, curX + token.width, baselineY - 1.5, token.color, 0.6);
      }

      if (token.strike) {
        const strikeY = baselineY + token.size * 0.30;
        this.drawLine(curX, strikeY, curX + token.width, strikeY, token.color, 0.65);
      }

      curX += token.width;
    }
  }

  public drawImage(imgName: string, x: number, y: number, w: number, h: number): void {
    this.currentPage.commands.push(
      `q ${fmtNum(w)} 0 0 ${fmtNum(h)} ${fmtNum(x)} ${fmtNum(y)} cm /${imgName} Do Q`
    );
  }

  public stampFooters(noteTitle: string, formattedDate: string): void {
    const total = this.pages.length;
    const cleanTitle = (noteTitle || "Nota").trim();
    const truncatedTitle = cleanTitle.length > 52 ? `${cleanTitle.slice(0, 49)}...` : cleanTitle;
    const brandText = "Gerado via Magnetares Notes";

    this.pages.forEach((page, idx) => {
      const pageNum = idx + 1;
      const metaText = `${truncatedTitle} • ${formattedDate}   •   ${pageNum}/${total}`;
      const metaWidth = measureTextWidth(metaText, "F3", 8);
      const rightX = PAGE.WIDTH - PAGE.MARGIN_RIGHT - metaWidth;

      // Linha divisória superior do rodapé
      page.commands.push(
        `q 0.85 0.847 0.827 RG 0.5 w ${fmtNum(PAGE.MARGIN_LEFT)} ${fmtNum(PAGE.FOOTER_LINE_Y)} m ${fmtNum(PAGE.WIDTH - PAGE.MARGIN_RIGHT)} ${fmtNum(PAGE.FOOTER_LINE_Y)} l S Q`
      );
      // Marca institucional à esquerda
      page.commands.push(
        `q 0.267 0.259 0.239 rg BT /F2 8 Tf 1 0 0 1 ${fmtNum(PAGE.MARGIN_LEFT)} ${fmtNum(PAGE.FOOTER_Y)} Tm ${toPdfHex(brandText)} Tj ET Q`
      );
      // Metadados e paginação à direita
      page.commands.push(
        `q 0.533 0.525 0.498 rg BT /F3 8 Tf 1 0 0 1 ${fmtNum(rightX)} ${fmtNum(PAGE.FOOTER_Y)} Tm ${toPdfHex(metaText)} Tj ET Q`
      );
    });
  }
}

/**
 * Renderiza os blocos da nota no construtor PDF
 */
async function renderBlocksToPdf(
  blocks: JSONContent[],
  builder: PdfDocumentBuilder,
  indentLeft = 0
): Promise<void> {
  const xStart = PAGE.MARGIN_LEFT + indentLeft;
  const availWidth = CONTENT_WIDTH - indentLeft;

  for (const block of blocks) {
    if (!block) continue;

    switch (block.type) {
      case "heading": {
        const level = Number(block.attrs?.level || 1);
        const size = level === 1 ? 15.5 : level === 2 ? 13 : 11.5;
        const spaceBefore = level === 1 ? 12 : level === 2 ? 10 : 8;
        const spaceAfter = level === 1 ? 6 : 4;
        const align = (block.attrs?.textAlign as "left" | "center" | "right" | "justify") || "left";

        const spans = extractInlineSpans(
          block.content,
          size,
          { r: 0.07, g: 0.07, b: 0.07 },
          true,
          false
        );
        const lines = wrapInlineSpans(spans, availWidth, 1.32);
        const totalHeight = lines.reduce((acc, l) => acc + l.height, 0) + spaceBefore + spaceAfter + 18;
        builder.ensureSpace(totalHeight);
        builder.cursorY -= spaceBefore;

        for (const line of lines) {
          builder.ensureSpace(line.height);
          const baseline = builder.cursorY - size;
          builder.drawWrappedLine(line, xStart, baseline, availWidth, align);
          builder.cursorY -= line.height;
        }

        if (level === 1) {
          builder.cursorY -= 2;
          builder.drawLine(
            xStart,
            builder.cursorY,
            xStart + availWidth,
            builder.cursorY,
            { r: 0.847, g: 0.839, b: 0.808 },
            0.75
          );
          builder.cursorY -= 4;
        }
        builder.cursorY -= spaceAfter;
        break;
      }

      case "paragraph": {
        const align = (block.attrs?.textAlign as "left" | "center" | "right" | "justify") || "left";
        const spans = extractInlineSpans(block.content, 10.5, { r: 0.102, g: 0.102, b: 0.09 });
        if (spans.length === 0) {
          builder.moveDown(10);
          break;
        }
        const lines = wrapInlineSpans(spans, availWidth, 1.52);
        for (const line of lines) {
          builder.ensureSpace(line.height);
          const baseline = builder.cursorY - 10.5;
          builder.drawWrappedLine(line, xStart, baseline, availWidth, align);
          builder.cursorY -= line.height;
        }
        builder.cursorY -= 5;
        break;
      }

      case "bulletList":
      case "orderedList": {
        const isOrdered = block.type === "orderedList";
        const items = block.content || [];
        items.forEach((item, idx) => {
          const bulletLabel = isOrdered ? `${idx + 1}.` : "•";
          const itemSpans: InlineSpan[] = [];
          (item.content || []).forEach((inner, pIdx) => {
            if (pIdx > 0) {
              itemSpans.push({ text: "\n", font: "F1", size: 10.5, color: { r: 0.1, g: 0.1, b: 0.09 } });
            }
            itemSpans.push(...extractInlineSpans(inner.content, 10.5));
          });

          const bulletIndent = 16;
          const lines = wrapInlineSpans(itemSpans, availWidth - bulletIndent, 1.48);

          lines.forEach((line, lineIdx) => {
            builder.ensureSpace(line.height);
            const baseline = builder.cursorY - 10.5;
            if (lineIdx === 0) {
              builder.drawTextSingle(
                bulletLabel,
                xStart + 2,
                baseline,
                "F2",
                10.5,
                { r: 0.25, g: 0.24, b: 0.22 }
              );
            }
            builder.drawWrappedLine(line, xStart + bulletIndent, baseline, availWidth - bulletIndent, "left");
            builder.cursorY -= line.height;
          });
          builder.cursorY -= 3;
        });
        builder.cursorY -= 4;
        break;
      }

      case "taskList": {
        const items = block.content || [];
        for (const item of items) {
          const checked = Boolean(item.attrs?.checked);
          const textColor: RGB = checked
            ? { r: 0.52, g: 0.51, b: 0.48 }
            : { r: 0.102, g: 0.102, b: 0.09 };

          const itemSpans: InlineSpan[] = [];
          (item.content || []).forEach((inner, pIdx) => {
            if (pIdx > 0) {
              itemSpans.push({ text: "\n", font: "F1", size: 10.5, color: textColor });
            }
            itemSpans.push(
              ...extractInlineSpans(inner.content, 10.5, textColor, false, false, checked)
            );
          });

          const boxSize = 10;
          const textIndent = 18;
          const lines = wrapInlineSpans(itemSpans, availWidth - textIndent, 1.5);

          lines.forEach((line, lineIdx) => {
            builder.ensureSpace(line.height);
            const baseline = builder.cursorY - 10.5;
            if (lineIdx === 0) {
              builder.drawCheckbox(xStart, baseline - 1, boxSize, checked);
            }
            builder.drawWrappedLine(line, xStart + textIndent, baseline, availWidth - textIndent, "left");
            builder.cursorY -= line.height;
          });
          builder.cursorY -= 4;
        }
        builder.cursorY -= 4;
        break;
      }

      case "blockquote": {
        const quoteSpans: InlineSpan[] = [];
        (block.content || []).forEach((p, idx) => {
          if (idx > 0) {
            quoteSpans.push({ text: "\n", font: "F3", size: 10.2, color: { r: 0.38, g: 0.37, b: 0.34 } });
          }
          quoteSpans.push(
            ...extractInlineSpans(p.content, 10.2, { r: 0.38, g: 0.37, b: 0.34 }, false, true)
          );
        });

        const quoteIndent = 14;
        const lines = wrapInlineSpans(quoteSpans, availWidth - quoteIndent, 1.48);
        builder.cursorY -= 3;

        for (const line of lines) {
          builder.ensureSpace(line.height);
          const topY = builder.cursorY;
          const baseline = builder.cursorY - 10.2;
          // Barra vertical âmbar da citação
          builder.drawRect(
            xStart,
            topY - line.height + 2,
            2.5,
            line.height,
            { r: 0.89, g: 0.71, b: 0.255 }
          );
          builder.drawWrappedLine(line, xStart + quoteIndent, baseline, availWidth - quoteIndent, "left");
          builder.cursorY -= line.height;
        }
        builder.cursorY -= 6;
        break;
      }

      case "callout": {
        const calloutType = (block.attrs?.type as string) || "info";
        const palette: Record<string, { label: string; border: RGB; bg: RGB }> = {
          info: {
            label: "Nota / Informação",
            border: { r: 0.23, g: 0.51, b: 0.96 },
            bg: { r: 0.975, g: 0.98, b: 0.995 },
          },
          theorem: {
            label: "Teorema / Definição",
            border: { r: 0.85, g: 0.47, b: 0.02 },
            bg: { r: 0.995, g: 0.98, b: 0.955 },
          },
          experiment: {
            label: "Experimento / Laboratório",
            border: { r: 0.06, g: 0.72, b: 0.51 },
            bg: { r: 0.96, g: 0.99, b: 0.975 },
          },
          warning: {
            label: "Atenção / Alerta Clínico",
            border: { r: 0.93, g: 0.27, b: 0.27 },
            bg: { r: 0.995, g: 0.965, b: 0.965 },
          },
          example: {
            label: "Exemplo Prático",
            border: { r: 0.55, g: 0.36, b: 0.96 },
            bg: { r: 0.98, g: 0.97, b: 0.995 },
          },
        };
        const style = palette[calloutType] || palette.info;

        const bodySpans: InlineSpan[] = [];
        (block.content || []).forEach((p, idx) => {
          if (idx > 0) {
            bodySpans.push({ text: "\n", font: "F1", size: 10, color: { r: 0.1, g: 0.1, b: 0.09 } });
          }
          bodySpans.push(...extractInlineSpans(p.content, 10));
        });

        const innerPadX = 12;
        const lines = wrapInlineSpans(bodySpans, availWidth - innerPadX * 2, 1.45);
        const boxHeight = 20 + lines.reduce((acc, l) => acc + l.height, 0) + 10;

        builder.ensureSpace(Math.min(boxHeight + 8, 160));
        builder.cursorY -= 4;

        const topY = builder.cursorY;
        if (topY - boxHeight >= PAGE.MARGIN_BOTTOM) {
          builder.drawRect(
            xStart,
            topY - boxHeight,
            availWidth,
            boxHeight,
            style.bg,
            { r: 0.86, g: 0.85, b: 0.81 },
            0.5
          );
          builder.drawRect(xStart, topY - boxHeight, 3.2, boxHeight, style.border);
        }

        builder.drawTextSingle(style.label, xStart + innerPadX, builder.cursorY - 13, "F2", 10, style.border);
        builder.cursorY -= 19;

        for (const line of lines) {
          builder.ensureSpace(line.height);
          const baseline = builder.cursorY - 10;
          builder.drawWrappedLine(line, xStart + innerPadX, baseline, availWidth - innerPadX * 2, "left");
          builder.cursorY -= line.height;
        }
        builder.cursorY -= 10;
        break;
      }

      case "toggle": {
        const title = (block.attrs?.title as string) || "Pergunta / Tópico de Estudo";
        const headerSpans: InlineSpan[] = [
          {
            text: `> ${formatLatexReadable(title)}`,
            font: "F2",
            size: 10.2,
            color: { r: 0.1, g: 0.1, b: 0.09 },
          },
        ];
        const headerLines = wrapInlineSpans(headerSpans, availWidth - 16, 1.4);
        const headerH = headerLines.reduce((s, l) => s + l.height, 0) + 8;

        builder.ensureSpace(headerH + 24);
        builder.cursorY -= 4;
        builder.drawRect(
          xStart,
          builder.cursorY - headerH,
          availWidth,
          headerH,
          { r: 0.957, g: 0.953, b: 0.937 },
          { r: 0.835, g: 0.816, b: 0.773 },
          0.75
        );
        builder.cursorY -= 4;
        for (const hl of headerLines) {
          const baseline = builder.cursorY - 10.2;
          builder.drawWrappedLine(hl, xStart + 8, baseline, availWidth - 16, "left");
          builder.cursorY -= hl.height;
        }
        builder.cursorY -= 6;

        if (block.content && block.content.length > 0) {
          await renderBlocksToPdf(block.content, builder, indentLeft + 10);
        }
        builder.cursorY -= 4;
        break;
      }

      case "mathBlock": {
        const latex = (block.attrs?.latex as string) || "";
        const readable = formatLatexReadable(latex);
        const spans: InlineSpan[] = [
          {
            text: readable,
            font: "F3",
            size: 11.5,
            color: { r: 0.05, g: 0.05, b: 0.05 },
          },
        ];
        const lines = wrapInlineSpans(spans, availWidth - 24, 1.45);
        const boxH = lines.reduce((s, l) => s + l.height, 0) + 16;

        builder.ensureSpace(boxH + 8);
        builder.cursorY -= 4;
        builder.drawRect(
          xStart,
          builder.cursorY - boxH,
          availWidth,
          boxH,
          { r: 0.98, g: 0.976, b: 0.965 },
          { r: 0.835, g: 0.816, b: 0.773 },
          0.75
        );
        builder.cursorY -= 8;
        for (const line of lines) {
          const baseline = builder.cursorY - 11.5;
          builder.drawWrappedLine(line, xStart + 12, baseline, availWidth - 24, "center");
          builder.cursorY -= line.height;
        }
        builder.cursorY -= 12;
        break;
      }

      case "mermaid": {
        const code = (block.attrs?.code as string) || "";
        const caption = (block.attrs?.caption as string) || "";
        const raster = await rasterizeMermaidToJpeg(code);

        if (raster) {
          const imgName = `Im${builder.images.length + 1}`;
          builder.images.push({
            name: imgName,
            widthPx: raster.widthPx,
            heightPx: raster.heightPx,
            bytes: raster.bytes,
          });

          const maxImgW = availWidth - 16;
          const maxImgH = 320;
          const scale = Math.min(maxImgW / (raster.widthPx / 2), maxImgH / (raster.heightPx / 2), 1);
          const drawW = (raster.widthPx / 2) * scale;
          const drawH = (raster.heightPx / 2) * scale;

          builder.ensureSpace(drawH + (caption ? 28 : 14));
          builder.cursorY -= 6;
          const imgX = xStart + (availWidth - drawW) / 2;
          const imgY = builder.cursorY - drawH;
          builder.drawRect(
            xStart,
            imgY - 4,
            availWidth,
            drawH + 8,
            { r: 1, g: 1, b: 1 },
            { r: 0.835, g: 0.816, b: 0.773 },
            0.75
          );
          builder.drawImage(imgName, imgX, imgY, drawW, drawH);
          builder.cursorY = imgY - 8;

          if (caption) {
            const capSpans: InlineSpan[] = [
              { text: caption, font: "F3", size: 9, color: { r: 0.35, g: 0.34, b: 0.32 } },
            ];
            const capLines = wrapInlineSpans(capSpans, availWidth, 1.35);
            for (const cl of capLines) {
              builder.ensureSpace(cl.height);
              builder.drawWrappedLine(cl, xStart, builder.cursorY - 9, availWidth, "center");
              builder.cursorY -= cl.height;
            }
          }
          builder.cursorY -= 6;
        } else {
          // Fallback textual caso canvas não esteja disponível
          await renderCodeBox(builder, code, "Diagrama Mermaid", xStart, availWidth);
          if (caption) {
            const capSpans: InlineSpan[] = [
              { text: caption, font: "F3", size: 9, color: { r: 0.35, g: 0.34, b: 0.32 } },
            ];
            const capLines = wrapInlineSpans(capSpans, availWidth, 1.35);
            for (const cl of capLines) {
              builder.ensureSpace(cl.height);
              builder.drawWrappedLine(cl, xStart, builder.cursorY - 9, availWidth, "center");
              builder.cursorY -= cl.height;
            }
          }
        }
        break;
      }

      case "codeBlock": {
        const lang = (block.attrs?.language as string) || "código";
        const codeText = (block.content || []).map((c) => c.text || "").join("");
        await renderCodeBox(builder, codeText, lang, xStart, availWidth);
        break;
      }

      case "table": {
        const rows = block.content || [];
        if (rows.length === 0) break;

        const numCols = Math.max(...rows.map((r) => (r.content || []).length), 1);
        const colMaxWeights = new Array<number>(numCols).fill(8);

        rows.forEach((row) => {
          (row.content || []).forEach((cell, cIdx) => {
            const cellText = (cell.content || [])
              .map((p) => (p.content || []).map((t) => t.text || "").join(""))
              .join(" ");
            colMaxWeights[cIdx] = Math.max(colMaxWeights[cIdx], Math.min(cellText.length, 60));
          });
        });

        const totalWeight = colMaxWeights.reduce((a, b) => a + b, 0) || 1;
        const colWidths = colMaxWeights.map((w) => (w / totalWeight) * availWidth);
        const cellPadX = 6;
        const cellPadY = 5;

        const prepareRowLayout = (rowNode: JSONContent, isHeader: boolean) => {
          const cells = rowNode.content || [];
          const cellLinesList: WrappedLine[][] = [];
          let maxRowH = 18;

          for (let c = 0; c < numCols; c++) {
            const cellNode = cells[c];
            const spans: InlineSpan[] = [];
            if (cellNode?.content) {
              cellNode.content.forEach((p, pIdx) => {
                if (pIdx > 0) {
                  spans.push({ text: "\n", font: "F1", size: 9, color: { r: 0.1, g: 0.1, b: 0.09 } });
                }
                spans.push(
                  ...extractInlineSpans(
                    p.content,
                    9,
                    { r: 0.08, g: 0.08, b: 0.07 },
                    isHeader,
                    false
                  )
                );
              });
            }
            const cLines = wrapInlineSpans(spans, Math.max(24, colWidths[c] - cellPadX * 2), 1.35);
            cellLinesList.push(cLines);
            const cellH = cLines.reduce((acc, l) => acc + l.height, 0) + cellPadY * 2;
            if (cellH > maxRowH) maxRowH = cellH;
          }

          return { cellLinesList, rowHeight: maxRowH };
        };

        const drawRow = (rowNode: JSONContent, isHeader: boolean) => {
          const { cellLinesList, rowHeight } = prepareRowLayout(rowNode, isHeader);
          let curColX = xStart;
          const rowTopY = builder.cursorY;

          for (let c = 0; c < numCols; c++) {
            const cw = colWidths[c];
            builder.drawRect(
              curColX,
              rowTopY - rowHeight,
              cw,
              rowHeight,
              isHeader ? { r: 0.957, g: 0.953, b: 0.933 } : { r: 1, g: 1, b: 1 },
              { r: 0.784, g: 0.773, b: 0.737 },
              0.75
            );
            if (isHeader) {
              builder.drawLine(
                curColX,
                rowTopY - rowHeight,
                curColX + cw,
                rowTopY - rowHeight,
                { r: 0.72, g: 0.71, b: 0.67 },
                1.25
              );
            }

            let lineY = rowTopY - cellPadY;
            for (const cl of cellLinesList[c]) {
              const baseline = lineY - 9;
              builder.drawWrappedLine(
                cl,
                curColX + cellPadX,
                baseline,
                cw - cellPadX * 2,
                "left"
              );
              lineY -= cl.height;
            }
            curColX += cw;
          }

          builder.cursorY -= rowHeight;
        };

        builder.cursorY -= 4;
        const headerRowNode = rows[0];

        rows.forEach((rowNode, rIdx) => {
          const isHeader = rIdx === 0;
          const { rowHeight } = prepareRowLayout(rowNode, isHeader);

          if (builder.cursorY - rowHeight < PAGE.MARGIN_BOTTOM) {
            builder.addPage();
            // Repete o cabeçalho da tabela no topo da nova página
            if (!isHeader && headerRowNode) {
              drawRow(headerRowNode, true);
            }
          }
          drawRow(rowNode, isHeader);
        });

        builder.cursorY -= 8;
        break;
      }

      default:
        if (block.content) {
          await renderBlocksToPdf(block.content, builder, indentLeft);
        }
        break;
    }
  }
}

async function renderCodeBox(
  builder: PdfDocumentBuilder,
  codeText: string,
  languageLabel: string,
  xStart: number,
  availWidth: number
): Promise<void> {
  const rawLines = (codeText || "").replace(/\r\n/g, "\n").split("\n");
  const codeSpans: InlineSpan[] = [
    {
      text: rawLines.join("\n"),
      font: "F5",
      size: 8.5,
      color: { r: 0.08, g: 0.08, b: 0.08 },
    },
  ];
  const wrappedLines = wrapInlineSpans(codeSpans, availWidth - 18, 1.38);

  builder.cursorY -= 4;
  // Cabeçalho discreto da linguagem se houver
  if (languageLabel) {
    builder.ensureSpace(28);
    builder.drawRect(
      xStart,
      builder.cursorY - 15,
      availWidth,
      15,
      { r: 0.935, g: 0.93, b: 0.91 },
      { r: 0.84, g: 0.82, b: 0.78 },
      0.6
    );
    builder.drawTextSingle(
      languageLabel.toUpperCase(),
      xStart + 8,
      builder.cursorY - 10.5,
      "F6",
      7.5,
      { r: 0.38, g: 0.37, b: 0.34 }
    );
    builder.cursorY -= 15;
  }

  for (const line of wrappedLines) {
    const lineBoxH = line.height + 2;
    if (builder.cursorY - lineBoxH < PAGE.MARGIN_BOTTOM) {
      builder.addPage();
    }
    builder.drawRect(
      xStart,
      builder.cursorY - lineBoxH,
      availWidth,
      lineBoxH,
      { r: 0.973, g: 0.969, b: 0.957 },
      { r: 0.87, g: 0.85, b: 0.8 },
      0.5
    );
    const baseline = builder.cursorY - 9.5;
    builder.drawWrappedLine(line, xStart + 9, baseline, availWidth - 18, "left");
    builder.cursorY -= lineBoxH;
  }

  builder.cursorY -= 8;
}

/**
 * Monta o binário PDF 1.4 final a partir das páginas e imagens coletadas
 */
function assemblePdfBinary(builder: PdfDocumentBuilder, title: string): Uint8Array {
  const chunks: Uint8Array[] = [];
  let byteOffset = 0;
  const encoder = new TextEncoder();

  const pushStr = (s: string) => {
    const encoded = encoder.encode(s);
    chunks.push(encoded);
    byteOffset += encoded.length;
  };

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    byteOffset += b.length;
  };

  // Objetos reservados:
  // 1 = Catalog
  // 2 = Pages
  // 3..8 = Fontes F1..F6
  // 9 = Info
  const firstImageObjId = 10;
  const numImages = builder.images.length;
  const firstPageObjId = firstImageObjId + numImages;
  const numPages = builder.pages.length;
  const totalObjects = firstPageObjId + numPages * 2 - 1;

  const offsets: number[] = new Array(totalObjects + 1).fill(0);

  const startObj = (id: number) => {
    offsets[id] = byteOffset;
    pushStr(`${id} 0 obj\n`);
  };

  const endObj = () => {
    pushStr("endobj\n");
  };

  // Cabeçalho PDF 1.4
  pushStr("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n");

  // 1: Catalog
  startObj(1);
  pushStr("<< /Type /Catalog /Pages 2 0 R >>\n");
  endObj();

  // 2: Pages
  const kidsRefs: string[] = [];
  for (let i = 0; i < numPages; i++) {
    kidsRefs.push(`${firstPageObjId + i * 2} 0 R`);
  }
  startObj(2);
  pushStr(`<< /Type /Pages /Kids [ ${kidsRefs.join(" ")} ] /Count ${numPages} >>\n`);
  endObj();

  // 3..8: Fontes padrão PDF com WinAnsiEncoding
  const fontDefs: Array<{ id: number; baseFont: string }> = [
    { id: 3, baseFont: "Helvetica" },
    { id: 4, baseFont: "Helvetica-Bold" },
    { id: 5, baseFont: "Helvetica-Oblique" },
    { id: 6, baseFont: "Helvetica-BoldOblique" },
    { id: 7, baseFont: "Courier" },
    { id: 8, baseFont: "Courier-Bold" },
  ];
  for (const f of fontDefs) {
    startObj(f.id);
    pushStr(`<< /Type /Font /Subtype /Type1 /BaseFont /${f.baseFont} /Encoding /WinAnsiEncoding >>\n`);
    endObj();
  }

  // 9: Info metadata
  startObj(9);
  pushStr(
    `<< /Title ${toPdfHex(title || "Magnetares Notes")} /Producer ${toPdfHex("Magnetares Notes v1.9.0")} /Creator ${toPdfHex("Magnetares Notes")} >>\n`
  );
  endObj();

  // Imagens XObject (Mermaid JPEG)
  builder.images.forEach((img, idx) => {
    const objId = firstImageObjId + idx;
    startObj(objId);
    pushStr(
      `<< /Type /XObject /Subtype /Image /Width ${img.widthPx} /Height ${img.heightPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`
    );
    pushBytes(img.bytes);
    pushStr("\nendstream\n");
    endObj();
  });

  const xObjectDictEntries = builder.images
    .map((img, idx) => `/${img.name} ${firstImageObjId + idx} 0 R`)
    .join(" ");
  const xObjectResource =
    builder.images.length > 0 ? `/XObject << ${xObjectDictEntries} >>` : "";

  // Páginas e seus Content Streams
  builder.pages.forEach((page, idx) => {
    const pageObjId = firstPageObjId + idx * 2;
    const streamObjId = pageObjId + 1;

    startObj(pageObjId);
    pushStr(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmtNum(PAGE.WIDTH)} ${fmtNum(PAGE.HEIGHT)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R /F5 7 0 R /F6 8 0 R >> ${xObjectResource} >> /Contents ${streamObjId} 0 R >>\n`
    );
    endObj();

    const streamContent = page.commands.join("\n") + "\n";
    const streamBytes = encoder.encode(streamContent);
    startObj(streamObjId);
    pushStr(`<< /Length ${streamBytes.length} >>\nstream\n`);
    pushBytes(streamBytes);
    pushStr("endstream\n");
    endObj();
  });

  // Tabela XREF
  const xrefOffset = byteOffset;
  pushStr(`xref\n0 ${totalObjects + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (let id = 1; id <= totalObjects; id++) {
    const off = offsets[id].toString().padStart(10, "0");
    pushStr(`${off} 00000 n \n`);
  }

  // Trailer
  pushStr(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R /Info 9 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  // Concatena todos os chunks em um único Uint8Array
  const result = new Uint8Array(byteOffset);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}

/**
 * Gera o documento PDF completo em memória (Uint8Array)
 */
export async function exportToPdfUint8Array(note: PdfNoteInput): Promise<Uint8Array> {
  const builder = new PdfDocumentBuilder();
  const cleanTitle = (note.title || "Sem título").trim() || "Sem título";
  const formattedDate = formatDatePtBr(note.updatedAt);

  // 1. Data de edição no topo
  builder.drawTextSingle(
    formattedDate,
    PAGE.MARGIN_LEFT,
    builder.cursorY - 9,
    "F1",
    8.5,
    { r: 0.467, g: 0.463, b: 0.439 }
  );
  builder.cursorY -= 16;

  // 2. Título principal da nota (20pt Negrito com quebra automática de linha)
  const titleSpans: InlineSpan[] = [
    {
      text: cleanTitle,
      font: "F2",
      size: 20,
      color: { r: 0.067, g: 0.067, b: 0.067 },
    },
  ];
  const titleLines = wrapInlineSpans(titleSpans, CONTENT_WIDTH, 1.25);
  for (const tl of titleLines) {
    builder.ensureSpace(tl.height);
    builder.drawWrappedLine(tl, PAGE.MARGIN_LEFT, builder.cursorY - 20, CONTENT_WIDTH, "left");
    builder.cursorY -= tl.height;
  }
  builder.cursorY -= 10;

  // 3. Conteúdo principal (Nota de Código vs Nota Estruturada TipTap)
  if (note.type === "code") {
    await renderCodeBox(
      builder,
      note.body || note.bodyText || "",
      note.language || "plaintext",
      PAGE.MARGIN_LEFT,
      CONTENT_WIDTH
    );
  } else {
    let doc: JSONContent | null = null;
    try {
      const parsed = JSON.parse(note.body);
      if (parsed && parsed.type === "doc" && Array.isArray(parsed.content)) {
        doc = parsed as JSONContent;
      }
    } catch {
      doc = null;
    }

    if (doc && doc.content) {
      await renderBlocksToPdf(doc.content, builder, 0);
    } else {
      const rawText = note.bodyText || note.body || "";
      const fallbackBlocks: JSONContent[] = rawText.split(/\r?\n/).map((line) => ({
        type: "paragraph",
        content: line ? [{ type: "text", text: line }] : [],
      }));
      await renderBlocksToPdf(fallbackBlocks, builder, 0);
    }
  }

  // 4. Carimba o rodapé institucional em todas as páginas
  builder.stampFooters(cleanTitle, formattedDate);

  return assemblePdfBinary(builder, cleanTitle);
}

/**
 * Exporta a nota para string Base64 (para salvar via bridge nativo `ExportNoteFile`)
 */
export async function exportToPdfBase64(note: PdfNoteInput): Promise<string> {
  const bytes = await exportToPdfUint8Array(note);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return window.btoa(binary);
}

/**
 * Exporta a nota para Blob (fallback de download no navegador)
 */
export async function exportToPdfBlob(note: PdfNoteInput): Promise<Blob> {
  const bytes = await exportToPdfUint8Array(note);
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}


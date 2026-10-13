import { useState, useRef, useEffect, type FormEvent } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Check, X, Trash2, Edit3, Sparkles } from "lucide-react";
import katex from "katex";

// Simbolos matematicos e formulas pre-definidas para engenharia e ciencias exatas
export const MATH_SNIPPETS = {
  basic: [
    { label: "a/b", latex: "\\frac{a}{b}", desc: "Fração" },
    { label: "√x", latex: "\\sqrt{x}", desc: "Raiz quadrada" },
    { label: "ⁿ√x", latex: "\\sqrt[n]{x}", desc: "Raiz n-ésima" },
    { label: "x²", latex: "x^{2}", desc: "Expoente" },
    { label: "xᵢ", latex: "x_{i}", desc: "Subscrito" },
    { label: "±", latex: "\\pm", desc: "Mais ou menos" },
    { label: "×", latex: "\\times", desc: "Multiplicação" },
    { label: "·", latex: "\\cdot", desc: "Ponto" },
    { label: "≠", latex: "\\neq", desc: "Diferente" },
    { label: "≈", latex: "\\approx", desc: "Aproximado" },
    { label: "≤", latex: "\\le", desc: "Menor ou igual" },
    { label: "≥", latex: "\\ge", desc: "Maior ou igual" },
    { label: "∞", latex: "\\infty", desc: "Infinito" },
  ],
  calculus: [
    { label: "∫ dx", latex: "\\int_{a}^{b} f(x) \\, dx", desc: "Integral definida" },
    { label: "∬ dA", latex: "\\iint_D f(x, y) \\, dA", desc: "Integral dupla" },
    { label: "∑", latex: "\\sum_{i=1}^{n} x_i", desc: "Somatório" },
    { label: "∏", latex: "\\prod_{i=1}^{n} x_i", desc: "Produtório" },
    { label: "df/dx", latex: "\\frac{df}{dx}", desc: "Derivada simples" },
    { label: "∂f/∂x", latex: "\\frac{\\partial f}{\\partial x}", desc: "Derivada parcial" },
    { label: "lim", latex: "\\lim_{x \\to 0} f(x)", desc: "Limite" },
    { label: "v⃗", latex: "\\vec{v}", desc: "Vetor" },
    { label: "∇", latex: "\\nabla f", desc: "Gradiente" },
  ],
  greek: [
    { label: "α", latex: "\\alpha", desc: "Alfa" },
    { label: "β", latex: "\\beta", desc: "Beta" },
    { label: "γ", latex: "\\gamma", desc: "Gama" },
    { label: "δ", latex: "\\delta", desc: "Delta minúsculo" },
    { label: "Δ", latex: "\\Delta", desc: "Delta maiúsculo" },
    { label: "ε", latex: "\\varepsilon", desc: "Épsilon" },
    { label: "θ", latex: "\\theta", desc: "Teta" },
    { label: "λ", latex: "\\lambda", desc: "Lambda" },
    { label: "μ", latex: "\\mu", desc: "Micro / Mi" },
    { label: "π", latex: "\\pi", desc: "Pi" },
    { label: "ρ", latex: "\\rho", desc: "Rô (densidade/resistividade)" },
    { label: "σ", latex: "\\sigma", desc: "Sigma minúsculo (tensão/desvio)" },
    { label: "τ", latex: "\\tau", desc: "Tau (torque/cisalhamento)" },
    { label: "ω", latex: "\\omega", desc: "Ômega (frequência angular)" },
    { label: "Ω", latex: "\\Omega", desc: "Ohm / Ômega maiúsculo" },
  ],
  engineering: [
    { label: "Bhaskara", latex: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", desc: "Fórmula de Bhaskara" },
    { label: "Euler", latex: "e^{i\\pi} + 1 = 0", desc: "Identidade de Euler" },
    { label: "Lei de Ohm", latex: "V = R \\cdot I", desc: "Tensão e corrente" },
    { label: "Potência", latex: "P = V \\cdot I = R \\cdot I^2", desc: "Potência elétrica" },
    { label: "Matriz 2x2", latex: "\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}", desc: "Matriz colchetes" },
    { label: "Matriz 3x3", latex: "\\begin{bmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{bmatrix}", desc: "Matriz 3x3" },
    { label: "Eq. Gauss", latex: "\\oint \\vec{E} \\cdot d\\vec{A} = \\frac{Q_{enc}}{\\varepsilon_0}", desc: "Lei de Gauss" },
    { label: "Energia", latex: "E = m c^2", desc: "Massa-energia" },
  ],
};

// Funcao auxiliar para renderizar KaTeX com seguranca
export function renderKaTeXToString(latex: string, displayMode: boolean): { html: string; error: string | null } {
  const trimmed = latex.trim();
  if (!trimmed) {
    return {
      html: `<span class="math-placeholder">${displayMode ? "Fórmula matemática vazia" : "Fórmula vazia"}</span>`,
      error: null
    };
  }

  try {
    const html = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: true,
      output: "htmlAndMathml"
    });
    return { html, error: null };
  } catch (err) {
    // Fallback com aviso
    const fallbackHtml = katex.renderToString(trimmed, {
      displayMode,
      throwOnError: false,
      output: "htmlAndMathml"
    });
    const message = err instanceof Error ? err.message : "Erro na sintaxe LaTeX";
    return { html: fallbackHtml, error: message };
  }
}

interface MathEditModalProps {
  initialLatex: string;
  isBlock: boolean;
  onSave: (newLatex: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function MathEditModal({ initialLatex, isBlock, onSave, onCancel, onDelete }: MathEditModalProps) {
  const [latex, setLatex] = useState(initialLatex);
  const [activeTab, setActiveTab] = useState<keyof typeof MATH_SNIPPETS>("basic");
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

  const { html, error } = renderKaTeXToString(latex, isBlock);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const insertSnippet = (snippetLatex: string) => {
    if (!inputRef.current) {
      setLatex((prev) => prev + " " + snippetLatex);
      return;
    }

    const input = inputRef.current;
    const start = input.selectionStart ?? latex.length;
    const end = input.selectionEnd ?? latex.length;
    const nextVal = latex.slice(0, start) + snippetLatex + latex.slice(end);
    setLatex(nextVal);

    setTimeout(() => {
      input.focus();
      const nextPos = start + snippetLatex.length;
      input.setSelectionRange(nextPos, nextPos);
    }, 10);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!latex.trim()) {
      if (onDelete) onDelete();
      else onCancel();
      return;
    }
    onSave(latex.trim());
  };

  return (
    <div className="math-editor-card" onClick={(e) => e.stopPropagation()}>
      <div className="math-editor-header">
        <span className="math-editor-title">
          <Sparkles size={14} className="math-sparkle-icon" />
          {isBlock ? "Fórmula Matemática em Bloco (LaTeX)" : "Fórmula Matemática em Linha (LaTeX)"}
        </span>
        <button type="button" className="math-close-btn" onClick={onCancel} title="Fechar">
          <X size={14} />
        </button>
      </div>

      <div className="math-snippet-tabs">
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "basic" ? "active" : ""}`}
          onClick={() => setActiveTab("basic")}
        >
          Básico
        </button>
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "calculus" ? "active" : ""}`}
          onClick={() => setActiveTab("calculus")}
        >
          Cálculo & Física
        </button>
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "greek" ? "active" : ""}`}
          onClick={() => setActiveTab("greek")}
        >
          Letras Gregas
        </button>
        <button
          type="button"
          className={`math-tab-btn ${activeTab === "engineering" ? "active" : ""}`}
          onClick={() => setActiveTab("engineering")}
        >
          Modelos de Engenharia
        </button>
      </div>

      <div className="math-snippets-grid">
        {MATH_SNIPPETS[activeTab].map((s) => (
          <button
            key={s.label}
            type="button"
            className="math-snippet-chip"
            onClick={() => insertSnippet(s.latex)}
            title={`${s.desc} (${s.latex})`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="math-form">
        <label className="math-input-label">Código LaTeX:</label>
        {isBlock ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="math-textarea"
            rows={3}
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleSubmit(e);
              } else if (e.key === "Escape") {
                onCancel();
              }
            }}
            placeholder="Ex.: \int_a^b f(x) dx  ou  E = m c^2"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            className="math-input"
            type="text"
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSubmit(e);
              } else if (e.key === "Escape") {
                onCancel();
              }
            }}
            placeholder="Ex.: \frac{a}{b} ou \sqrt{x}"
          />
        )}

        {error && (
          <div className="math-error-banner" role="alert">
            {error}
          </div>
        )}

        <div className="math-preview-container">
          <span className="math-preview-label">Pré-visualização ao vivo:</span>
          <div
            className={`math-preview-render ${isBlock ? "block-mode" : "inline-mode"}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        <div className="math-actions-row">
          {onDelete && (
            <button type="button" className="math-btn-delete" onClick={onDelete} title="Remover fórmula">
              <Trash2 size={14} /> Excluir
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="math-btn-cancel" onClick={onCancel}>
            Cancelar
          </button>
          <button type="submit" className="math-btn-save">
            <Check size={14} /> Salvar Fórmula
          </button>
        </div>
      </form>
    </div>
  );
}

// -------------------------------------------------------------
// Componente de Visualização Inline
// -------------------------------------------------------------
function MathInlineView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const latex = (node.attrs.latex as string) || "";
  const { html } = renderKaTeXToString(latex, false);

  return (
    <NodeViewWrapper as="span" className={`math-inline-wrapper ${selected ? "selected" : ""}`}>
      {editing ? (
        <span className="math-popover-container inline-popover">
          <MathEditModal
            initialLatex={latex}
            isBlock={false}
            onSave={(newLatex) => {
              updateAttributes({ latex: newLatex });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
            onDelete={deleteNode}
          />
        </span>
      ) : (
        <span
          className="math-inline-content"
          data-math-inline=""
          data-latex={latex}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title="Fórmula matemática inline (Duplo clique para editar)"
        >
          <span dangerouslySetInnerHTML={{ __html: html }} />
          <button
            type="button"
            className="math-quick-edit-btn"
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            title="Editar fórmula matemática"
          >
            <Edit3 size={11} />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}

// -------------------------------------------------------------
// Componente de Visualização em Bloco
// -------------------------------------------------------------
function MathBlockView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const latex = (node.attrs.latex as string) || "";
  const { html } = renderKaTeXToString(latex, true);

  return (
    <NodeViewWrapper as="div" className={`math-block-wrapper ${selected ? "selected" : ""}`}>
      {editing ? (
        <div className="math-popover-container block-popover">
          <MathEditModal
            initialLatex={latex}
            isBlock={true}
            onSave={(newLatex) => {
              updateAttributes({ latex: newLatex });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
            onDelete={deleteNode}
          />
        </div>
      ) : (
        <div
          className="math-block-content"
          data-math-block=""
          data-latex={latex}
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          title="Fórmula matemática em bloco (Duplo clique para editar)"
        >
          <div className="math-block-render" dangerouslySetInnerHTML={{ __html: html }} />
          <div className="math-block-actions">
            <button
              type="button"
              className="math-block-btn"
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              title="Editar fórmula LaTeX"
            >
              <Edit3 size={13} /> Editar
            </button>
            <button
              type="button"
              className="math-block-btn delete"
              onClick={(e) => {
                e.stopPropagation();
                deleteNode();
              }}
              title="Excluir fórmula"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

// -------------------------------------------------------------
// TipTap Node: MathInlineNode
// -------------------------------------------------------------
export const MathInlineNode = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "x",
        parseHTML: (element) => element.getAttribute("data-latex") || element.textContent || "",
        renderHTML: (attributes) => ({
          "data-latex": attributes.latex,
          "data-math-inline": ""
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-math-inline]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-math-inline": "" }),
      `$${HTMLAttributes.latex || ""}$`
    ];
  },

  renderText({ node }) {
    return `$${node.attrs.latex || ""}$`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  }
});

// -------------------------------------------------------------
// TipTap Node: MathBlockNode
// -------------------------------------------------------------
export const MathBlockNode = Node.create({
  name: "mathBlock",
  group: "block",
  inline: false,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "E = m c^2",
        parseHTML: (element) => element.getAttribute("data-latex") || element.textContent || "",
        renderHTML: (attributes) => ({
          "data-latex": attributes.latex,
          "data-math-block": ""
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-math-block]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-math-block": "" }),
      `$$${HTMLAttributes.latex || ""}$$`
    ];
  },

  renderText({ node }) {
    return `$$${node.attrs.latex || ""}$$`;
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  }
});

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { ChevronRight, Eye, EyeOff, Trash2, HelpCircle } from "lucide-react";
import katex from "katex";
import "katex/contrib/mhchem";

// Renderizador auxiliar de formulas KaTeX no titulo da pergunta
function renderTitleWithMath(text: string) {
  if (!text) return null;
  // Divide por delimitadores de matematica $...$
  const parts = text.split(/(\$[^\$\r\n]+\$)/g);
  return parts.map((part, index) => {
    if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
      const latex = part.slice(1, -1);
      try {
        const html = katex.renderToString(latex, { throwOnError: false, displayMode: false });
        return <span key={index} dangerouslySetInnerHTML={{ __html: html }} />;
      } catch {
        return <span key={index}>{part}</span>;
      }
    }
    return <span key={index}>{part}</span>;
  });
}

function ToggleView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const isOpen = Boolean(node.attrs.open);
  const title = (node.attrs.title as string) || "";
  const [isEditingTitle, setIsEditingTitle] = useState(!title);
  const [titleInput, setTitleInput] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleInput(title);
  }, [title]);

  useEffect(() => {
    if (isEditingTitle) {
      inputRef.current?.focus();
    }
  }, [isEditingTitle]);

  const toggleOpen = () => {
    updateAttributes({ open: !isOpen });
  };

  const handleTitleBlur = () => {
    const trimmed = titleInput.trim();
    updateAttributes({ title: trimmed });
    if (trimmed) {
      setIsEditingTitle(false);
    }
  };

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTitleBlur();
    }
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`study-toggle-wrapper ${isOpen ? "open" : "collapsed"} ${selected ? "selected" : ""}`}
      data-toggle=""
      data-title={title}
      data-open={isOpen ? "true" : "false"}
    >
      <div className="study-toggle-header" contentEditable={false}>
        <button
          type="button"
          className="study-toggle-chevron-btn"
          onClick={toggleOpen}
          title={isOpen ? "Recolher resposta (ocultar para auto-teste)" : "Expandir resposta"}
        >
          <ChevronRight size={16} className={`study-toggle-chevron ${isOpen ? "rotate-open" : ""}`} />
        </button>

        <div className="study-toggle-title-container">
          {isEditingTitle ? (
            <input
              ref={inputRef}
              type="text"
              className="study-toggle-title-input"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={handleTitleKeyDown}
              placeholder="Pergunta ou tópico (ex: Qual a Lei de Gauss? ou $\int e^x dx$)"
            />
          ) : (
            <div
              className="study-toggle-title-rendered"
              onClick={() => setIsEditingTitle(true)}
              title="Clique para editar o título ou pergunta"
            >
              <HelpCircle size={14} className="study-toggle-help-icon" />
              <span className="study-toggle-title-text">
                {renderTitleWithMath(title) || <span className="study-toggle-placeholder">Sem título (clique para editar)</span>}
              </span>
            </div>
          )}
        </div>

        <div className="study-toggle-actions">
          <button
            type="button"
            className="study-toggle-peek-btn"
            onClick={toggleOpen}
            title={isOpen ? "Ocultar para estudo ativo" : "Revelar resposta"}
          >
            {isOpen ? <EyeOff size={13} /> : <Eye size={13} />}
            <span className="study-toggle-peek-label">{isOpen ? "Ocultar" : "Revelar"}</span>
          </button>

          <button
            type="button"
            className="study-toggle-delete-btn"
            onClick={deleteNode}
            title="Excluir bloco expansível"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div
        className="study-toggle-body"
        style={{ display: isOpen ? "block" : "none" }}
      >
        <NodeViewContent className="study-toggle-content-editable" />
      </div>
    </NodeViewWrapper>
  );
}

export const ToggleNode = Node.create({
  name: "toggle",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,

  addAttributes() {
    return {
      title: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-title") || el.querySelector("summary")?.textContent || "",
        renderHTML: (attrs) => ({
          "data-title": attrs.title || "",
          "data-toggle": ""
        })
      },
      open: {
        default: true,
        parseHTML: (el) => el.hasAttribute("open") || el.getAttribute("data-open") === "true",
        renderHTML: (attrs) => (attrs.open ? { open: "", "data-open": "true" } : { "data-open": "false" })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "details[data-toggle]"
      },
      {
        tag: "details"
      },
      {
        tag: "div[data-toggle]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "details",
      mergeAttributes(HTMLAttributes, { "data-toggle": "" }),
      ["summary", HTMLAttributes["data-title"] || "Pergunta / Tópico"],
      ["div", { class: "study-toggle-content" }, 0]
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ToggleView);
  }
});

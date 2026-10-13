import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import {
  Workflow,
  Code2,
  Eye,
  Copy,
  Check,
  Trash2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  AlertCircle,
  Sparkles
} from "lucide-react";
import mermaid from "mermaid";

export const MERMAID_TEMPLATES = [
  {
    id: "flowchart",
    label: "Fluxograma de Engenharia",
    icon: "⚙️",
    code: `flowchart TD
    Inicio([Início]) --> Sensores[/Leitura de Sensores/]
    Sensores --> Processamento[Filtragem de Ruído]
    Processamento --> Decisao{Sinal > Limiar?}
    Decisao -->|Sim| Atuador[Acionar Relé / Atuador]
    Decisao -->|Não| Espera[Aguardar Próximo Ciclo]
    Atuador --> Fim([Fim])
    Espera --> Sensores`
  },
  {
    id: "krebs",
    label: "Ciclo Bioquímico (Krebs)",
    icon: "🔬",
    code: `graph TD
    Glicose[Glicose C6H12O6] --> Piruvato[2x Piruvato C3]
    Piruvato --> Acetil[Acetil-CoA C2]
    Acetil --> Krebs((Ciclo de Krebs))
    Krebs --> Coenzimas[NADH + FADH2]
    Coenzimas --> Cadeia[Cadeia Respiratória]
    Cadeia --> ATP([30-32 ATP + H2O])`
  },
  {
    id: "homeostasis",
    label: "Feedback Fisiológico",
    icon: "🩺",
    code: `graph LR
    Estimulo[Estímulo: Hiperglicemia] --> Sensor[Sensor: Células Beta Pancreáticas]
    Sensor --> Hormonio[Secreção de Insulina]
    Hormonio --> Efetor[Captação Hepática e Muscular de Glicose]
    Efetor --> Resposta[Glicemia Normalizada]
    Resposta -.->|Feedback Negativo| Estimulo`
  },
  {
    id: "sequence",
    label: "Diagrama de Sequência",
    icon: "🔄",
    code: `sequenceDiagram
    autonumber
    actor Aluno as Usuário
    participant App as Magnetares Notes
    participant DB as SQLite Local
    Aluno->>App: Criar Diagrama Mermaid
    App->>DB: Salvar nota (WAL)
    DB-->>App: Confirmação gravada
    App-->>Aluno: Renderizar SVG instantâneo`
  },
  {
    id: "state",
    label: "Máquina de Estados",
    icon: "⚡",
    code: `stateDiagram-v2
    [*] --> Standby
    Standby --> Operando: Sinal de Partida
    Operando --> Alarme: Sensor Crítico
    Alarme --> Standby: Reset Manual
    Operando --> Concluido: Fim do Ciclo
    Concluido --> [*]`
  },
  {
    id: "mindmap",
    label: "Mapa Mental (Fisiologia)",
    icon: "🧬",
    code: `mindmap
  root((Fisiologia Renal))
    Néfron
      Glomérulo
      Túbulo Contorcido
      Alça de Henle
      Duto Coletor
    Funções Vitais
      Filtração Glomerular
      Reabsorção de Água
      Excreção
    Regulação
      Sistema RAA
      Hormônio ADH`
  },
  {
    id: "er",
    label: "Entidade-Relacionamento",
    icon: "🗄️",
    code: `erDiagram
    PACIENTE ||--o{ CONSULTA : realiza
    MEDICO ||--o{ CONSULTA : atende
    CONSULTA ||--|{ EXAME : solicita
    PACIENTE {
        int id
        string nome
        string prontuario
    }`
  }
];

function MermaidView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const initialCode = (node.attrs.code as string) || MERMAID_TEMPLATES[0].code;
  const initialCaption = (node.attrs.caption as string) || "";

  const [code, setCode] = useState(initialCode);
  const [caption, setCaption] = useState(initialCaption);
  const [isEditing, setIsEditing] = useState(false);
  const [svgHtml, setSvgHtml] = useState<string>("");
  const [renderError, setRenderError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [copied, setCopied] = useState(false);
  const [isEditingCaption, setIsEditingCaption] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sincroniza estado com o nó TipTap quando attrs mudam externamente
  useEffect(() => {
    if (node.attrs.code !== code) {
      setCode(node.attrs.code || "");
    }
    if (node.attrs.caption !== caption) {
      setCaption(node.attrs.caption || "");
    }
  }, [node.attrs.code, node.attrs.caption]);

  // Função de renderização assíncrona do SVG Mermaid
  const renderDiagram = useCallback(async (mermaidCode: string) => {
    if (!mermaidCode.trim()) {
      setSvgHtml("");
      setRenderError("Código Mermaid vazio.");
      return;
    }

    const renderId = `mermaid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      const isDark =
        document.documentElement.getAttribute("data-theme") === "dark" ||
        document.body.getAttribute("data-theme") === "dark";

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "inherit",
        theme: isDark ? "dark" : "neutral",
        themeVariables: isDark
          ? {
              darkMode: true,
              background: "#1c1b18",
              primaryColor: "#2a2924",
              primaryTextColor: "#f5f5f4",
              primaryBorderColor: "#d19a13",
              lineColor: "#a8a29e",
              secondaryColor: "#23221e",
              tertiaryColor: "#1c1b18"
            }
          : {
              darkMode: false,
              background: "#ffffff",
              primaryColor: "#fef8e7",
              primaryTextColor: "#1c1b18",
              primaryBorderColor: "#d19a13",
              lineColor: "#78716c",
              secondaryColor: "#faf9f6",
              tertiaryColor: "#ffffff"
            }
      });

      const { svg } = await mermaid.render(renderId, mermaidCode);
      setSvgHtml(svg);
      setRenderError(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro de sintaxe no diagrama Mermaid.";
      setRenderError(message);

      // Limpeza de divs de erro remanescentes que o Mermaid possa ter anexado ao DOM
      const strayElements = document.querySelectorAll(`[id*="${renderId}"]`);
      strayElements.forEach((el) => el.remove());
    }
  }, []);

  // Re-renderiza o SVG sempre que o código ou o tema mudar
  useEffect(() => {
    renderDiagram(code);
  }, [code, renderDiagram]);

  // Observer para re-renderizar quando o tema da aplicação alternar
  useEffect(() => {
    const observer = new MutationObserver(() => {
      renderDiagram(code);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, [code, renderDiagram]);

  const handleApplyCode = (newCode: string) => {
    setCode(newCode);
    updateAttributes({ code: newCode });
  };

  const handleSaveAndCloseEdit = () => {
    updateAttributes({ code, caption });
    setIsEditing(false);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Permite indentação com Tab no código Mermaid
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const nextValue = code.substring(0, start) + "  " + code.substring(end);
      handleApplyCode(nextValue);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  return (
    <NodeViewWrapper
      as="div"
      className={`mermaid-node-wrapper ${selected ? "selected" : ""}`}
      data-mermaid=""
      data-code={code}
      data-caption={caption}
    >
      {/* Barra de Ferramentas Superior do Diagrama */}
      <div className="mermaid-node-header" contentEditable={false}>
        <div className="mermaid-header-title">
          <Workflow size={15} className="mermaid-icon" />
          <span className="mermaid-badge">Diagrama Mermaid</span>
        </div>

        <div className="mermaid-header-actions">
          {/* Alternar Visualizar / Editar Código */}
          <button
            type="button"
            className={`mermaid-tool-btn ${isEditing ? "active" : ""}`}
            onClick={() => {
              if (isEditing) {
                handleSaveAndCloseEdit();
              } else {
                setIsEditing(true);
                setTimeout(() => textareaRef.current?.focus(), 50);
              }
            }}
            title={isEditing ? "Visualizar diagrama renderizado" : "Editar código Mermaid"}
          >
            {isEditing ? <Eye size={13} /> : <Code2 size={13} />}
            <span>{isEditing ? "Visualizar" : "Editar Código"}</span>
          </button>

          {/* Copiar Código */}
          <button
            type="button"
            className="mermaid-tool-btn"
            onClick={handleCopy}
            title="Copiar código Mermaid para a área de transferência"
          >
            {copied ? <Check size={13} className="text-emerald" /> : <Copy size={13} />}
            <span>{copied ? "Copiado!" : "Copiar"}</span>
          </button>

          {!isEditing && (
            <>
              {/* Controles de Zoom do Diagrama */}
              <div className="mermaid-zoom-controls">
                <button
                  type="button"
                  className="mermaid-icon-btn"
                  onClick={() => setZoom((z) => Math.max(50, z - 15))}
                  title="Diminuir zoom"
                >
                  <ZoomOut size={13} />
                </button>
                <span className="mermaid-zoom-label">{zoom}%</span>
                <button
                  type="button"
                  className="mermaid-icon-btn"
                  onClick={() => setZoom((z) => Math.min(200, z + 15))}
                  title="Aumentar zoom"
                >
                  <ZoomIn size={13} />
                </button>
                {zoom !== 100 && (
                  <button
                    type="button"
                    className="mermaid-icon-btn"
                    onClick={() => setZoom(100)}
                    title="Restaurar tamanho original"
                  >
                    <RotateCcw size={12} />
                  </button>
                )}
              </div>
            </>
          )}

          {/* Excluir Diagrama */}
          <button
            type="button"
            className="mermaid-delete-btn"
            onClick={deleteNode}
            title="Remover diagrama"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Modo de Edição de Código com Templates */}
      {isEditing ? (
        <div className="mermaid-editor-panel" contentEditable={false}>
          {/* Chips de Templates Prontos */}
          <div className="mermaid-templates-bar">
            <span className="mermaid-templates-title">
              <Sparkles size={12} /> Modelos Prontos:
            </span>
            <div className="mermaid-templates-chips">
              {MERMAID_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.id}
                  type="button"
                  className="mermaid-template-chip"
                  onClick={() => handleApplyCode(tmpl.code)}
                  title={`Inserir modelo: ${tmpl.label}`}
                >
                  <span>{tmpl.icon}</span>
                  <span>{tmpl.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Área de Digitação do Código */}
          <textarea
            ref={textareaRef}
            className="mermaid-code-textarea"
            value={code}
            onChange={(e) => handleApplyCode(e.target.value)}
            onKeyDown={handleTextareaKeyDown}
            placeholder="Digite seu código Mermaid aqui..."
            spellCheck={false}
            rows={10}
          />

          {/* Alerta de Erro de Sintaxe em Tempo Real */}
          {renderError && (
            <div className="mermaid-error-bar">
              <AlertCircle size={14} className="mermaid-error-icon" />
              <span className="mermaid-error-text">
                Erro de sintaxe Mermaid: {renderError}
              </span>
            </div>
          )}

          {/* Campo de Legenda / Título da Figura */}
          <div className="mermaid-caption-input-row">
            <label className="mermaid-caption-label">Legenda da Figura:</label>
            <input
              type="text"
              className="mermaid-caption-input"
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value);
                updateAttributes({ caption: e.target.value });
              }}
              placeholder="Ex: Figura 1: Fluxograma de Controle ou Ciclo Celular (opcional)"
            />
          </div>

          <div className="mermaid-editor-footer">
            <span className="mermaid-editor-hint">
              Dica: Tab para indentar • Use duplo clique no diagrama para voltar a editar
            </span>
            <button
              type="button"
              className="mermaid-apply-btn"
              onClick={handleSaveAndCloseEdit}
            >
              Concluir & Renderizar
            </button>
          </div>
        </div>
      ) : (
        /* Visualização do SVG Renderizado */
        <div
          ref={containerRef}
          className="mermaid-preview-container"
          onDoubleClick={() => setIsEditing(true)}
          title="Duplo clique para editar o código do diagrama"
          contentEditable={false}
        >
          {renderError ? (
            <div className="mermaid-error-box">
              <AlertCircle size={18} className="mermaid-error-icon" />
              <div>
                <strong>Erro ao processar diagrama:</strong>
                <p>{renderError}</p>
                <button
                  type="button"
                  className="mermaid-fix-btn"
                  onClick={() => setIsEditing(true)}
                >
                  Corrigir código Mermaid
                </button>
              </div>
            </div>
          ) : (
            <div
              className="mermaid-svg-wrapper"
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: "center top"
              }}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          )}

          {/* Exibição da Legenda */}
          {caption ? (
            <div className="mermaid-caption-rendered">
              {caption}
            </div>
          ) : isEditingCaption ? (
            <input
              type="text"
              className="mermaid-caption-inline-input"
              value={caption}
              autoFocus
              onChange={(e) => {
                setCaption(e.target.value);
                updateAttributes({ caption: e.target.value });
              }}
              onBlur={() => setIsEditingCaption(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setIsEditingCaption(false);
              }}
              placeholder="Legenda da figura (opcional)"
            />
          ) : null}
        </div>
      )}
    </NodeViewWrapper>
  );
}

export const MermaidNode = Node.create({
  name: "mermaid",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      code: {
        default: MERMAID_TEMPLATES[0].code,
        parseHTML: (el) => {
          return el.getAttribute("data-code") || el.textContent || MERMAID_TEMPLATES[0].code;
        },
        renderHTML: (attrs) => ({
          "data-mermaid": "",
          "data-code": attrs.code || ""
        })
      },
      caption: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-caption") || "",
        renderHTML: (attrs) => ({
          "data-caption": attrs.caption || ""
        })
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-mermaid]"
      },
      {
        tag: "pre.mermaid",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return { code: el.textContent || "" };
        }
      },
      {
        tag: "pre > code.language-mermaid",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return { code: el.textContent || "" };
        }
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-mermaid": "" }),
      HTMLAttributes["data-code"] || ""
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MermaidView);
  }
});

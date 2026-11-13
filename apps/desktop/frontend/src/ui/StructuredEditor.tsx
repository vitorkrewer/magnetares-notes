import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import { Bold, Calculator, Code2, Columns3, FileText, Highlighter, Italic, Link2, List as BulletList, ListChecks, ListOrdered, Network, Quote, Redo2, Rows3, Table2, Trash2, Undo2, Unlink, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette, Space, Sigma, BookmarkCheck, ListCollapse, ChevronsUpDown, Workflow } from "lucide-react";
import { calculateExpression } from "./CalculationNode";
import { MATH_SNIPPETS, renderKaTeXToString } from "./MathNodes";
import { MERMAID_TEMPLATES } from "./MermaidNode";
import { editorExtensions } from "./editorExtensions";
import { CustomSelect } from "./CustomSelect";
import type { NoteLinkMeta, NoteLinkStorage } from "./NoteLinkNode";

const PRESET_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"
];

type StructuredEditorProps = {
  value: string;
  readOnly: boolean;
  onChange: (document: string, text: string) => void;
  onBlur: () => void;
  currentNoteId?: string;
  availableNotes?: NoteLinkMeta[];
  onOpenLinkedNote?: (noteId: string, title: string, openSeparateWindow: boolean) => void;
  onOpenConnectionsPanel?: () => void;
};

type ToolButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

const codeLanguages = [
  { id: "plaintext", label: "Texto simples" },
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "go", label: "Go" },
  { id: "python", label: "Python" },
  { id: "json", label: "JSON" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "markdown", label: "Markdown" },
] as const;

const emptyDocument: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

function parseDocument(value: string): JSONContent {
  if (!value.trim()) return emptyDocument;
  try {
    const parsed = JSON.parse(value) as JSONContent;
    if (parsed.type === "doc") return parsed;
  } catch {
    // Plain-text notes are converted on their first edit.
  }

  return {
    type: "doc",
    content: value.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined
    }))
  };
}

function ToolButton({ label, active = false, disabled = false, onClick, children }: ToolButtonProps) {
  return (
    <button type="button" className={`format-button ${active ? "active" : ""}`} onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={active} title={label}>
      {children}
    </button>
  );
}

function FormattingToolbar({
  editor,
  availableNotes,
  onOpenConnectionsPanel,
}: {
  editor: Editor;
  availableNotes: NoteLinkMeta[];
  onOpenConnectionsPanel?: () => void;
}) {
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [calculationExpression, setCalculationExpression] = useState("");
  const [calculationError, setCalculationError] = useState("");
  const [mathOpen, setMathOpen] = useState(false);
  const [mathLatex, setMathLatex] = useState("");
  const [mathIsBlock, setMathIsBlock] = useState(false);
  const [mathSnippetTab, setMathSnippetTab] = useState<keyof typeof MATH_SNIPPETS>("basic");
  const mathInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkURL, setLinkURL] = useState("");
  const [linkError, setLinkError] = useState("");
  const [noteLinkOpen, setNoteLinkOpen] = useState(false);
  const [noteLinkFilter, setNoteLinkFilter] = useState("");
  const [colorOpen, setColorOpen] = useState(false);
  const [lineHeightOpen, setLineHeightOpen] = useState(false);
  const insideTable = editor.isActive("table");
  const insideCodeBlock = editor.isActive("codeBlock");
  const codeLanguage = editor.getAttributes("codeBlock").language || "plaintext";
  const headingLevel = editor.isActive("heading", { level: 1 })
    ? "1"
    : editor.isActive("heading", { level: 2 }) ? "2" : "paragraph";

  const setBlockStyle = (value: string) => {
    if (value === "paragraph") {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 }).run();
  };

  const insertCalculation = (event: FormEvent) => {
    event.preventDefault();
    try {
      const calculation = calculateExpression(calculationExpression);
      editor.chain().focus().insertContent([
        { type: "calculation", attrs: calculation },
        { type: "text", text: " " }
      ]).run();
      setCalculationExpression("");
      setCalculationError("");
      setCalculationOpen(false);
    } catch (calculationIssue) {
      setCalculationError(calculationIssue instanceof Error ? calculationIssue.message : "Expressão inválida.");
    }
  };

  const insertMath = (event: FormEvent) => {
    event.preventDefault();
    const cleanLatex = mathLatex.trim();
    if (!cleanLatex) {
      setMathOpen(false);
      return;
    }
    if (mathIsBlock) {
      editor.chain().focus().insertContent({ type: "mathBlock", attrs: { latex: cleanLatex } }).run();
    } else {
      editor.chain().focus().insertContent([
        { type: "mathInline", attrs: { latex: cleanLatex } },
        { type: "text", text: " " }
      ]).run();
    }
    setMathLatex("");
    setMathOpen(false);
  };

  const openMathEditor = () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    setMathLatex(selectedText || "");
    setMathOpen((open) => !open);
    setCalculationOpen(false);
    setLinkOpen(false);
    setColorOpen(false);
    setLineHeightOpen(false);
  };

  const insertToolbarMathSnippet = (snippet: string) => {
    const input = mathInputRef.current;
    if (!input) {
      setMathLatex((prev) => (prev ? prev + " " + snippet : snippet));
      return;
    }
    const start = input.selectionStart ?? mathLatex.length;
    const end = input.selectionEnd ?? mathLatex.length;
    const nextVal = mathLatex.slice(0, start) + snippet + mathLatex.slice(end);
    setMathLatex(nextVal);
    setTimeout(() => {
      input.focus();
      const pos = start + snippet.length;
      input.setSelectionRange(pos, pos);
    }, 10);
  };

  const insertToggle = () => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, " ");
    editor
      .chain()
      .focus()
      .insertContent({
        type: "toggle",
        attrs: { title: selectedText || "", open: true },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Escreva aqui a resposta ou dedução detalhada..." }]
          }
        ]
      })
      .run();
  };

  const toggleAllToggles = () => {
    let anyOpen = false;
    editor.state.doc.descendants((node) => {
      if (node.type.name === "toggle" && node.attrs.open) {
        anyOpen = true;
      }
    });

    const targetState = !anyOpen;
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "toggle") {
        editor.commands.command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: targetState });
          return true;
        });
      }
    });
  };

  const insertMermaid = () => {
    editor
      .chain()
      .focus()
      .insertContent({
        type: "mermaid",
        attrs: {
          code: MERMAID_TEMPLATES[0].code,
          caption: ""
        }
      })
      .run();
  };

  const submitLink = (event: FormEvent) => {
    event.preventDefault();
    const value = linkURL.trim();
    if (!value) {
      editor.chain().focus().unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!/^https?:\/\//i.test(value)) {
      setLinkError("Use uma URL iniciando com http:// ou https://.");
      return;
    }
    editor.chain().focus().setLink({ href: value }).run();
    setLinkError("");
    setLinkOpen(false);
  };

  const openLinkEditor = () => {
    setLinkURL(editor.getAttributes("link").href || "");
    setLinkError("");
    setLinkOpen((open) => !open);
  };

  return (
    <>
      <div className="format-toolbar" role="toolbar" aria-label="Formatação da nota">
      <CustomSelect
        compact
        className="toolbar-style-select"
        value={headingLevel}
        options={[
          { value: "paragraph", label: "Corpo" },
          { value: "1", label: "Título" },
          { value: "2", label: "Subtítulo" },
        ]}
        onChange={setBlockStyle}
        ariaLabel="Estilo do texto"
        title="Estilo do texto"
      />
      <span className="toolbar-separator" />
      <ToolButton label="Desfazer" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}><Undo2 aria-hidden="true" /></ToolButton>
      <ToolButton label="Refazer" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}><Redo2 aria-hidden="true" /></ToolButton>
      <span className="toolbar-separator" />
      <ToolButton label="Negrito" active={editor.isActive("bold")} disabled={!editor.can().chain().focus().toggleBold().run()} onClick={() => editor.chain().focus().toggleBold().run()}><Bold aria-hidden="true" /></ToolButton>
      <ToolButton label="Itálico" active={editor.isActive("italic")} disabled={!editor.can().chain().focus().toggleItalic().run()} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic aria-hidden="true" /></ToolButton>
      <ToolButton label="Destaque" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter aria-hidden="true" /></ToolButton>
      <div style={{ position: "relative", display: "inline-block" }}>
        <ToolButton label="Cor do texto" active={colorOpen} onClick={() => { setColorOpen(!colorOpen); setLineHeightOpen(false); setLinkOpen(false); setCalculationOpen(false); }}>
          <Palette aria-hidden="true" />
        </ToolButton>
        {colorOpen && (
          <div className="color-popover" style={{ position: "absolute", top: "100%", left: 0, marginTop: "4px", display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: "4px", padding: "8px", background: "var(--paper)", border: "1px solid #d8d5cc", borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100 }}>
            {PRESET_COLORS.map(color => (
              <button
                key={color}
                type="button"
                title={color}
                style={{
                  width: "18px", height: "18px", borderRadius: "50%", backgroundColor: color,
                  border: "1px solid #d8d5cc", cursor: "pointer", padding: 0
                }}
                onClick={() => {
                  editor.chain().focus().setColor(color).run();
                  setColorOpen(false);
                }}
              />
            ))}
            <button type="button" onClick={() => { editor.chain().focus().unsetColor().run(); setColorOpen(false); }} style={{ gridColumn: "span 10", marginTop: "4px", background: "transparent", border: "1px solid #d8d5cc", borderRadius: "4px", padding: "4px", cursor: "pointer", fontSize: "11px", color: "inherit" }}>Automático (Remover cor)</button>
          </div>
        )}
      </div>
      <span className="toolbar-separator" />
      <ToolButton label="Alinhar à esquerda" active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()}><AlignLeft aria-hidden="true" /></ToolButton>
      <ToolButton label="Centralizar" active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()}><AlignCenter aria-hidden="true" /></ToolButton>
      <ToolButton label="Alinhar à direita" active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()}><AlignRight aria-hidden="true" /></ToolButton>
      <ToolButton label="Justificar" active={editor.isActive({ textAlign: "justify" })} onClick={() => editor.chain().focus().setTextAlign("justify").run()}><AlignJustify aria-hidden="true" /></ToolButton>
      <div style={{ position: "relative", display: "inline-block" }}>
        <ToolButton label="Espaçamento entre linhas" active={lineHeightOpen} onClick={() => { setLineHeightOpen(!lineHeightOpen); setColorOpen(false); setLinkOpen(false); setCalculationOpen(false); }}>
          <Space aria-hidden="true" style={{ width: 16 }} />
        </ToolButton>
        {lineHeightOpen && (
          <div className="link-popover" style={{ position: "absolute", top: "100%", left: 0, marginTop: "4px", display: "flex", flexDirection: "column", padding: "4px", background: "var(--paper)", border: "1px solid #d8d5cc", borderRadius: "6px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 100, minWidth: "120px" }}>
            {[
              { label: "Simples (1.0)", value: "1" },
              { label: "1,15", value: "1.15" },
              { label: "1,5", value: "1.5" },
              { label: "Duplo (2.0)", value: "2" },
            ].map(opt => (
              <button 
                key={opt.value} 
                type="button" 
                style={{ textAlign: "left", padding: "6px 12px", background: editor.getAttributes("paragraph").lineHeight === opt.value ? "#f0efe9" : "transparent", border: "none", cursor: "pointer", borderRadius: "4px", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "inherit" }}
                onClick={() => { editor.chain().focus().setLineHeight(opt.value).run(); setLineHeightOpen(false); }}
              >
                {opt.label}
                {editor.getAttributes("paragraph").lineHeight === opt.value && <span style={{ color: "inherit", fontWeight: "bold" }}>✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="toolbar-separator" />
      <ToolButton label="Bloco de código" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 aria-hidden="true" /></ToolButton>
      {insideCodeBlock && (
        <CustomSelect
          compact
          className="code-language-select"
          ariaLabel="Linguagem do bloco de código"
          title="Linguagem do bloco de código"
          value={codeLanguage}
          options={codeLanguages.map((language) => ({ value: language.id, label: language.label }))}
          onChange={(val) => editor.chain().focus().updateAttributes("codeBlock", { language: val }).run()}
        />
      )}
      <ToolButton label="Inserir ou editar link" active={editor.isActive("link") || linkOpen} onClick={openLinkEditor}><Link2 aria-hidden="true" /></ToolButton>
      {editor.isActive("link") && <ToolButton label="Remover link" onClick={() => editor.chain().focus().unsetLink().run()}><Unlink aria-hidden="true" /></ToolButton>}
      <ToolButton
        label="Vincular nota ou abrir painel de vínculos (ou digite [[)"
        active={noteLinkOpen}
        onClick={() => {
          if (onOpenConnectionsPanel) {
            onOpenConnectionsPanel();
            return;
          }
          setNoteLinkFilter("");
          setNoteLinkOpen((open) => !open);
          setLinkOpen(false);
          setMathOpen(false);
          setCalculationOpen(false);
        }}
      >
        <Network aria-hidden="true" />
      </ToolButton>
      <span className="toolbar-separator" />
      <ToolButton label="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><BulletList aria-hidden="true" /></ToolButton>
      <ToolButton label="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered aria-hidden="true" /></ToolButton>
      <ToolButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks aria-hidden="true" /></ToolButton>
      <ToolButton label="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote aria-hidden="true" /></ToolButton>
      <ToolButton label="Destaque acadêmico (Teorema, Experimento, Alerta)" active={editor.isActive("callout")} onClick={() => editor.chain().focus().insertContent({ type: "callout", attrs: { type: "info" }, content: [{ type: "paragraph", content: [{ type: "text", text: "Escreva aqui sua observação, teorema ou anotação acadêmica..." }] }] }).run()}><BookmarkCheck aria-hidden="true" /></ToolButton>
      <ToolButton label="Bloco expansível / Toggle (Estudo Ativo)" active={editor.isActive("toggle")} onClick={insertToggle}><ListCollapse aria-hidden="true" /></ToolButton>
      <ToolButton label="Modo Auto-teste (Ocultar/Revelar todas as respostas)" onClick={toggleAllToggles}><ChevronsUpDown aria-hidden="true" /></ToolButton>
      <span className="toolbar-separator" />
      <ToolButton label="Inserir cálculo" active={editor.isActive("calculation") || calculationOpen} onClick={() => setCalculationOpen((open) => !open)}><Calculator aria-hidden="true" /></ToolButton>
      <ToolButton label="Fórmula matemática (LaTeX)" active={editor.isActive("mathInline") || editor.isActive("mathBlock") || mathOpen} onClick={openMathEditor}><Sigma aria-hidden="true" /></ToolButton>
      <ToolButton label="Diagrama Mermaid (Fluxogramas, Ciclos, Sequência)" active={editor.isActive("mermaid")} onClick={insertMermaid}><Workflow aria-hidden="true" /></ToolButton>
      <ToolButton label="Inserir tabela" active={insideTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 aria-hidden="true" /></ToolButton>
      {insideTable && <ToolButton label="Adicionar linha" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Adicionar coluna" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Excluir linha" onClick={() => editor.chain().focus().deleteRow().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Excluir coluna" onClick={() => editor.chain().focus().deleteColumn().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Excluir tabela" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      </div>
      {mathOpen && (
        <form className="calculation-popover math-toolbar-popover" onSubmit={insertMath}>
          <div className="math-popover-mode-switch">
            <button
              type="button"
              className={`mode-btn ${!mathIsBlock ? "active" : ""}`}
              onClick={() => setMathIsBlock(false)}
            >
              Em Linha ($...$)
            </button>
            <button
              type="button"
              className={`mode-btn ${mathIsBlock ? "active" : ""}`}
              onClick={() => setMathIsBlock(true)}
            >
              Bloco ($$...$$)
            </button>
          </div>

          <div className="math-snippet-tabs compact">
            <button
              type="button"
              className={`math-tab-btn ${mathSnippetTab === "basic" ? "active" : ""}`}
              onClick={() => setMathSnippetTab("basic")}
            >
              Básico
            </button>
            <button
              type="button"
              className={`math-tab-btn ${mathSnippetTab === "calculus" ? "active" : ""}`}
              onClick={() => setMathSnippetTab("calculus")}
            >
              Cálculo
            </button>
            <button
              type="button"
              className={`math-tab-btn ${mathSnippetTab === "chemistry" ? "active" : ""}`}
              onClick={() => setMathSnippetTab("chemistry")}
            >
              Química
            </button>
            <button
              type="button"
              className={`math-tab-btn ${mathSnippetTab === "greek" ? "active" : ""}`}
              onClick={() => setMathSnippetTab("greek")}
            >
              Grego
            </button>
            <button
              type="button"
              className={`math-tab-btn ${mathSnippetTab === "engineering" ? "active" : ""}`}
              onClick={() => setMathSnippetTab("engineering")}
            >
              Engenharia
            </button>
          </div>

          <div className="math-snippets-grid compact">
            {MATH_SNIPPETS[mathSnippetTab].map((s) => (
              <button
                key={s.label}
                type="button"
                className="math-snippet-chip"
                onClick={() => insertToolbarMathSnippet(s.latex)}
                title={`${s.desc} (${s.latex})`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <label htmlFor="math-toolbar-latex">Código LaTeX:</label>
          {mathIsBlock ? (
            <textarea
              id="math-toolbar-latex"
              ref={mathInputRef as React.RefObject<HTMLTextAreaElement>}
              autoFocus
              rows={2}
              value={mathLatex}
              onChange={(e) => setMathLatex(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) insertMath(e);
                else if (e.key === "Escape") setMathOpen(false);
              }}
              placeholder="Ex.: \int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}"
            />
          ) : (
            <input
              id="math-toolbar-latex"
              ref={mathInputRef as React.RefObject<HTMLInputElement>}
              autoFocus
              value={mathLatex}
              onChange={(e) => setMathLatex(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setMathOpen(false)}
              placeholder="Ex.: \frac{a}{b} ou \sqrt{x}"
            />
          )}

          <div className="math-preview-container compact">
            <div
              className={`math-preview-render ${mathIsBlock ? "block-mode" : "inline-mode"}`}
              dangerouslySetInnerHTML={{ __html: renderKaTeXToString(mathLatex, mathIsBlock).html }}
            />
          </div>

          <div className="calculation-popover-actions">
            <button type="button" onClick={() => setMathOpen(false)}>Cancelar</button>
            <button type="submit">Inserir Fórmula</button>
          </div>
        </form>
      )}
      {calculationOpen && (
        <form className="calculation-popover" onSubmit={insertCalculation}>
          <label htmlFor="calculation-expression">Expressão matemática</label>
          <input id="calculation-expression" autoFocus value={calculationExpression} onChange={(event) => setCalculationExpression(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setCalculationOpen(false)} placeholder="Ex.: 1250 * 1.08" aria-invalid={Boolean(calculationError)} />
          {calculationError && <p role="alert">{calculationError}</p>}
          <div className="calculation-popover-actions">
            <button type="button" onClick={() => setCalculationOpen(false)}>Cancelar</button>
            <button type="submit">Inserir</button>
          </div>
        </form>
      )}
      {linkOpen && (
        <form className="calculation-popover link-popover" onSubmit={submitLink}>
          <label htmlFor="link-url">Endereço do link</label>
          <input id="link-url" autoFocus value={linkURL} onChange={(event) => setLinkURL(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setLinkOpen(false)} placeholder="https://exemplo.com" aria-invalid={Boolean(linkError)} />
          {linkError && <p role="alert">{linkError}</p>}
          <div className="calculation-popover-actions">
            <button type="button" onClick={() => setLinkOpen(false)}>Cancelar</button>
            <button type="submit">Aplicar link</button>
          </div>
        </form>
      )}
      {noteLinkOpen && (
        <div className="note-link-toolbar-popover" role="dialog" aria-label="Vincular nota">
          <div className="note-link-popover-head">
            <label htmlFor="note-link-search">Vincular outra nota (ou digite [[ no texto)</label>
            <button type="button" className="note-link-close-btn" onClick={() => setNoteLinkOpen(false)}>
              Fechar
            </button>
          </div>
          <input
            id="note-link-search"
            autoFocus
            value={noteLinkFilter}
            onChange={(event) => setNoteLinkFilter(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && setNoteLinkOpen(false)}
            placeholder="Buscar nota pelo título ou pasta..."
          />
          <div className="note-link-picker-list">
            {availableNotes
              .filter((item) => {
                const needle = noteLinkFilter.trim().toLocaleLowerCase();
                if (!needle) return true;
                return (
                  (item.title || "Sem título").toLocaleLowerCase().includes(needle) ||
                  (item.folder || "").toLocaleLowerCase().includes(needle)
                );
              })
              .slice(0, 20)
              .map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="note-link-picker-item"
                  onClick={() => {
                    editor
                      .chain()
                      .focus()
                      .insertContent([
                        { type: "noteLink", attrs: { noteId: item.id, title: item.title || "Sem título" } },
                        { type: "text", text: " " },
                      ])
                      .run();
                    setNoteLinkOpen(false);
                    setNoteLinkFilter("");
                  }}
                >
                  <FileText size={13} aria-hidden="true" />
                  <span className="note-link-picker-title">{item.title || "Sem título"}</span>
                  {item.folder && <span className="note-link-picker-folder">{item.folder}</span>}
                </button>
              ))}
            {availableNotes.length === 0 && (
              <p className="note-link-picker-empty">Crie mais uma nota para vincular entre si.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

type NoteLinkTriggerState = {
  from: number;
  to: number;
  query: string;
  top: number;
  left: number;
};

function detectNoteLinkTrigger(currentEditor: Editor): NoteLinkTriggerState | null {
  const { selection } = currentEditor.state;
  if (!selection.empty || currentEditor.isActive("codeBlock")) return null;
  const { $from } = selection;
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const match = textBefore.match(/(?:^|\s)\[\[([^[\]\n]{0,60})$/);
  if (!match) return null;
  const query = match[1] ?? "";
  const triggerLen = query.length + 2; // "[[" + query
  const to = $from.pos;
  const from = to - triggerLen;
  if (from < 0) return null;

  try {
    const coords = currentEditor.view.coordsAtPos(to);
    return {
      from,
      to,
      query,
      top: Math.min(window.innerHeight - 240, coords.bottom + 6),
      left: Math.min(window.innerWidth - 310, Math.max(12, coords.left)),
    };
  } catch {
    return null;
  }
}

export function StructuredEditor({
  value,
  readOnly,
  onChange,
  onBlur,
  currentNoteId,
  availableNotes = [],
  onOpenLinkedNote,
  onOpenConnectionsPanel,
}: StructuredEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const linkableNotes = useMemo(
    () => availableNotes.filter((item) => item.id !== currentNoteId),
    [availableNotes, currentNoteId]
  );

  const availableMapRef = useRef<Map<string, NoteLinkMeta>>(new Map());
  useEffect(() => {
    const map = new Map<string, NoteLinkMeta>();
    for (const item of availableNotes) {
      map.set(item.id, item);
    }
    availableMapRef.current = map;
  }, [availableNotes]);

  const onOpenLinkedNoteRef = useRef(onOpenLinkedNote);
  onOpenLinkedNoteRef.current = onOpenLinkedNote;

  const [linkTrigger, setLinkTrigger] = useState<NoteLinkTriggerState | null>(null);
  const [triggerIndex, setTriggerIndex] = useState(0);

  const triggerSuggestions = useMemo(() => {
    if (!linkTrigger) return [];
    const needle = linkTrigger.query.trim().toLocaleLowerCase();
    return linkableNotes
      .filter((item) => {
        if (!needle) return true;
        return (
          (item.title || "Sem título").toLocaleLowerCase().includes(needle) ||
          (item.folder || "").toLocaleLowerCase().includes(needle)
        );
      })
      .slice(0, 8);
  }, [linkTrigger, linkableNotes]);

  const triggerRef = useRef<NoteLinkTriggerState | null>(null);
  triggerRef.current = linkTrigger;
  const suggestionsRef = useRef<NoteLinkMeta[]>([]);
  suggestionsRef.current = triggerSuggestions;
  const triggerIndexRef = useRef(0);
  triggerIndexRef.current = triggerIndex;

  const insertTriggeredNoteRef = useRef<(item: NoteLinkMeta) => void>(() => {});

  const editor = useEditor({
    extensions: editorExtensions,
    content: parseDocument(value),
    editable: !readOnly,
    immediatelyRender: false,
    editorProps: {
      handleKeyDown: (_view, event) => {
        const activeTrigger = triggerRef.current;
        const list = suggestionsRef.current;
        if (!activeTrigger) return false;

        if (event.key === "Escape") {
          event.preventDefault();
          setLinkTrigger(null);
          return true;
        }
        if (list.length === 0) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          setTriggerIndex((prev) => (prev + 1) % list.length);
          return true;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setTriggerIndex((prev) => (prev - 1 + list.length) % list.length);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const chosen = list[Math.min(triggerIndexRef.current, list.length - 1)];
          if (chosen) {
            insertTriggeredNoteRef.current(chosen);
          }
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData("text/plain");
        const html = event.clipboardData?.getData("text/html");
        // Quando cola do Excel, Sheets ou TSV/CSV sem table HTML nativo
        if (!html?.includes("<table") && text && text.includes("\t") && text.includes("\n")) {
          const lines = text
            .trim()
            .split(/\r?\n/)
            .map((line) => line.split("\t"));
          if (lines.length >= 1 && lines[0].length >= 2) {
            event.preventDefault();
            const tableHtml = `<table>${lines
              .map((row, rIdx) => {
                const tag = rIdx === 0 ? "th" : "td";
                return `<tr>${row.map((cell) => `<${tag}><p>${cell.trim() || ""}</p></${tag}>`).join("")}</tr>`;
              })
              .join("")}</table>`;
            // @ts-ignore
            view.props.dispatchTransaction(view.state.tr);
            editor?.commands.insertContent(tableHtml);
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextTrigger = detectNoteLinkTrigger(currentEditor);
      setLinkTrigger(nextTrigger);
      setTriggerIndex(0);
      onChangeRef.current(
        JSON.stringify(currentEditor.getJSON()),
        currentEditor.getText({ blockSeparator: "\n" })
      );
    },
    onSelectionUpdate: ({ editor: currentEditor }) => {
      const nextTrigger = detectNoteLinkTrigger(currentEditor);
      setLinkTrigger(nextTrigger);
    },
  });

  insertTriggeredNoteRef.current = (item: NoteLinkMeta) => {
    const activeTrigger = triggerRef.current;
    if (!editor || !activeTrigger) return;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: activeTrigger.from, to: activeTrigger.to },
        [
          { type: "noteLink", attrs: { noteId: item.id, title: item.title || "Sem título" } },
          { type: "text", text: " " },
        ]
      )
      .run();
    setLinkTrigger(null);
    setTriggerIndex(0);
  };

  useEffect(() => {
    if (!editor) return;
    const storage = (editor.storage as { noteLink?: NoteLinkStorage }).noteLink;
    if (!storage) return;
    storage.resolveNoteMeta = (noteId: string) => availableMapRef.current.get(noteId);
    storage.onOpenNoteLink = (noteId: string, title: string, openSeparateWindow: boolean) => {
      onOpenLinkedNoteRef.current?.(noteId, title, openSeparateWindow);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
    if (readOnly) setLinkTrigger(null);
  }, [editor, readOnly]);

  useEffect(() => {
    if (!editor) return;
    const nextDocument = parseDocument(value);
    if (JSON.stringify(editor.getJSON()) === JSON.stringify(nextDocument)) return;

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && !editor.isDestroyed) {
        editor.commands.setContent(nextDocument, { emitUpdate: false });
      }
    });
    return () => { cancelled = true; };
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    const handleExternalInsertLink = (event: Event) => {
      const custom = event as CustomEvent<{
        editorNoteId?: string;
        noteId: string;
        title: string;
      }>;
      if (!custom.detail?.noteId || readOnly) return;
      if (custom.detail.editorNoteId && custom.detail.editorNoteId !== currentNoteId) {
        return;
      }
      editor
        .chain()
        .focus("end")
        .insertContent([
          {
            type: "noteLink",
            attrs: {
              noteId: custom.detail.noteId,
              title: custom.detail.title || "Sem título",
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    };
    window.addEventListener("magnetares:insert-note-link", handleExternalInsertLink);
    return () => {
      window.removeEventListener("magnetares:insert-note-link", handleExternalInsertLink);
    };
  }, [editor, readOnly, currentNoteId]);

  if (!editor) return null;

  return (
    <div
      className={`structured-editor ${readOnly ? "read-only" : ""}`}
      onBlur={() => {
        setTimeout(() => setLinkTrigger(null), 150);
        onBlur();
      }}
    >
      {!readOnly && (
        <FormattingToolbar
          editor={editor}
          availableNotes={linkableNotes}
          onOpenConnectionsPanel={onOpenConnectionsPanel}
        />
      )}
      <EditorContent editor={editor} />
      {!readOnly && linkTrigger && (
        <div
          className="note-link-autocomplete"
          style={{ top: `${linkTrigger.top}px`, left: `${linkTrigger.left}px` }}
          role="listbox"
          aria-label="Sugestões de vínculo entre notas"
        >
          <div className="note-link-autocomplete-header">
            <Network size={12} aria-hidden="true" />
            <span>Vincular nota</span>
          </div>
          {triggerSuggestions.length > 0 ? (
            triggerSuggestions.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === triggerIndex}
                className={`note-link-autocomplete-item ${idx === triggerIndex ? "active" : ""}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertTriggeredNoteRef.current(item);
                }}
              >
                <FileText size={13} aria-hidden="true" />
                <span className="note-link-picker-title">{item.title || "Sem título"}</span>
                {item.folder && <span className="note-link-picker-folder">{item.folder}</span>}
              </button>
            ))
          ) : (
            <div className="note-link-autocomplete-empty">
              {linkableNotes.length === 0
                ? "Nenhuma outra nota disponível para vincular"
                : "Nenhuma nota encontrada"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
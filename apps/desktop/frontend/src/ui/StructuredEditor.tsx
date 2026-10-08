import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Highlight from "@tiptap/extension-highlight";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { LineHeight } from "./LineHeightExtension";
import { common, createLowlight } from "lowlight";
import { Bold, Calculator, Code2, Columns3, Highlighter, Italic, Link2, List as BulletList, ListChecks, ListOrdered, Quote, Redo2, Rows3, Table2, Trash2, Undo2, Unlink, AlignLeft, AlignCenter, AlignRight, AlignJustify, Palette, Space } from "lucide-react";
import { calculateExpression, CalculationNode } from "./CalculationNode";

const PRESET_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff",
  "#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"
];

type StructuredEditorProps = {
  value: string;
  readOnly: boolean;
  onChange: (document: string, text: string) => void;
  onBlur: () => void;
};

type ToolButtonProps = {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
};

const extensions = [
  StarterKit.configure({ codeBlock: false }),
  CodeBlockLowlight.configure({ lowlight: createLowlight(common), defaultLanguage: "plaintext" }),
  Highlight,
  Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  CalculationNode,
  Placeholder.configure({ placeholder: "Comece a escrever" }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  TextStyle,
  Color,
  LineHeight
];

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

function FormattingToolbar({ editor }: { editor: Editor }) {
  const [calculationOpen, setCalculationOpen] = useState(false);
  const [calculationExpression, setCalculationExpression] = useState("");
  const [calculationError, setCalculationError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkURL, setLinkURL] = useState("");
  const [linkError, setLinkError] = useState("");
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
      <select value={headingLevel} onChange={(event) => setBlockStyle(event.target.value)} aria-label="Estilo do texto" title="Estilo do texto">
        <option value="paragraph">Corpo</option>
        <option value="1">Título</option>
        <option value="2">Subtítulo</option>
      </select>
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
        <select
          className="code-language-select"
          aria-label="Linguagem do bloco de código"
          title="Linguagem do bloco de código"
          value={codeLanguage}
          onChange={(event) => editor.chain().focus().updateAttributes("codeBlock", { language: event.target.value }).run()}
        >
          {codeLanguages.map((language) => <option key={language.id} value={language.id}>{language.label}</option>)}
        </select>
      )}
      <ToolButton label="Inserir ou editar link" active={editor.isActive("link") || linkOpen} onClick={openLinkEditor}><Link2 aria-hidden="true" /></ToolButton>
      {editor.isActive("link") && <ToolButton label="Remover link" onClick={() => editor.chain().focus().unsetLink().run()}><Unlink aria-hidden="true" /></ToolButton>}
      <span className="toolbar-separator" />
      <ToolButton label="Lista" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><BulletList aria-hidden="true" /></ToolButton>
      <ToolButton label="Lista numerada" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered aria-hidden="true" /></ToolButton>
      <ToolButton label="Checklist" active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks aria-hidden="true" /></ToolButton>
      <ToolButton label="Citação" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote aria-hidden="true" /></ToolButton>
      <span className="toolbar-separator" />
      <ToolButton label="Inserir cálculo" active={editor.isActive("calculation") || calculationOpen} onClick={() => setCalculationOpen((open) => !open)}><Calculator aria-hidden="true" /></ToolButton>
      <ToolButton label="Inserir tabela" active={insideTable} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 aria-hidden="true" /></ToolButton>
      {insideTable && <ToolButton label="Adicionar linha" onClick={() => editor.chain().focus().addRowAfter().run()}><Rows3 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Adicionar coluna" onClick={() => editor.chain().focus().addColumnAfter().run()}><Columns3 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Excluir linha" onClick={() => editor.chain().focus().deleteRow().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Excluir coluna" onClick={() => editor.chain().focus().deleteColumn().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      {insideTable && <ToolButton label="Excluir tabela" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      </div>
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
    </>
  );
}

export function StructuredEditor({ value, readOnly, onChange, onBlur }: StructuredEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions,
    content: parseDocument(value),
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor: currentEditor }) => {
      onChangeRef.current(
        JSON.stringify(currentEditor.getJSON()),
        currentEditor.getText({ blockSeparator: "\n" })
      );
    }
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
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

  if (!editor) return null;

  return (
    <div className={`structured-editor ${readOnly ? "read-only" : ""}`} onBlur={onBlur}>
      {!readOnly && <FormattingToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
}
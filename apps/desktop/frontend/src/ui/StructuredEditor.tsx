import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Calculator, Columns3, Highlighter, Italic, List as BulletList, ListChecks, ListOrdered, Quote, Redo2, Rows3, Table2, Trash2, Undo2 } from "lucide-react";
import { calculateExpression, CalculationNode } from "./CalculationNode";

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
  StarterKit,
  Highlight,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  TaskList,
  TaskItem.configure({ nested: true }),
  CalculationNode,
  Placeholder.configure({ placeholder: "Comece a escrever" })
];

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
  const insideTable = editor.isActive("table");
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

  return (
    <>
      <div className="format-toolbar" role="toolbar" aria-label="Formatação da nota">
      <select value={headingLevel} onChange={(event) => setBlockStyle(event.target.value)} aria-label="Estilo do texto" title="Estilo do texto">
        <option value="paragraph">Corpo</option>
        <option value="1">Título</option>
        <option value="2">Subtítulo</option>
      </select>
      <span className="toolbar-separator" />
      <ToolButton label="Negrito" active={editor.isActive("bold")} disabled={!editor.can().chain().focus().toggleBold().run()} onClick={() => editor.chain().focus().toggleBold().run()}><Bold aria-hidden="true" /></ToolButton>
      <ToolButton label="Itálico" active={editor.isActive("italic")} disabled={!editor.can().chain().focus().toggleItalic().run()} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic aria-hidden="true" /></ToolButton>
      <ToolButton label="Destaque" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}><Highlighter aria-hidden="true" /></ToolButton>
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
      {insideTable && <ToolButton label="Excluir tabela" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 aria-hidden="true" /></ToolButton>}
      <span className="toolbar-spacer" />
      <ToolButton label="Desfazer" disabled={!editor.can().chain().focus().undo().run()} onClick={() => editor.chain().focus().undo().run()}><Undo2 aria-hidden="true" /></ToolButton>
      <ToolButton label="Refazer" disabled={!editor.can().chain().focus().redo().run()} onClick={() => editor.chain().focus().redo().run()}><Redo2 aria-hidden="true" /></ToolButton>
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
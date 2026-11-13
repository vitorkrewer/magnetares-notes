import type { MouseEvent as ReactMouseEvent } from "react";
import { mergeAttributes, Node } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { FileText, Link2 } from "lucide-react";

export type NoteLinkMeta = {
  id: string;
  title: string;
  folder?: string;
};

export type NoteLinkStorage = {
  onOpenNoteLink?: (noteId: string, title: string, openSeparateWindow: boolean) => void;
  resolveNoteMeta?: (noteId: string) => NoteLinkMeta | undefined;
};

function NoteLinkChipView({ node, editor, selected }: NodeViewProps) {
  const noteId = String(node.attrs.noteId || "").trim();
  const storedTitle = String(node.attrs.title || "").trim();
  const storage = (editor?.storage as { noteLink?: NoteLinkStorage } | undefined)?.noteLink;
  const resolved = noteId ? storage?.resolveNoteMeta?.(noteId) : undefined;
  const displayTitle = resolved?.title?.trim() || storedTitle || "Nota sem título";
  const isMissing = Boolean(storage?.resolveNoteMeta && noteId && !resolved);

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!noteId || isMissing) return;
    // Clique normal abre na janela separada sem sair da nota atual; Ctrl/Cmd+clique navega no painel principal
    const openSeparateWindow = !(event.ctrlKey || event.metaKey);
    storage?.onOpenNoteLink?.(noteId, displayTitle, openSeparateWindow);
  };

  return (
    <NodeViewWrapper as="span" className="note-link-node-wrapper" contentEditable={false}>
      <button
        type="button"
        className={`note-link-chip ${selected ? "selected" : ""} ${isMissing ? "missing" : ""}`}
        onClick={handleClick}
        title={
          isMissing
            ? "Nota referenciada não encontrada ou na lixeira"
            : `${displayTitle}${resolved?.folder ? ` (${resolved.folder})` : ""} · Clique para abrir em janela separada (Ctrl+clique para navegar)`
        }
        aria-label={`Vínculo para nota ${displayTitle}`}
      >
        {isMissing ? (
          <Link2 size={12} className="note-link-chip-icon" aria-hidden="true" />
        ) : (
          <FileText size={12} className="note-link-chip-icon" aria-hidden="true" />
        )}
        <span className="note-link-chip-brackets" aria-hidden="true">[[</span>
        <span className="note-link-chip-title">{displayTitle}</span>
        <span className="note-link-chip-brackets" aria-hidden="true">]]</span>
      </button>
    </NodeViewWrapper>
  );
}

export const NoteLinkNode = Node.create<Record<string, never>, NoteLinkStorage>({
  name: "noteLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return {
      onOpenNoteLink: undefined,
      resolveNoteMeta: undefined,
    };
  },

  addAttributes() {
    return {
      noteId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note-link-id") || "",
        renderHTML: (attributes) => ({
          "data-note-link-id": attributes.noteId || "",
        }),
      },
      title: {
        default: "",
        parseHTML: (element) =>
          element.getAttribute("data-note-link-title") || element.textContent?.replace(/^\[\[|\]\]$/g, "") || "",
        renderHTML: (attributes) => ({
          "data-note-link-title": attributes.title || "",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-note-link-id]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const title = String(node.attrs.title || "Nota").trim();
    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "note-link-chip" }),
      `[[${title}]]`,
    ];
  },

  renderText({ node }) {
    const title = String(node.attrs.title || "").trim();
    return title ? `[[${title}]]` : "";
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteLinkChipView);
  },
});


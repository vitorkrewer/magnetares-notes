import { useState, useEffect, useRef } from "react";
import { 
  ArrowLeft, 
  Minimize2, 
  Maximize2, 
  Columns2,
  X, 
  Check, 
  Clock, 
  Folder,
  PictureInPicture2
} from "lucide-react";
import { Note } from "./types";
import { StructuredEditor } from "./StructuredEditor";
import { CodeEditor } from "./CodeEditor";

type FocusLayout = "split-right" | "centered" | "full";

type FocusNoteModalProps = {
  isOpen: boolean;
  note: Note;
  saveState: "saved" | "saving" | "error";
  onClose: () => void;
  onSave: (patch: Partial<Note>) => void;
  onFlush: (id: string) => Promise<void> | void;
};

export function FocusNoteModal({
  isOpen,
  note,
  saveState,
  onClose,
  onSave,
  onFlush,
}: FocusNoteModalProps) {
  const [layout, setLayout] = useState<FocusLayout>("centered");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Fecha o Modo Foco com a tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="focus-modal-backdrop" role="dialog" aria-modal="true" aria-label="Modo Foco da Nota">
      <div className={`focus-modal-container layout-${layout}`}>
        {/* Barra superior de controle do Modo Foco */}
        <header className="focus-modal-header">
          <div className="focus-header-left">
            <button
              type="button"
              className="focus-return-button"
              onClick={onClose}
              title="Retornar à aplicação principal (Esc)"
              aria-label="Retornar à aplicação principal"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>Retornar ao app</span>
            </button>

            <div className="focus-mode-badge" title="Você está no Modo Foco (Picture-in-Picture)">
              <PictureInPicture2 size={15} aria-hidden="true" />
              <span>Modo Foco</span>
            </div>

            <span className="focus-note-folder">
              <Folder size={14} aria-hidden="true" />
              <span>{note.folder || "Notas"}</span>
            </span>
          </div>

          <div className="focus-header-center">
            <span className={`focus-save-status ${saveState}`} role="status">
              {saveState === "saving" && "Salvando…"}
              {saveState === "saved" && (
                <>
                  <Check size={13} aria-hidden="true" /> Salvo
                </>
              )}
              {saveState === "error" && "Erro ao salvar"}
            </span>
          </div>

          <div className="focus-header-right">
            <div className="focus-layout-selector" title="Ajustar proporção da janela de estudo">
              <button
                type="button"
                className={`layout-btn ${layout === "split-right" ? "active" : ""}`}
                onClick={() => setLayout("split-right")}
                title="Modo Lado a Lado (Ideal com vídeo à esquerda)"
                aria-label="Layout Dividido Lado a Lado"
              >
                <Columns2 size={15} />
              </button>
              <button
                type="button"
                className={`layout-btn ${layout === "centered" ? "active" : ""}`}
                onClick={() => setLayout("centered")}
                title="Modo Centralizado (Confortável)"
                aria-label="Layout Centralizado"
              >
                <Minimize2 size={15} />
              </button>
              <button
                type="button"
                className={`layout-btn ${layout === "full" ? "active" : ""}`}
                onClick={() => setLayout("full")}
                title="Modo Tela Inteira"
                aria-label="Layout Tela Cheia"
              >
                <Maximize2 size={15} />
              </button>
            </div>

            <button
              type="button"
              className="focus-close-icon"
              onClick={onClose}
              title="Fechar Modo Foco (Esc)"
              aria-label="Fechar Modo Foco"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Área de edição da nota em Foco */}
        <main className="focus-modal-body">
          <div className="focus-editor-content">
            <div className="focus-title-row">
              <input
                ref={titleInputRef}
                className="focus-note-title"
                value={note.title}
                onChange={(e) => onSave({ title: e.target.value })}
                onBlur={() => void onFlush(note.id)}
                placeholder="Título da nota"
                aria-label="Título da nota em foco"
              />
            </div>

            {note.tags && note.tags.length > 0 && (
              <div className="focus-tags-bar">
                {note.tags.map((tag) => (
                  <span key={tag} className="focus-tag-chip">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="focus-editor-inner">
              {note.type === "code" ? (
                <CodeEditor
                  key={`focus-code-${note.id}`}
                  value={note.body}
                  language={note.language || "plaintext"}
                  title={note.title || "Protótipo"}
                  readOnly={false}
                  onChange={(text) => onSave({ body: text, bodyText: text })}
                  onLanguageChange={(lang) => onSave({ language: lang })}
                  onBlur={() => void onFlush(note.id)}
                />
              ) : (
                <StructuredEditor
                  key={`focus-rtf-${note.id}`}
                  value={note.body}
                  readOnly={false}
                  onChange={(document, text) => onSave({ body: document, bodyText: text })}
                  onBlur={() => void onFlush(note.id)}
                />
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

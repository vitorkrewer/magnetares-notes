import { useEffect, useRef, useState, useCallback } from "react";
import { 
  ArrowLeft, 
  Check, 
  Folder, 
  Maximize2, 
  Minimize2, 
  Minus, 
  Pin, 
  PinOff,
  Sparkles, 
  X,
  PictureInPicture2
} from "lucide-react";
import { Note } from "./types";
import { StructuredEditor } from "./StructuredEditor";
import { CodeEditor } from "./CodeEditor";

type FocusStandaloneWindowProps = {
  noteId: string;
};

type SaveState = "saved" | "saving" | "error";

const fullDateLabel = (value: string) => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

export function FocusStandaloneWindow({ noteId }: FocusStandaloneWindowProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);
  const [trafficHovered, setTrafficHovered] = useState(false);

  const saveTimerRef = useRef<number | null>(null);
  const latestNoteRef = useRef<Note | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Sincroniza o tema (claro / escuro) salvo no localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem("magnetares_theme") || localStorage.getItem("aster_theme") || "light";
    let isDark = savedTheme === "dark";
    if (savedTheme === "system" && typeof window !== "undefined") {
      isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);

  // Inicializa o canal de comunicação entre janelas
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("magnetares_focus_sync");
      channelRef.current = channel;

      channel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        // Se a janela principal solicitar fechamento do modo foco
        if (data.type === "REQUEST_CLOSE_FOCUS" && data.noteId === noteId) {
          void handleReturnToMainApp();
        }
      };

      // Anuncia que a janela de foco foi aberta
      channel.postMessage({ type: "FOCUS_WINDOW_OPENED", noteId });
    } catch {
      // Fallback silencioso caso BroadcastChannel não esteja disponível
    }

    const handleBeforeUnload = () => {
      try {
        channel?.postMessage({ type: "FOCUS_WINDOW_CLOSED", noteId });
      } catch {
        // Ignora
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      try {
        channel?.postMessage({ type: "FOCUS_WINDOW_CLOSED", noteId });
        channel?.close();
      } catch {
        // Ignora
      }
    };
  }, [noteId]);

  // Carrega a nota do banco SQLite
  useEffect(() => {
    let isMounted = true;
    const fetchNote = async () => {
      setLoading(true);
      setLoadError("");
      try {
        const bridge = window.go?.main?.App;
        if (bridge?.GetNote) {
          const loaded = await bridge.GetNote(noteId);
          if (isMounted) {
            setNote(loaded);
            latestNoteRef.current = loaded;
            setLoading(false);
          }
        } else {
          // Fallback para desenvolvimento sem backend Wails
          if (isMounted) {
            const mock: Note = {
              id: noteId,
              title: "Nota em Modo Foco",
              body: "<p>Esta é uma anotação em janela independente para estudos e foco.</p>",
              bodyText: "Esta é uma anotação em janela independente para estudos e foco.",
              folder: "Estudos",
              updatedAt: new Date().toISOString()
            };
            setNote(mock);
            latestNoteRef.current = mock;
            setLoading(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setLoadError("Não foi possível carregar esta nota.");
          setLoading(false);
        }
      }
    };

    void fetchNote();
    return () => {
      isMounted = false;
    };
  }, [noteId]);

  // Salva no SQLite e notifica a janela principal via BroadcastChannel
  const persistNote = useCallback(async (targetNote: Note) => {
    setSaveState("saving");
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.SaveNote) {
        const saved = await bridge.SaveNote(targetNote);
        setNote((prev) => (prev ? { ...prev, revision: saved.revision, updatedAt: saved.updatedAt } : saved));
        latestNoteRef.current = saved;
      }
      setSaveState("saved");

      // Avisa a janela principal sobre a atualização
      channelRef.current?.postMessage({
        type: "NOTE_UPDATED",
        noteId: targetNote.id,
        note: targetNote
      });
    } catch {
      setSaveState("error");
    }
  }, []);

  const handlePatch = useCallback((patch: Partial<Note>) => {
    setNote((prev) => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        ...patch,
        updatedAt: new Date().toISOString()
      };
      latestNoteRef.current = updated;

      setSaveState("saving");
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        void persistNote(updated);
      }, 350);

      return updated;
    });
  }, [persistNote]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (latestNoteRef.current) {
      await persistNote(latestNoteRef.current);
    }
  }, [persistNote]);

  // Controles de janela
  const handleMinimize = () => {
    void window.go?.main?.App?.MinimizeWindow?.();
  };

  const handleToggleMaximize = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.ToggleMaximizeWindow) return;
    const nextState = await bridge.ToggleMaximizeWindow();
    setIsMaximized(nextState);
  };

  const handleClose = async () => {
    await flushSave();
    try {
      channelRef.current?.postMessage({ type: "FOCUS_WINDOW_CLOSED", noteId });
    } catch {
      // Ignora
    }
    if (window.go?.main?.App?.CloseWindow) {
      void window.go.main.App.CloseWindow();
    } else {
      window.close();
    }
  };

  const handleReturnToMainApp = async () => {
    await handleClose();
  };

  const handleToggleAlwaysOnTop = () => {
    const next = !isAlwaysOnTop;
    setIsAlwaysOnTop(next);
    void window.go?.main?.App?.SetAlwaysOnTop?.(next);
  };

  // Tecla Escape para retornar e Ctrl+S para salvar imediatamente
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleReturnToMainApp();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void flushSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [flushSave]);

  if (loading) {
    return (
      <div className="focus-standalone-loading">
        <Sparkles className="focus-spin-icon" size={28} />
        <span>Abrindo nota em Modo Foco…</span>
      </div>
    );
  }

  if (loadError || !note) {
    return (
      <div className="focus-standalone-error">
        <h2>{loadError || "Nota não encontrada"}</h2>
        <button type="button" onClick={handleClose} className="focus-return-cta">
          Fechar janela
        </button>
      </div>
    );
  }

  return (
    <div className="focus-standalone-container">
      {/* Barra de título customizada com arraste nativo */}
      <header className="focus-standalone-titlebar" style={{ "--wails-draggable": "drag" } as React.CSSProperties}>
        <div className="focus-titlebar-left" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
          <img
            src="/icon.png"
            alt="Magnetares"
            className="focus-brand-icon"
            aria-hidden="true"
          />
          <div className="focus-mode-badge" title="Esta nota está em uma janela independente (Picture-in-Picture)">
            <PictureInPicture2 size={13} aria-hidden="true" />
            <span>Modo Foco</span>
          </div>
          <span className="focus-folder-chip" title={`Pasta: ${note.folder || "Notas"}`}>
            <Folder size={12} aria-hidden="true" />
            <span>{note.folder || "Notas"}</span>
          </span>
        </div>

        <div className="focus-titlebar-center">
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

        <div className="focus-titlebar-right" style={{ "--wails-draggable": "no-drag" } as React.CSSProperties}>
          <button
            type="button"
            className={`focus-pin-window-btn ${isAlwaysOnTop ? "active" : ""}`}
            onClick={handleToggleAlwaysOnTop}
            title={isAlwaysOnTop ? "Janela fixada sobre outros programas (clique para soltar)" : "Fixar janela sempre visível no topo (ideal para vídeos)"}
            aria-label="Fixar janela sempre no topo"
          >
            {isAlwaysOnTop ? <PinOff size={14} /> : <Pin size={14} />}
            <span>{isAlwaysOnTop ? "Fixada" : "Fixar no topo"}</span>
          </button>

          <div
            className={`traffic-lights ${trafficHovered ? "hovered" : ""}`}
            onMouseEnter={() => setTrafficHovered(true)}
            onMouseLeave={() => setTrafficHovered(false)}
          >
            <button
              type="button"
              className="traffic-light minimize"
              onClick={handleMinimize}
              title="Minimizar"
              aria-label="Minimizar janela"
            >
              {trafficHovered && <Minus className="traffic-icon" aria-hidden="true" />}
            </button>
            <button
              type="button"
              className="traffic-light maximize"
              onClick={() => void handleToggleMaximize()}
              title={isMaximized ? "Restaurar" : "Maximizar"}
              aria-label={isMaximized ? "Restaurar janela" : "Maximizar janela"}
            >
              {trafficHovered && (
                isMaximized ? (
                  <Minimize2 className="traffic-icon" aria-hidden="true" />
                ) : (
                  <Maximize2 className="traffic-icon" aria-hidden="true" />
                )
              )}
            </button>
            <button
              type="button"
              className="traffic-light close"
              onClick={() => void handleClose()}
              title="Fechar (Retornar ao app)"
              aria-label="Fechar janela"
            >
              {trafficHovered && <X className="traffic-icon" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {/* Faixa de retorno rápido ao app principal */}
      <div className="focus-action-banner">
        <button
          type="button"
          className="focus-return-app-btn"
          onClick={() => void handleReturnToMainApp()}
          title="Fechar esta janela e continuar editando no aplicativo principal (Esc)"
        >
          <ArrowLeft size={15} aria-hidden="true" />
          <span>Retornar ao app principal</span>
        </button>
        <span className="focus-window-tip">
          Pressione <strong>Esc</strong> para retornar à janela principal
        </span>
      </div>

      {/* Área de edição da nota */}
      <main className="focus-standalone-body">
        <div className="focus-standalone-editor-inner">
          <time className="edited-at">{fullDateLabel(note.updatedAt)}</time>
          <input
            className="focus-note-title"
            value={note.title}
            onChange={(e) => handlePatch({ title: e.target.value })}
            onBlur={() => void flushSave()}
            placeholder="Título da nota"
            aria-label="Título da nota em foco"
          />
          <h1 className="print-title" aria-hidden="true">{note.title || "Sem título"}</h1>

          {note.tags && note.tags.length > 0 && (
            <div className="focus-tags-bar">
              {note.tags.map((tag) => (
                <span key={tag} className="focus-tag-chip">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="focus-editor-content-wrapper">
            {note.type === "code" ? (
              <CodeEditor
                key={`focus-standalone-code-${note.id}`}
                value={note.body}
                language={note.language || "plaintext"}
                title={note.title || "Protótipo"}
                readOnly={false}
                onChange={(text) => handlePatch({ body: text, bodyText: text })}
                onLanguageChange={(lang) => handlePatch({ language: lang })}
                onBlur={() => void flushSave()}
              />
            ) : (
              <StructuredEditor
                key={`focus-standalone-rtf-${note.id}`}
                value={note.body}
                readOnly={false}
                onChange={(document, text) => handlePatch({ body: document, bodyText: text })}
                onBlur={() => void flushSave()}
              />
            )}
          </div>

          <footer className="print-footer" aria-hidden="true">
            <span className="print-footer-brand">Gerado via Magnetares Notes</span>
            <span className="print-footer-meta">
              {note.title ? note.title.trim() : "Nota"} • {fullDateLabel(note.updatedAt)}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

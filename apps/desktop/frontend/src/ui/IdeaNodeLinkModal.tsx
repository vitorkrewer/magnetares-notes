import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, FileText, ListTodo, Search, StickyNote, X } from "lucide-react";
import { STICKER_PALETTE } from "./StickerBoardDialog";
import {
  NavigationRecord,
  Note,
  StickerBoardRecord,
  StickerRecord,
  TaskListRecord,
  TaskRecord,
} from "./types";

export type IdeaReferenceKind = "note" | "taskList" | "task" | "stickerBoard" | "sticker";

type LinkModalTab = "note" | "taskList" | "stickerBoard";

export type IdeaReferenceSelection = {
  linkedKind: IdeaReferenceKind;
  linkedId: string;
  linkedLabel: string;
};

export type IdeaNodeLinkModalProps = {
  navigation: NavigationRecord;
  currentKind?: string;
  currentId?: string;
  onSelect: (selection: IdeaReferenceSelection) => void;
  onClose: () => void;
};

const DEMO_NOTES: Note[] = [
  {
    id: "welcome",
    title: "Bem-vindo ao Magnetares",
    body: "Um lugar tranquilo para pensar, planejar e guardar o que importa.",
    bodyText: "Um lugar tranquilo para pensar, planejar e guardar o que importa.",
    folder: "Notas",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "ideas",
    title: "Ideias",
    body: "• Diário de projeto\n• Atalhos de teclado\n• Sincronização segura",
    bodyText: "• Diário de projeto\n• Atalhos de teclado\n• Sincronização segura",
    folder: "Notas",
    updatedAt: new Date().toISOString(),
  },
];

export function IdeaNodeLinkModal({
  navigation,
  currentKind,
  currentId,
  onSelect,
  onClose,
}: IdeaNodeLinkModalProps) {
  const initialTab: LinkModalTab =
    currentKind === "taskList" || currentKind === "task"
      ? "taskList"
      : currentKind === "stickerBoard" || currentKind === "sticker"
      ? "stickerBoard"
      : "note";
  const [activeTab, setActiveTab] = useState<LinkModalTab>(initialTab);
  const [searchQuery, setSearchQuery] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [tasksByList, setTasksByList] = useState<Record<string, TaskRecord[]>>({});
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [stickersByBoard, setStickersByBoard] = useState<Record<string, StickerRecord[]>>({});
  const [loadingStickers, setLoadingStickers] = useState(false);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    const loadNotes = async () => {
      setLoadingNotes(true);
      try {
        const bridge = window.go?.main?.App;
        if (bridge?.QueryNotes) {
          const list = await bridge.QueryNotes({ kind: "all" });
          if (!cancelled) setNotes(Array.isArray(list) ? list : []);
        } else if (bridge?.ListNotes) {
          const list = await bridge.ListNotes();
          if (!cancelled) setNotes(Array.isArray(list) ? list : []);
        } else if (!cancelled) {
          setNotes(DEMO_NOTES);
        }
      } catch {
        if (!cancelled) setNotes(DEMO_NOTES);
      } finally {
        if (!cancelled) setLoadingNotes(false);
      }
    };
    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== "taskList") return;
    const lists = navigation.taskLists ?? [];
    const bridge = window.go?.main?.App;
    if (!bridge?.ListTasks || lists.length === 0) return;

    let cancelled = false;
    const loadListTasks = async () => {
      setLoadingTasks(true);
      try {
        const entries = await Promise.all(
          lists.map(async (list) => {
            try {
              const items = await bridge.ListTasks!(list.id, true);
              return [list.id, Array.isArray(items) ? items : []] as const;
            } catch {
              return [list.id, [] as TaskRecord[]] as const;
            }
          })
        );
        if (!cancelled) {
          const map: Record<string, TaskRecord[]> = {};
          for (const [id, items] of entries) {
            map[id] = items;
          }
          setTasksByList(map);
        }
      } finally {
        if (!cancelled) setLoadingTasks(false);
      }
    };
    void loadListTasks();
    return () => {
      cancelled = true;
    };
  }, [activeTab, navigation.taskLists]);

  useEffect(() => {
    if (activeTab !== "stickerBoard") return;
    const boards = navigation.stickerBoards ?? [];
    const bridge = window.go?.main?.App;
    if (!bridge?.ListStickers || boards.length === 0) return;

    let cancelled = false;
    const loadBoardStickers = async () => {
      setLoadingStickers(true);
      try {
        const entries = await Promise.all(
          boards.map(async (board) => {
            try {
              const items = await bridge.ListStickers!(board.id);
              return [board.id, Array.isArray(items) ? items : []] as const;
            } catch {
              return [board.id, [] as StickerRecord[]] as const;
            }
          })
        );
        if (!cancelled) {
          const map: Record<string, StickerRecord[]> = {};
          for (const [id, list] of entries) {
            map[id] = list;
          }
          setStickersByBoard(map);
        }
      } finally {
        if (!cancelled) setLoadingStickers(false);
      }
    };
    void loadBoardStickers();
    return () => {
      cancelled = true;
    };
  }, [activeTab, navigation.stickerBoards]);

  const taskLists: TaskListRecord[] = navigation.taskLists ?? [];
  const stickerBoards: StickerBoardRecord[] = navigation.stickerBoards ?? [];

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const title = (n.title || "").toLocaleLowerCase();
      const body = (n.bodyText || n.body || "").toLocaleLowerCase();
      const folder = (n.folder || "").toLocaleLowerCase();
      return title.includes(q) || body.includes(q) || folder.includes(q);
    });
  }, [notes, searchQuery]);

  const filteredTaskLists = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return taskLists;
    return taskLists.filter((tl) => {
      if (tl.name.toLocaleLowerCase().includes(q)) return true;
      const tasks = tasksByList[tl.id] ?? [];
      return tasks.some((t) => (t.title || "").toLocaleLowerCase().includes(q));
    });
  }, [taskLists, tasksByList, searchQuery]);

  const filteredBoards = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return stickerBoards;
    return stickerBoards.filter((board) => {
      if (board.name.toLocaleLowerCase().includes(q)) return true;
      const stickers = stickersByBoard[board.id] ?? [];
      return stickers.some(
        (s) =>
          (s.title || "").toLocaleLowerCase().includes(q) ||
          (s.body || "").toLocaleLowerCase().includes(q)
      );
    });
  }, [stickerBoards, stickersByBoard, searchQuery]);

  return (
    <div
      className="dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Vincular item do Magnetares"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="idea-link-modal">
        <header className="idea-link-modal-header">
          <div>
            <h2>Vincular Referência Magnetares</h2>
            <p>Escolha uma nota, lista de tarefas ou quadro de stickers para conectar ao nó.</p>
          </div>
          <button
            type="button"
            className="idea-link-close-btn"
            onClick={onClose}
            aria-label="Fechar modal"
            title="Fechar (Esc)"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="idea-link-tabs" role="tablist" aria-label="Tipo de referência">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "note"}
            className={`idea-link-tab ${activeTab === "note" ? "active" : ""}`}
            onClick={() => setActiveTab("note")}
          >
            <FileText size={14} aria-hidden="true" />
            <span>Notas</span>
            <span className="idea-link-tab-count">{notes.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "taskList"}
            className={`idea-link-tab ${activeTab === "taskList" ? "active" : ""}`}
            onClick={() => setActiveTab("taskList")}
          >
            <ListTodo size={14} aria-hidden="true" />
            <span>Listas de Tarefas</span>
            <span className="idea-link-tab-count">{taskLists.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "stickerBoard"}
            className={`idea-link-tab ${activeTab === "stickerBoard" ? "active" : ""}`}
            onClick={() => setActiveTab("stickerBoard")}
          >
            <StickyNote size={14} aria-hidden="true" />
            <span>Stickers / Quadros</span>
            <span className="idea-link-tab-count">{stickerBoards.length}</span>
          </button>
        </div>

        <label className="idea-link-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === "note"
                ? "Buscar notas por título, pasta ou conteúdo..."
                : activeTab === "taskList"
                ? "Buscar listas ou tarefas..."
                : "Buscar quadros ou stickers..."
            }
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              aria-label="Limpar busca"
              title="Limpar busca"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </label>

        <div className="idea-link-list">
          {activeTab === "note" && (
            <>
              {loadingNotes ? (
                <div className="idea-link-empty">Carregando notas...</div>
              ) : filteredNotes.length === 0 ? (
                <div className="idea-link-empty">Nenhuma nota encontrada.</div>
              ) : (
                filteredNotes.map((note) => {
                  const isCurrent = currentKind === "note" && currentId === note.id;
                  const snippet = (note.bodyText || note.body || "").trim().slice(0, 90);
                  const displayTitle = note.title?.trim() || "Sem título";
                  return (
                    <button
                      key={note.id}
                      type="button"
                      className={`idea-link-item ${isCurrent ? "selected" : ""}`}
                      onClick={() =>
                        onSelect({
                          linkedKind: "note",
                          linkedId: note.id,
                          linkedLabel: displayTitle,
                        })
                      }
                    >
                      <span className="idea-link-item-icon note">
                        <FileText size={15} aria-hidden="true" />
                      </span>
                      <span className="idea-link-item-body">
                        <strong>{displayTitle}</strong>
                        <small>
                          {note.folder ? `${note.folder} · ` : ""}
                          {snippet || "Nota vazia"}
                        </small>
                      </span>
                      {isCurrent && <Check size={15} className="idea-link-check" aria-hidden="true" />}
                    </button>
                  );
                })
              )}
            </>
          )}

          {activeTab === "taskList" && (
            <>
              {loadingTasks && taskLists.length > 0 && (
                <div className="idea-link-hint">Sincronizando tarefas das listas...</div>
              )}
              {filteredTaskLists.length === 0 ? (
                <div className="idea-link-empty">Nenhuma lista ou tarefa encontrada.</div>
              ) : (
                filteredTaskLists.map((list) => {
                  const isCurrentList = currentKind === "taskList" && currentId === list.id;
                  const allTasks = tasksByList[list.id] ?? [];
                  const q = searchQuery.trim().toLocaleLowerCase();
                  const listMatches = !q || list.name.toLocaleLowerCase().includes(q);
                  const visibleTasks = listMatches
                    ? allTasks
                    : allTasks.filter((t) => (t.title || "").toLocaleLowerCase().includes(q));

                  return (
                    <div key={list.id} className="idea-link-group">
                      <button
                        type="button"
                        className={`idea-link-item idea-link-group-header ${isCurrentList ? "selected" : ""}`}
                        onClick={() =>
                          onSelect({
                            linkedKind: "taskList",
                            linkedId: list.id,
                            linkedLabel: list.name,
                          })
                        }
                      >
                        <span
                          className="idea-link-item-icon task"
                          style={
                            list.color
                              ? { backgroundColor: `${list.color}22`, color: list.color }
                              : undefined
                          }
                        >
                          <ListTodo size={15} aria-hidden="true" />
                        </span>
                        <span className="idea-link-item-body">
                          <strong>{list.name}</strong>
                          <small>
                            {list.taskCount} {list.taskCount === 1 ? "tarefa" : "tarefas"}
                          </small>
                        </span>
                        <span className="idea-link-badge task-list">Lista</span>
                        {isCurrentList && <Check size={15} className="idea-link-check" aria-hidden="true" />}
                      </button>

                      {visibleTasks.length > 0 && (
                        <div className="idea-link-children">
                          {visibleTasks.map((task) => {
                            const compositeId = `${list.id}::${task.id}`;
                            const isCurrentTask = currentKind === "task" && currentId === compositeId;
                            const taskTitle = task.title?.trim() || "Tarefa sem título";
                            return (
                              <button
                                key={task.id}
                                type="button"
                                className={`idea-link-item idea-link-child-item ${
                                  isCurrentTask ? "selected" : ""
                                } ${task.completed ? "is-completed" : ""}`}
                                onClick={() =>
                                  onSelect({
                                    linkedKind: "task",
                                    linkedId: compositeId,
                                    linkedLabel: taskTitle,
                                  })
                                }
                              >
                                <span
                                  className={`idea-link-child-status ${
                                    task.completed ? "done" : "open"
                                  }`}
                                  aria-label={task.completed ? "Concluída" : "Aberta"}
                                >
                                  {task.completed ? (
                                    <CheckCircle2 size={14} aria-hidden="true" />
                                  ) : (
                                    <Circle size={14} aria-hidden="true" />
                                  )}
                                </span>
                                <span className="idea-link-item-body">
                                  <strong>{taskTitle}</strong>
                                </span>
                                <span className="idea-link-badge task">Tarefa</span>
                                {isCurrentTask && (
                                  <Check size={15} className="idea-link-check" aria-hidden="true" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          {activeTab === "stickerBoard" && (
            <>
              {loadingStickers && stickerBoards.length > 0 && (
                <div className="idea-link-hint">Sincronizando stickers dos quadros...</div>
              )}
              {filteredBoards.length === 0 ? (
                <div className="idea-link-empty">Nenhum quadro ou sticker encontrado.</div>
              ) : (
                filteredBoards.map((board) => {
                  const isCurrentBoard = currentKind === "stickerBoard" && currentId === board.id;
                  const allStickers = stickersByBoard[board.id] ?? [];
                  const q = searchQuery.trim().toLocaleLowerCase();
                  const boardMatches = !q || board.name.toLocaleLowerCase().includes(q);
                  const visibleStickers = boardMatches
                    ? allStickers
                    : allStickers.filter(
                        (s) =>
                          (s.title || "").toLocaleLowerCase().includes(q) ||
                          (s.body || "").toLocaleLowerCase().includes(q)
                      );

                  return (
                    <div key={board.id} className="idea-link-group">
                      <button
                        type="button"
                        className={`idea-link-item idea-link-group-header ${isCurrentBoard ? "selected" : ""}`}
                        onClick={() =>
                          onSelect({
                            linkedKind: "stickerBoard",
                            linkedId: board.id,
                            linkedLabel: board.name,
                          })
                        }
                      >
                        <span
                          className="idea-link-item-icon sticker"
                          style={
                            board.color
                              ? { backgroundColor: `${board.color}22`, color: board.color }
                              : undefined
                          }
                        >
                          <StickyNote size={15} aria-hidden="true" />
                        </span>
                        <span className="idea-link-item-body">
                          <strong>{board.name}</strong>
                          <small>
                            {board.stickerCount}{" "}
                            {board.stickerCount === 1 ? "sticker" : "stickers"}
                          </small>
                        </span>
                        <span className="idea-link-badge sticker-board">Quadro</span>
                        {isCurrentBoard && <Check size={15} className="idea-link-check" aria-hidden="true" />}
                      </button>

                      {visibleStickers.length > 0 && (
                        <div className="idea-link-children">
                          {visibleStickers.map((sticker) => {
                            const compositeId = `${board.id}::${sticker.id}`;
                            const isCurrentSticker =
                              currentKind === "sticker" && currentId === compositeId;
                            const label =
                              sticker.title?.trim() ||
                              sticker.body?.trim().slice(0, 48) ||
                              "Sticker";
                            const preview =
                              sticker.title?.trim() && sticker.body?.trim()
                                ? sticker.body.trim().slice(0, 64)
                                : "";
                            const stickerHex =
                              STICKER_PALETTE.find((c) => c.id === sticker.color)?.hex ?? "#eab308";

                            return (
                              <button
                                key={sticker.id}
                                type="button"
                                className={`idea-link-item idea-link-child-item ${
                                  isCurrentSticker ? "selected" : ""
                                }`}
                                onClick={() =>
                                  onSelect({
                                    linkedKind: "sticker",
                                    linkedId: compositeId,
                                    linkedLabel: label,
                                  })
                                }
                              >
                                <span
                                  className="idea-link-sticker-dot"
                                  style={{ backgroundColor: stickerHex }}
                                  aria-hidden="true"
                                />
                                <span className="idea-link-item-body">
                                  <strong>{label}</strong>
                                  {preview && <small>{preview}</small>}
                                </span>
                                <span className="idea-link-badge sticker">Sticker</span>
                                {isCurrentSticker && (
                                  <Check size={15} className="idea-link-check" aria-hidden="true" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

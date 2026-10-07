import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pin,
  Trash2,
  Plus,
  Search,
  X,
  Palette,
  ChevronRight,
  Sparkles,
  FilePenLine,
  GripVertical
} from "lucide-react";
import { StickerBoardRecord, StickerRecord } from "./types";
import { STICKER_PALETTE, DelicateStickerIcon } from "./StickerBoardDialog";

export type StickerBoardViewProps = {
  board: StickerBoardRecord;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onEditBoard: (board: StickerBoardRecord) => void;
  onDeleteBoard: (board: StickerBoardRecord) => void;
  onStickerCountChange: (boardId: string, count: number) => void;
};

export function StickerBoardView({
  board,
  sidebarOpen,
  onOpenSidebar,
  onEditBoard,
  onDeleteBoard,
  onStickerCountChange,
}: StickerBoardViewProps) {
  const [stickers, setStickers] = useState<StickerRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");
  const [colorMenuStickerId, setColorMenuStickerId] = useState<string | null>(null);
  const [draggedStickerId, setDraggedStickerId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  // Debounced auto-save timers per sticker
  const pendingUpdates = useRef<Map<string, Partial<StickerRecord>>>(new Map());
  const debounceTimers = useRef<Map<string, number>>(new Map());

  // Load stickers for current board
  const loadStickers = async () => {
    setIsLoading(true);
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.ListStickers) {
        const loaded = await bridge.ListStickers(board.id);
        setStickers(loaded);
        onStickerCountChange(board.id, loaded.length);
      }
    } catch (err) {
      console.error("Falha ao carregar stickers:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadStickers();
    setFilterQuery("");
    setColorMenuStickerId(null);
  }, [board.id]);

  // Clean up debounce timers on unmount
  useEffect(() => {
    return () => {
      debounceTimers.current.forEach((t) => window.clearTimeout(t));
      debounceTimers.current.clear();
    };
  }, []);

  const handleCreateSticker = async (customColor?: string) => {
    const bridge = window.go?.main?.App;
    if (!bridge?.SaveSticker) return;

    const newSticker: StickerRecord = {
      id: crypto.randomUUID(),
      boardId: board.id,
      title: "",
      body: "",
      color: customColor || (board.color !== "yellow" ? board.color : "yellow"),
      position: 0,
      updatedAt: new Date().toISOString(),
    };

    try {
      const saved = await bridge.SaveSticker(newSticker);
      setStickers((prev) => [saved, ...prev]);
      onStickerCountChange(board.id, stickers.length + 1);
    } catch (err) {
      console.error("Erro ao criar sticker:", err);
    }
  };

  const scheduleSave = (id: string, updates: Partial<StickerRecord>) => {
    const currentPending = pendingUpdates.current.get(id) || {};
    const merged = { ...currentPending, ...updates };
    pendingUpdates.current.set(id, merged);

    if (debounceTimers.current.has(id)) {
      window.clearTimeout(debounceTimers.current.get(id));
    }

    const timer = window.setTimeout(async () => {
      debounceTimers.current.delete(id);
      const toSave = pendingUpdates.current.get(id);
      pendingUpdates.current.delete(id);
      if (!toSave) return;

      const current = stickers.find((s) => s.id === id);
      if (!current) return;

      const updatedSticker: StickerRecord = { ...current, ...toSave, updatedAt: new Date().toISOString() };
      try {
        await window.go?.main?.App?.SaveSticker?.(updatedSticker);
      } catch (err) {
        console.error("Falha ao salvar sticker:", err);
      }
    }, 400);

    debounceTimers.current.set(id, timer);
  };

  const handleTitleChange = (id: string, title: string) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s))
    );
    scheduleSave(id, { title });
  };

  const handleBodyChange = (id: string, body: string) => {
    setStickers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, body, updatedAt: new Date().toISOString() } : s))
    );
    scheduleSave(id, { body });
  };

  const handleBlurSave = async (id: string) => {
    if (debounceTimers.current.has(id)) {
      window.clearTimeout(debounceTimers.current.get(id));
      debounceTimers.current.delete(id);
    }
    const toSave = pendingUpdates.current.get(id);
    if (!toSave) return;
    pendingUpdates.current.delete(id);

    const current = stickers.find((s) => s.id === id);
    if (!current) return;

    const updatedSticker: StickerRecord = { ...current, ...toSave, updatedAt: new Date().toISOString() };
    try {
      await window.go?.main?.App?.SaveSticker?.(updatedSticker);
    } catch (err) {
      console.error("Falha ao salvar sticker no blur:", err);
    }
  };

  const handleTogglePin = async (sticker: StickerRecord) => {
    const bridge = window.go?.main?.App;
    const isPinned = Boolean(sticker.pinnedAt);
    try {
      if (bridge?.SetStickerPinned) {
        const updated = await bridge.SetStickerPinned(sticker.id, !isPinned);
        setStickers((prev) => {
          const filtered = prev.filter((s) => s.id !== sticker.id);
          return updated.pinnedAt ? [updated, ...filtered] : [...filtered, updated];
        });
      } else {
        const updated = {
          ...sticker,
          pinnedAt: isPinned ? null : new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setStickers((prev) => prev.map((s) => (s.id === sticker.id ? updated : s)));
      }
    } catch (err) {
      console.error("Erro ao alternar fixação do sticker:", err);
    }
  };

  const handleChangeColor = async (sticker: StickerRecord, newColor: string) => {
    setColorMenuStickerId(null);
    const updated: StickerRecord = {
      ...sticker,
      color: newColor,
      updatedAt: new Date().toISOString(),
    };
    setStickers((prev) => prev.map((s) => (s.id === sticker.id ? updated : s)));

    try {
      await window.go?.main?.App?.SaveSticker?.(updated);
    } catch (err) {
      console.error("Erro ao alterar cor do sticker:", err);
    }
  };

  const handleDeleteSticker = async (stickerId: string) => {
    try {
      await window.go?.main?.App?.DeleteSticker?.(stickerId);
      setStickers((prev) => prev.filter((s) => s.id !== stickerId));
      onStickerCountChange(board.id, Math.max(0, stickers.length - 1));
    } catch (err) {
      console.error("Erro ao excluir sticker:", err);
    }
  };

  // Drag and Drop reordering
  const handleDragStart = (id: string, e: React.DragEvent) => {
    setDraggedStickerId(id);
    e.dataTransfer.setData("application/x-magnetares-sticker", id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (id: string, e: React.DragEvent) => {
    if (draggedStickerId && draggedStickerId !== id) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTargetId(id);
    }
  };

  const handleDragLeave = (id: string) => {
    if (dropTargetId === id) {
      setDropTargetId(null);
    }
  };

  const handleDrop = async (targetId: string, e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetId(null);
    const sourceId = e.dataTransfer.getData("application/x-magnetares-sticker") || draggedStickerId;
    setDraggedStickerId(null);

    if (!sourceId || sourceId === targetId) return;

    try {
      const bridge = window.go?.main?.App;
      if (bridge?.MoveSticker) {
        await bridge.MoveSticker(sourceId, board.id, targetId);
        await loadStickers();
      }
    } catch (err) {
      console.error("Erro ao mover sticker:", err);
    }
  };

  // Filtered stickers based on search query
  const filteredStickers = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return stickers;
    return stickers.filter(
      (s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
    );
  }, [stickers, filterQuery]);

  const isDefaultBoard = board.id === "board-default";

  return (
    <section className="sticker-board-container" aria-label={`Quadro de Stickers ${board.name}`}>
      {/* Board Top Toolbar */}
      <header className="sticker-board-header">
        <div className="sticker-board-title-group">
          {!sidebarOpen && (
            <button
              className="icon-button"
              onClick={onOpenSidebar}
              title="Mostrar barra lateral"
              aria-label="Mostrar barra lateral"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          )}
          <div className="sticker-board-badge" style={{ backgroundColor: STICKER_PALETTE.find((c) => c.id === board.color)?.hex ?? "#eab308" }}>
            <DelicateStickerIcon size={16} />
          </div>
          <div className="sticker-board-meta">
            <h1 className="sticker-board-name">{board.name}</h1>
            <span className="sticker-board-count">
              {stickers.length} {stickers.length === 1 ? "sticker" : "stickers"}
            </span>
          </div>
        </div>

        <div className="sticker-board-actions">
          <label className="search sticker-search">
            <Search aria-hidden="true" />
            <input
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setFilterQuery("")}
              placeholder="Buscar stickers..."
              aria-label="Buscar stickers neste quadro"
            />
            {filterQuery && (
              <button onClick={() => setFilterQuery("")} title="Limpar busca" aria-label="Limpar busca">
                <X aria-hidden="true" />
              </button>
            )}
          </label>

          <button
            type="button"
            className="btn-create-sticker"
            onClick={() => handleCreateSticker()}
            title="Criar novo sticker"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Novo sticker</span>
          </button>

          <div className="sticker-board-manage-buttons">
            <button
              type="button"
              className="icon-button"
              onClick={() => onEditBoard(board)}
              title="Editar quadro"
              aria-label={`Editar quadro ${board.name}`}
            >
              <FilePenLine size={16} aria-hidden="true" />
            </button>
            {!isDefaultBoard && (
              <button
                type="button"
                className="icon-button danger-button"
                onClick={() => onDeleteBoard(board)}
                title="Excluir quadro"
                aria-label={`Excluir quadro ${board.name}`}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Board Canvas / Grid */}
      <div
        className="sticker-board-canvas"
        onClick={() => setColorMenuStickerId(null)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-magnetares-sticker")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={async (e) => {
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains("sticker-grid")) {
            e.preventDefault();
            const sourceId = e.dataTransfer.getData("application/x-magnetares-sticker") || draggedStickerId;
            setDraggedStickerId(null);
            setDropTargetId(null);
            if (sourceId) {
              try {
                const bridge = window.go?.main?.App;
                if (bridge?.MoveSticker) {
                  await bridge.MoveSticker(sourceId, board.id, "");
                  await loadStickers();
                }
              } catch (err) {
                console.error("Erro ao mover sticker para o final:", err);
              }
            }
          }
        }}
      >
        {isLoading && (
          <div className="sticker-board-loading">Carregando stickers…</div>
        )}

        {!isLoading && filteredStickers.length === 0 && (
          <div className="sticker-board-empty">
            <div className="empty-sticker-icon">
              <Sparkles size={36} aria-hidden="true" />
            </div>
            <strong>{filterQuery ? "Nenhum sticker encontrado" : "Nenhum sticker neste quadro"}</strong>
            <p>
              {filterQuery
                ? "Tente buscar por outro termo."
                : "Clique em 'Novo sticker' para adicionar sua primeira nota adesiva."}
            </p>
            {!filterQuery && (
              <button
                type="button"
                className="btn-create-sticker primary-action"
                onClick={() => handleCreateSticker()}
              >
                <Plus size={16} aria-hidden="true" />
                Criar primeiro sticker
              </button>
            )}
          </div>
        )}

        {!isLoading && filteredStickers.length > 0 && (
          <div className="sticker-grid">
            {filteredStickers.map((sticker) => {
              const isPinned = Boolean(sticker.pinnedAt);
              const isColorMenuOpen = colorMenuStickerId === sticker.id;
              const isDropTarget = dropTargetId === sticker.id;
              const isDragging = draggedStickerId === sticker.id;

              return (
                <article
                  key={sticker.id}
                  className={`sticker-card color-${sticker.color} ${isPinned ? "is-pinned" : ""} ${isDropTarget ? "drop-target" : ""} ${isDragging ? "is-dragging" : ""}`}
                  draggable
                  onDragStart={(e) => handleDragStart(sticker.id, e)}
                  onDragEnd={() => {
                    setDraggedStickerId(null);
                    setDropTargetId(null);
                  }}
                  onDragOver={(e) => handleDragOver(sticker.id, e)}
                  onDragLeave={() => handleDragLeave(sticker.id)}
                  onDrop={(e) => handleDrop(sticker.id, e)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Card Header */}
                  <div className="sticker-card-header">
                    <span className="sticker-drag-handle" title="Arrastar para mover ou reordenar">
                      <GripVertical size={14} aria-hidden="true" />
                    </span>

                    <div className="sticker-card-tools">
                      {/* Pin button */}
                      <button
                        type="button"
                        className={`sticker-tool-btn ${isPinned ? "pinned-active" : ""}`}
                        onClick={() => handleTogglePin(sticker)}
                        title={isPinned ? "Desafixar" : "Fixar no topo"}
                        aria-label={isPinned ? "Desafixar sticker" : "Fixar sticker no topo"}
                      >
                        <Pin size={15} aria-hidden="true" />
                      </button>

                      {/* Color Palette button */}
                      <div className="sticker-color-popover-wrapper">
                        <button
                          type="button"
                          className="sticker-tool-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setColorMenuStickerId(isColorMenuOpen ? null : sticker.id);
                          }}
                          title="Mudar cor"
                          aria-label="Mudar cor do sticker"
                        >
                          <Palette size={15} aria-hidden="true" />
                        </button>

                        {isColorMenuOpen && (
                          <div className="sticker-color-menu" role="menu" onClick={(e) => e.stopPropagation()}>
                            {STICKER_PALETTE.map(({ id, name: cName, hex }) => (
                              <button
                                key={id}
                                type="button"
                                className={`sticker-color-dot ${sticker.color === id ? "active-color" : ""}`}
                                style={{ backgroundColor: hex }}
                                title={cName}
                                onClick={() => handleChangeColor(sticker, id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        type="button"
                        className="sticker-tool-btn delete-btn"
                        onClick={() => handleDeleteSticker(sticker.id)}
                        title="Excluir sticker"
                        aria-label="Excluir sticker"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Card Title (simple text) */}
                  <input
                    type="text"
                    className="sticker-title-input"
                    value={sticker.title}
                    placeholder="Título"
                    maxLength={120}
                    onDragStart={(e) => e.stopPropagation()}
                    onChange={(e) => handleTitleChange(sticker.id, e.target.value)}
                    onBlur={() => handleBlurSave(sticker.id)}
                  />

                  {/* Card Body (simple text) */}
                  <textarea
                    className="sticker-body-input"
                    value={sticker.body}
                    placeholder="Escreva sua anotação…"
                    maxLength={5000}
                    rows={4}
                    onDragStart={(e) => e.stopPropagation()}
                    onChange={(e) => handleBodyChange(sticker.id, e.target.value)}
                    onBlur={() => handleBlurSave(sticker.id)}
                  />

                  {/* Card Footer */}
                  <footer className="sticker-card-footer">
                    <span className="sticker-date">
                      {new Date(sticker.updatedAt).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit"
                      })}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

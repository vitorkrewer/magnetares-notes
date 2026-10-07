import { useState, type FormEvent } from "react";
import { X, Check } from "lucide-react";
import { StickerBoardRecord } from "./types";

export type StickerBoardDialogProps = {
  boardToEdit?: StickerBoardRecord;
  onClose: () => void;
  onSave: (board: StickerBoardRecord) => Promise<void>;
};

export function DelicateStickerIcon({
  className = "",
  style,
  size = 14,
}: {
  className?: string;
  style?: React.CSSProperties;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
      <path d="M15 3v5.5h5.5" />
    </svg>
  );
}

export const STICKER_PALETTE = [
  { id: "yellow", name: "Amarelo", hex: "#eab308" },
  { id: "orange", name: "Laranja", hex: "#f97316" },
  { id: "pink", name: "Rosa", hex: "#ec4899" },
  { id: "purple", name: "Roxo", hex: "#a855f7" },
  { id: "blue", name: "Azul", hex: "#0ea5e9" },
  { id: "teal", name: "Turquesa", hex: "#14b8a6" },
  { id: "green", name: "Verde", hex: "#22c55e" },
  { id: "gray", name: "Neutro", hex: "#64748b" },
] as const;

export function StickerBoardDialog({ boardToEdit, onClose, onSave }: StickerBoardDialogProps) {
  const [name, setName] = useState(boardToEdit?.name || "");
  const [color, setColor] = useState<string>(boardToEdit?.color || "yellow");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome para o quadro.");
      return;
    }
    if (trimmed.length > 60) {
      setError("O nome deve ter no máximo 60 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        id: boardToEdit ? boardToEdit.id : crypto.randomUUID(),
        name: trimmed,
        color,
        stickerCount: boardToEdit ? boardToEdit.stickerCount : 0,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Não foi possível salvar o quadro de stickers.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        className="organization-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sticker-board-dialog-title"
        onSubmit={handleSubmit}
      >
        <header>
          <DelicateStickerIcon size={18} style={{ color: STICKER_PALETTE.find((c) => c.id === color)?.hex ?? "#eab308" }} />
          <h2 id="sticker-board-dialog-title">
            {boardToEdit ? "Editar Quadro de Stickers" : "Novo Quadro de Stickers"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar">
            <X aria-hidden="true" />
          </button>
        </header>

        <label>
          Nome do quadro
          <input
            autoFocus
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: Ideias, Tarefas Rápidas, Inspirações..."
          />
        </label>

        <div className="picker-section">
          <span className="picker-label">Cor do tema</span>
          <div className="color-grid" role="radiogroup" aria-label="Cor do quadro">
            {STICKER_PALETTE.map(({ id, name: colorName, hex }) => {
              const isSelected = color === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  title={colorName}
                  className={`picker-btn color-picker-btn ${isSelected ? "selected" : ""}`}
                  style={{ backgroundColor: hex }}
                  onClick={() => setColor(id)}
                >
                  {isSelected && <Check className="color-check-icon" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>

        {error && <div className="dialog-error" role="alert">{error}</div>}

        <footer>
          <button type="button" className="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Salvando…" : boardToEdit ? "Salvar alterações" : "Criar quadro"}
          </button>
        </footer>
      </form>
    </div>
  );
}

import { useState, type FormEvent } from "react";
import {
  X,
  Check,
  GitBranch,
  Network,
  Workflow,
  Sparkles,
  Compass,
  Layers,
  Cpu,
  Lightbulb,
} from "lucide-react";
import { IdeaFlowRecord, SaveIdeaFlowInput } from "./types";

export type IdeaFlowDialogProps = {
  flowToEdit?: IdeaFlowRecord;
  onClose: () => void;
  onSave: (input: SaveIdeaFlowInput) => Promise<void>;
};

export const IDEA_FLOW_PALETTE = [
  { id: "blue", name: "Azul", hex: "#4b75ff" },
  { id: "indigo", name: "Índigo", hex: "#6366f1" },
  { id: "purple", name: "Roxo", hex: "#a855f7" },
  { id: "pink", name: "Rosa", hex: "#ec4899" },
  { id: "rose", name: "Vermelho", hex: "#f43f5e" },
  { id: "orange", name: "Laranja", hex: "#f97316" },
  { id: "amber", name: "Âmbar", hex: "#f59e0b" },
  { id: "emerald", name: "Esmeralda", hex: "#10b981" },
  { id: "teal", name: "Turquesa", hex: "#14b8a6" },
  { id: "slate", name: "Neutro", hex: "#64748b" },
] as const;

export const IDEA_FLOW_ICONS = [
  { id: "git-branch", label: "Ramificação", icon: GitBranch },
  { id: "network", label: "Rede", icon: Network },
  { id: "workflow", label: "Fluxo", icon: Workflow },
  { id: "sparkles", label: "Ideias", icon: Sparkles },
  { id: "compass", label: "Direção", icon: Compass },
  { id: "layers", label: "Camadas", icon: Layers },
  { id: "cpu", label: "Sistema", icon: Cpu },
  { id: "lightbulb", label: "Inspiração", icon: Lightbulb },
] as const;

export function getIdeaFlowIconComponent(iconId?: string) {
  const match = IDEA_FLOW_ICONS.find((item) => item.id === iconId);
  return match ? match.icon : GitBranch;
}

export function resolveIdeaFlowColorHex(color?: string): string {
  if (!color) return IDEA_FLOW_PALETTE[0].hex;
  if (color.startsWith("#")) return color;
  const match = IDEA_FLOW_PALETTE.find((item) => item.id === color);
  return match ? match.hex : IDEA_FLOW_PALETTE[0].hex;
}

export function IdeaFlowDialog({ flowToEdit, onClose, onSave }: IdeaFlowDialogProps) {
  const [title, setTitle] = useState(flowToEdit?.title || "");
  const [description, setDescription] = useState(flowToEdit?.description || "");
  const [color, setColor] = useState<string>(() => resolveIdeaFlowColorHex(flowToEdit?.color));
  const [icon, setIcon] = useState<string>(flowToEdit?.icon || "git-branch");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const SelectedIcon = getIdeaFlowIconComponent(icon);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Informe um título para o fluxo de ideias.");
      return;
    }
    if (trimmedTitle.length > 120) {
      setError("O título deve ter no máximo 120 caracteres.");
      return;
    }
    const trimmedDesc = description.trim();
    if (trimmedDesc.length > 1000) {
      setError("A descrição deve ter no máximo 1000 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        id: flowToEdit?.id,
        title: trimmedTitle,
        description: trimmedDesc,
        color,
        icon,
        position: flowToEdit?.position,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Não foi possível salvar o fluxo de ideias.");
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
        className="organization-dialog idea-flow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="idea-flow-dialog-title"
        onSubmit={handleSubmit}
        style={{ maxWidth: "460px" }}
      >
        <header>
          <SelectedIcon size={18} style={{ color }} />
          <h2 id="idea-flow-dialog-title">
            {flowToEdit ? "Editar Fluxo de Ideias" : "Novo Fluxo de Ideias"}
          </h2>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="dialog-body">
          <label>
            Título
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (error) setError("");
              }}
              placeholder="Ex: Arquitetura do Produto, Planejamento Q3..."
              maxLength={120}
              autoFocus
            />
          </label>

          <label style={{ marginTop: "14px", display: "block" }}>
            Descrição <span className="idea-flow-optional">(opcional)</span>
            <textarea
              className="idea-flow-textarea"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (error) setError("");
              }}
              placeholder="Contexto, objetivo ou resumo deste mapa mental..."
              maxLength={1000}
              rows={3}
            />
          </label>

          <label style={{ marginTop: "14px", display: "block" }}>
            Cor de Destaque
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "8px",
                marginTop: "6px",
              }}
            >
              {IDEA_FLOW_PALETTE.map((p) => {
                const isSelected = color.toLowerCase() === p.hex.toLowerCase();
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setColor(p.hex)}
                    title={p.name}
                    aria-label={p.name}
                    style={{
                      height: "32px",
                      borderRadius: "6px",
                      border: isSelected
                        ? "2px solid var(--text, #111)"
                        : "1px solid rgba(0,0,0,0.12)",
                      backgroundColor: p.hex,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      transition: "transform 0.1s ease",
                      transform: isSelected ? "scale(1.05)" : "scale(1)",
                    }}
                  >
                    {isSelected && <Check size={16} strokeWidth={3} />}
                  </button>
                );
              })}
            </div>
          </label>

          <label style={{ marginTop: "14px", display: "block" }}>
            Ícone
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "6px",
                marginTop: "6px",
              }}
            >
              {IDEA_FLOW_ICONS.map((item) => {
                const ItemIcon = item.icon;
                const isSelected = icon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIcon(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    style={{
                      height: "38px",
                      borderRadius: "6px",
                      border: isSelected
                        ? "2px solid " + color
                        : "1px solid var(--border, rgba(0,0,0,0.1))",
                      backgroundColor: isSelected
                        ? "var(--bg-active, rgba(0,0,0,0.06))"
                        : "var(--bg-surface, transparent)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      color: isSelected ? color : "var(--muted, #666)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <ItemIcon size={17} />
                  </button>
                );
              })}
            </div>
          </label>

          {error && <p className="dialog-error">{error}</p>}
        </div>

        <footer>
          <button type="button" className="ghost-button" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="primary-button" disabled={saving}>
            {saving ? "Salvando..." : flowToEdit ? "Salvar Alterações" : "Criar Fluxo"}
          </button>
        </footer>
      </form>
    </div>
  );
}

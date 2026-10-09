import { useState, type FormEvent } from "react";
import {
  X,
  Check,
  Inbox,
  CheckSquare,
  Star,
  Briefcase,
  Home,
  Bookmark,
  Heart,
  Tag,
  ListTodo,
  Calendar,
  Sparkles,
  Zap,
} from "lucide-react";
import { TaskListRecord } from "./types";

export type TaskListDialogProps = {
  listToEdit?: TaskListRecord;
  onClose: () => void;
  onSave: (list: TaskListRecord) => Promise<void>;
};

export const TASK_LIST_PALETTE = [
  { id: "blue", name: "Azul", hex: "#3b82f6" },
  { id: "indigo", name: "Índigo", hex: "#6366f1" },
  { id: "purple", name: "Roxo", hex: "#a855f7" },
  { id: "pink", name: "Rosa", hex: "#ec4899" },
  { id: "rose", name: "Vermelho", hex: "#f43f5e" },
  { id: "orange", name: "Laranja", hex: "#f97316" },
  { id: "amber", name: "Âmbar", hex: "#f59e0b" },
  { id: "emerald", name: "Esmeralda", hex: "#10b981" },
  { id: "teal", name: "Turquesa", hex: "#14b8a6" },
  { id: "gray", name: "Neutro", hex: "#64748b" },
] as const;

export const TASK_LIST_ICONS = [
  { id: "inbox", label: "Entrada", icon: Inbox },
  { id: "check-square", label: "Check", icon: CheckSquare },
  { id: "list-todo", label: "Tarefas", icon: ListTodo },
  { id: "star", label: "Importante", icon: Star },
  { id: "briefcase", label: "Trabalho", icon: Briefcase },
  { id: "home", label: "Pessoal", icon: Home },
  { id: "bookmark", label: "Estudos", icon: Bookmark },
  { id: "heart", label: "Saúde", icon: Heart },
  { id: "calendar", label: "Datas", icon: Calendar },
  { id: "sparkles", label: "Projetos", icon: Sparkles },
  { id: "zap", label: "Foco", icon: Zap },
  { id: "tag", label: "Geral", icon: Tag },
] as const;

export function getTaskListIconComponent(iconId: string) {
  const match = TASK_LIST_ICONS.find((i) => i.id === iconId);
  return match ? match.icon : ListTodo;
}

export function TaskListDialog({ listToEdit, onClose, onSave }: TaskListDialogProps) {
  const [name, setName] = useState(listToEdit?.name || "");
  const [color, setColor] = useState<string>(listToEdit?.color || "blue");
  const [icon, setIcon] = useState<string>(listToEdit?.icon || "list-todo");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const SelectedIcon = getTaskListIconComponent(icon);
  const colorHex = TASK_LIST_PALETTE.find((c) => c.id === color)?.hex ?? "#3b82f6";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Informe um nome para a lista.");
      return;
    }
    if (trimmed.length > 80) {
      setError("O nome deve ter no máximo 80 caracteres.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await onSave({
        id: listToEdit ? listToEdit.id : crypto.randomUUID(),
        name: trimmed,
        color,
        icon,
        position: listToEdit ? listToEdit.position : 0,
        taskCount: listToEdit ? listToEdit.taskCount : 0,
        updatedAt: new Date().toISOString(),
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || "Não foi possível salvar a lista de tarefas.");
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
        aria-labelledby="task-list-dialog-title"
        onSubmit={handleSubmit}
        style={{ maxWidth: "440px" }}
      >
        <header>
          <SelectedIcon size={18} style={{ color: colorHex }} />
          <h2 id="task-list-dialog-title">{listToEdit ? "Editar Lista de Tarefas" : "Nova Lista de Tarefas"}</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Fechar" aria-label="Fechar">
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="dialog-body">
          <label>
            Nome da Lista
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError("");
              }}
              placeholder="Ex: Trabalho, Compras, Viagem..."
              maxLength={80}
              autoFocus
            />
          </label>

          <label style={{ marginTop: "14px", display: "block" }}>
            Cor da Lista
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: "8px",
                marginTop: "6px",
              }}
            >
              {TASK_LIST_PALETTE.map((p) => {
                const isSelected = color === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setColor(p.id)}
                    title={p.name}
                    style={{
                      height: "32px",
                      borderRadius: "6px",
                      border: isSelected ? "2px solid var(--text, #111)" : "1px solid rgba(0,0,0,0.12)",
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
            Ícone da Lista
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "6px",
                marginTop: "6px",
              }}
            >
              {TASK_LIST_ICONS.map((item) => {
                const ItemIcon = item.icon;
                const isSelected = icon === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setIcon(item.id)}
                    title={item.label}
                    style={{
                      height: "36px",
                      borderRadius: "6px",
                      border: isSelected ? "2px solid " + colorHex : "1px solid var(--border, rgba(0,0,0,0.1))",
                      backgroundColor: isSelected ? "var(--bg-active, rgba(0,0,0,0.06))" : "var(--bg-surface, transparent)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: isSelected ? colorHex : "var(--text-secondary, #666)",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <ItemIcon size={18} />
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
            {saving ? "Salvando..." : listToEdit ? "Salvar Alterações" : "Criar Lista"}
          </button>
        </footer>
      </form>
    </div>
  );
}

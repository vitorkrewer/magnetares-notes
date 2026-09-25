import { useState, type FormEvent } from "react";
import { FolderPlus, Sparkles, X, Folder, Briefcase, Code, BookOpen, Star, Heart, Archive, User, Check } from "lucide-react";
import { FolderRecord, NavigationRecord, SmartFolderRecord, TagRecord } from "./types";

export type { FolderRecord, NavigationRecord, SmartFolderRecord, TagRecord };

type DialogMode = { kind: "folder"; parentId?: string } | { kind: "smart" };

type OrganizationDialogProps = {
  mode: DialogMode;
  navigation: NavigationRecord;
  onClose: () => void;
  onSaveFolder: (folder: FolderRecord) => Promise<void>;
  onSaveSmartFolder: (smartFolder: SmartFolderRecord) => Promise<void>;
};

export const FOLDER_ICONS = [
  { id: "folder", label: "Pasta", Icon: Folder },
  { id: "briefcase", label: "Trabalho", Icon: Briefcase },
  { id: "code", label: "Código", Icon: Code },
  { id: "book", label: "Estudos", Icon: BookOpen },
  { id: "star", label: "Favorito", Icon: Star },
  { id: "heart", label: "Pessoal", Icon: Heart },
  { id: "archive", label: "Arquivo", Icon: Archive },
  { id: "user", label: "Perfil", Icon: User },
] as const;

export const FOLDER_COLORS = [
  { id: "#6366f1", name: "Índigo" },
  { id: "#10b981", name: "Esmeralda" },
  { id: "#f59e0b", name: "Âmbar" },
  { id: "#ec4899", name: "Rosa" },
  { id: "#8b5cf6", name: "Roxo" },
  { id: "#06b6d4", name: "Turquesa" },
  { id: "#f97316", name: "Laranja" },
  { id: "#64748b", name: "Grafite" },
];

export function getFolderIconComponent(iconId?: string) {
  const item = FOLDER_ICONS.find((i) => i.id === iconId);
  return item ? item.Icon : Folder;
}

export function OrganizationDialog({ mode, navigation, onClose, onSaveFolder, onSaveSmartFolder }: OrganizationDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(mode.kind === "folder" ? mode.parentId ?? "" : "");
  const [selectedIcon, setSelectedIcon] = useState<string>("folder");
  const [selectedColor, setSelectedColor] = useState<string>("#6366f1");
  const [ruleKind, setRuleKind] = useState<SmartFolderRecord["ruleKind"]>("tag");
  const [tagId, setTagId] = useState(navigation.tags[0]?.id ?? "");
  const [dateField, setDateField] = useState<NonNullable<SmartFolderRecord["dateField"]>>("updated_at");
  const [dateRange, setDateRange] = useState<NonNullable<SmartFolderRecord["dateRange"]>>("last_7_days");
  const [checklistState, setChecklistState] = useState<NonNullable<SmartFolderRecord["checklistState"]>>("open");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError("Informe um nome.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode.kind === "folder") {
        await onSaveFolder({
          id: crypto.randomUUID(),
          name: name.trim(),
          parentId: parentId || null,
          color: selectedColor,
          icon: selectedIcon,
          noteCount: 0
        });
      } else {
        await onSaveSmartFolder({
          id: crypto.randomUUID(),
          name: name.trim(),
          ruleKind,
          tagId: ruleKind === "tag" ? tagId : undefined,
          dateField: ruleKind === "date" ? dateField : undefined,
          dateRange: ruleKind === "date" ? dateRange : undefined,
          checklistState: ruleKind === "checklist" ? checklistState : undefined
        });
      }
      onClose();
    } catch {
      setError("Não foi possível salvar. Verifique o nome e a regra.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="organization-dialog" role="dialog" aria-modal="true" aria-labelledby="organization-dialog-title" onSubmit={submit}>
        <header>
          {mode.kind === "folder" ? <FolderPlus aria-hidden="true" style={{ color: selectedColor }} /> : <Sparkles aria-hidden="true" />}
          <h2 id="organization-dialog-title">{mode.kind === "folder" ? (mode.parentId ? "Nova subpasta" : "Nova pasta") : "Nova Pasta Inteligente"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
        </header>

        <label>
          Nome
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex: Projetos 2026" />
        </label>

        {mode.kind === "folder" ? (
          <>
            <label>
              Pasta superior
              <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">Nenhuma (Pasta Raiz)</option>
                {navigation.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
            </label>

            <div className="picker-section">
              <span className="picker-label">Ícone da pasta</span>
              <div className="icon-grid" role="radiogroup" aria-label="Ícone da pasta">
                {FOLDER_ICONS.map(({ id, label, Icon }) => {
                  const isSelected = selectedIcon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      title={label}
                      className={`picker-btn icon-picker-btn ${isSelected ? "selected" : ""}`}
                      onClick={() => setSelectedIcon(id)}
                    >
                      <Icon style={{ color: isSelected ? selectedColor : "inherit" }} aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="picker-section">
              <span className="picker-label">Cor da pasta</span>
              <div className="color-grid" role="radiogroup" aria-label="Cor da pasta">
                {FOLDER_COLORS.map(({ id, name: colorName }) => {
                  const isSelected = selectedColor === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      title={colorName}
                      className={`picker-btn color-picker-btn ${isSelected ? "selected" : ""}`}
                      style={{ backgroundColor: id }}
                      onClick={() => setSelectedColor(id)}
                    >
                      {isSelected && <Check className="color-check-icon" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <>
            <label>
              Agrupar por
              <select value={ruleKind} onChange={(event) => setRuleKind(event.target.value as SmartFolderRecord["ruleKind"])}>
                <option value="tag">Etiqueta</option>
                <option value="date">Data</option>
                <option value="checklist">Checklist</option>
              </select>
            </label>
            {ruleKind === "tag" && <label>Etiqueta<select value={tagId} onChange={(event) => setTagId(event.target.value)}>{navigation.tags.map((tag) => <option key={tag.id} value={tag.id}>#{tag.name}</option>)}</select></label>}
            {ruleKind === "date" && (
              <div className="dialog-fields-row">
                <label>Data<select value={dateField} onChange={(event) => setDateField(event.target.value as typeof dateField)}><option value="updated_at">Modificação</option><option value="created_at">Criação</option></select></label>
                <label>Período<select value={dateRange} onChange={(event) => setDateRange(event.target.value as typeof dateRange)}><option value="today">Hoje</option><option value="last_7_days">Últimos 7 dias</option><option value="last_30_days">Últimos 30 dias</option></select></label>
              </div>
            )}
            {ruleKind === "checklist" && <label>Estado<select value={checklistState} onChange={(event) => setChecklistState(event.target.value as typeof checklistState)}><option value="open">Com itens pendentes</option><option value="completed">Todos concluídos</option><option value="any">Qualquer checklist</option></select></label>}
          </>
        )}

        {error && <p className="dialog-error" role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" disabled={saving || (mode.kind === "smart" && ruleKind === "tag" && !tagId)}>{saving ? "Salvando…" : "Criar"}</button>
        </footer>
      </form>
    </div>
  );
}
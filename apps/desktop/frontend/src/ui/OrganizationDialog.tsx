import { useState, type FormEvent } from "react";
import { FolderPlus, Sparkles, X } from "lucide-react";
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

export function OrganizationDialog({ mode, navigation, onClose, onSaveFolder, onSaveSmartFolder }: OrganizationDialogProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState(mode.kind === "folder" ? mode.parentId ?? "" : "");
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
        await onSaveFolder({ id: crypto.randomUUID(), name: name.trim(), parentId: parentId || null, noteCount: 0 });
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
          {mode.kind === "folder" ? <FolderPlus aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          <h2 id="organization-dialog-title">{mode.kind === "folder" ? (mode.parentId ? "Nova subpasta" : "Nova pasta") : "Nova Pasta Inteligente"}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
        </header>
        <label>
          Nome
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {mode.kind === "folder" ? (
          <label>
            Pasta superior
            <select value={parentId} onChange={(event) => setParentId(event.target.value)}>
              <option value="">Nenhuma</option>
              {navigation.folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
            </select>
          </label>
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
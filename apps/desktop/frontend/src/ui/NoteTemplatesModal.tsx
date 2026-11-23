import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { JSONContent } from "@tiptap/react";
import {
  BookOpen,
  Briefcase,
  Calendar,
  Check,
  CheckSquare,
  ClipboardList,
  Compass,
  FilePlus2,
  FileText,
  GraduationCap,
  Hash,
  Kanban,
  Layers,
  LayoutTemplate,
  MessageSquare,
  Plus,
  Rocket,
  Scale,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { CustomSelect } from "./CustomSelect";
import {
  BUILTIN_NOTE_TEMPLATES,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_LABELS,
  interpolateTemplatePlaceholders,
  parseTipTapDoc,
} from "./noteTemplates";
import type { Note, NoteTemplateCategory, NoteTemplateRecord } from "./types";

export type TemplateApplyMode = "replace" | "append" | "new-note";

type NoteTemplatesModalProps = {
  open: boolean;
  activeNote: Note | null;
  activeNoteHasContent: boolean;
  customTemplates: NoteTemplateRecord[];
  onClose: () => void;
  onApplyTemplate: (
    template: NoteTemplateRecord,
    mode: TemplateApplyMode,
    applyTags: boolean
  ) => void;
  onSaveCustomTemplate: (input: {
    name: string;
    description: string;
    category: NoteTemplateCategory;
    defaultTitle: string;
    body: string;
    tags: string[];
  }) => Promise<NoteTemplateRecord | null>;
  onDeleteCustomTemplate: (id: string) => Promise<void>;
};

export function renderTemplateIcon(iconName: string, size = 16) {
  switch (iconName) {
    case "users":
      return <Users size={size} aria-hidden="true" />;
    case "message-square":
      return <MessageSquare size={size} aria-hidden="true" />;
    case "scale":
      return <Scale size={size} aria-hidden="true" />;
    case "layers":
      return <Layers size={size} aria-hidden="true" />;
    case "compass":
      return <Compass size={size} aria-hidden="true" />;
    case "kanban":
      return <Kanban size={size} aria-hidden="true" />;
    case "clipboard-list":
      return <ClipboardList size={size} aria-hidden="true" />;
    case "rocket":
      return <Rocket size={size} aria-hidden="true" />;
    case "shield-alert":
      return <ShieldAlert size={size} aria-hidden="true" />;
    case "graduation-cap":
      return <GraduationCap size={size} aria-hidden="true" />;
    case "book-open":
      return <BookOpen size={size} aria-hidden="true" />;
    case "sun":
      return <Sun size={size} aria-hidden="true" />;
    case "calendar":
      return <Calendar size={size} aria-hidden="true" />;
    case "briefcase":
      return <Briefcase size={size} aria-hidden="true" />;
    case "sparkles":
      return <Sparkles size={size} aria-hidden="true" />;
    default:
      return <FileText size={size} aria-hidden="true" />;
  }
}

function renderInlineText(nodes?: JSONContent[]): string {
  if (!Array.isArray(nodes)) return "";
  return nodes
    .map((n) => {
      if (typeof n.text === "string") return interpolateTemplatePlaceholders(n.text);
      if (n.type === "mathInline") return `$${n.attrs?.latex || ""}$`;
      if (n.type === "noteLink") return `[[${n.attrs?.title || "Nota"}]]`;
      if (Array.isArray(n.content)) return renderInlineText(n.content);
      return "";
    })
    .join("");
}

function TemplateDocPreview({ body }: { body: string }) {
  const nodes = useMemo(() => {
    const parsed = parseTipTapDoc(body);
    return Array.isArray(parsed.content) ? parsed.content : [];
  }, [body]);

  if (nodes.length === 0) {
    return <p className="tpl-preview-empty">Template sem conteúdo estruturado.</p>;
  }

  return (
    <div className="tpl-preview-doc">
      {nodes.map((node, index) => {
        switch (node.type) {
          case "heading": {
            const level = Number(node.attrs?.level || 1);
            const text = renderInlineText(node.content);
            return level === 1 ? (
              <h4 key={index} className="tpl-prev-h1">
                {text}
              </h4>
            ) : (
              <h5 key={index} className="tpl-prev-h2">
                {text}
              </h5>
            );
          }
          case "paragraph": {
            const text = renderInlineText(node.content);
            if (!text.trim()) return null;
            return (
              <p key={index} className="tpl-prev-p">
                {text}
              </p>
            );
          }
          case "callout": {
            const cType = String(node.attrs?.type || "info");
            const text = (node.content || []).map((c) => renderInlineText(c.content)).join(" ");
            return (
              <div key={index} className={`tpl-prev-callout is-${cType}`}>
                <span>{text}</span>
              </div>
            );
          }
          case "blockquote": {
            const text = (node.content || []).map((c) => renderInlineText(c.content)).join(" ");
            return (
              <blockquote key={index} className="tpl-prev-quote">
                {text}
              </blockquote>
            );
          }
          case "bulletList":
          case "orderedList": {
            const items = node.content || [];
            return (
              <ul key={index} className={`tpl-prev-list ${node.type === "orderedList" ? "is-ordered" : ""}`}>
                {items.slice(0, 4).map((item, idx) => (
                  <li key={idx}>
                    {(item.content || []).map((c) => renderInlineText(c.content)).join(" ")}
                  </li>
                ))}
              </ul>
            );
          }
          case "taskList": {
            const items = node.content || [];
            return (
              <div key={index} className="tpl-prev-tasks">
                {items.slice(0, 4).map((item, idx) => (
                  <div key={idx} className="tpl-prev-task-row">
                    <CheckSquare size={12} aria-hidden="true" />
                    <span>
                      {(item.content || []).map((c) => renderInlineText(c.content)).join(" ")}
                    </span>
                  </div>
                ))}
              </div>
            );
          }
          case "table": {
            const rows = node.content || [];
            return (
              <div key={index} className="tpl-prev-table-wrap">
                <table className="tpl-prev-table">
                  <tbody>
                    {rows.slice(0, 4).map((row, rIdx) => (
                      <tr key={rIdx}>
                        {(row.content || []).map((cell, cIdx) => {
                          const cellText = (cell.content || [])
                            .map((c) => renderInlineText(c.content))
                            .join(" ");
                          return rIdx === 0 ? (
                            <th key={cIdx}>{cellText}</th>
                          ) : (
                            <td key={cIdx}>{cellText}</td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          case "toggle": {
            const title = interpolateTemplatePlaceholders(String(node.attrs?.title || "Bloco expansível"));
            return (
              <div key={index} className="tpl-prev-toggle">
                <span className="tpl-prev-toggle-caret">▸</span>
                <span>{title}</span>
              </div>
            );
          }
          case "mermaid": {
            const caption = String(node.attrs?.caption || "Diagrama Mermaid");
            return (
              <div key={index} className="tpl-prev-special">
                <strong>Diagrama Mermaid</strong>
                <span>{caption}</span>
              </div>
            );
          }
          case "mathBlock": {
            const latex = String(node.attrs?.latex || "");
            return (
              <div key={index} className="tpl-prev-special">
                <strong>Fórmula KaTeX</strong>
                <code>{latex}</code>
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

export function NoteTemplatesModal({
  open,
  activeNote,
  activeNoteHasContent,
  customTemplates,
  onClose,
  onApplyTemplate,
  onSaveCustomTemplate,
  onDeleteCustomTemplate,
}: NoteTemplatesModalProps) {
  const [category, setCategory] = useState<"all" | NoteTemplateCategory>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>(BUILTIN_NOTE_TEMPLATES[0].id);
  const [applyTags, setApplyTags] = useState(true);
  const [createMode, setCreateMode] = useState(false);

  // Formulário "Salvar nota atual como template"
  const [tplName, setTplName] = useState("");
  const [tplDescription, setTplDescription] = useState("");
  const [tplCategory, setTplCategory] = useState<NoteTemplateCategory>("corporate");
  const [tplDefaultTitle, setTplDefaultTitle] = useState("");
  const [tplSaving, setTplSaving] = useState(false);
  const [tplError, setTplError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allTemplates = useMemo(
    () => [
      ...customTemplates.map((t) => ({ ...t, builtIn: false })),
      ...BUILTIN_NOTE_TEMPLATES,
    ],
    [customTemplates]
  );

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return allTemplates.filter((tpl) => {
      if (category === "custom") {
        if (tpl.builtIn) return false;
      } else if (category !== "all" && tpl.category !== category) {
        return false;
      }
      if (!q) return true;
      return (
        tpl.name.toLocaleLowerCase().includes(q) ||
        tpl.description.toLocaleLowerCase().includes(q) ||
        (tpl.tags || []).some((t) => t.toLocaleLowerCase().includes(q)) ||
        (TEMPLATE_CATEGORY_LABELS[tpl.category] || "").toLocaleLowerCase().includes(q)
      );
    });
  }, [allTemplates, category, search]);

  const selectedTemplate = useMemo(
    () =>
      filteredTemplates.find((t) => t.id === selectedId) ||
      filteredTemplates[0] ||
      null,
    [filteredTemplates, selectedId]
  );

  useEffect(() => {
    if (!open) return;
    setCreateMode(false);
    setTplError("");
    setConfirmDeleteId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const openSaveCurrentForm = () => {
    if (!activeNote) return;
    setTplName(activeNote.title?.trim() ? `Modelo: ${activeNote.title.trim()}` : "");
    setTplDefaultTitle(activeNote.title?.trim() || "");
    setTplDescription("");
    setTplCategory("corporate");
    setTplError("");
    setCreateMode(true);
  };

  const handleSaveTemplateSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeNote) return;
    if (!tplName.trim()) {
      setTplError("Informe um nome para o template.");
      return;
    }
    setTplSaving(true);
    setTplError("");
    try {
      const saved = await onSaveCustomTemplate({
        name: tplName.trim(),
        description:
          tplDescription.trim() || "Modelo personalizado salvo a partir de uma nota.",
        category: tplCategory,
        defaultTitle: tplDefaultTitle.trim() || tplName.trim(),
        body: activeNote.body || "",
        tags: activeNote.tags ?? [],
      });
      if (saved) {
        setCreateMode(false);
        setCategory("custom");
        setSelectedId(saved.id);
      }
    } catch (err) {
      setTplError(
        err instanceof Error ? err.message : "Não foi possível salvar o template."
      );
    } finally {
      setTplSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="dialog-backdrop templates-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="templates-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Galeria de Templates de Notas"
      >
        <header className="templates-modal-header">
          <div className="templates-modal-title-group">
            <div className="templates-modal-brand">
              <LayoutTemplate size={18} aria-hidden="true" />
            </div>
            <div>
              <h2>Galeria de Templates</h2>
              <p>Modelos prontos para reuniões, produto, briefings, estudos e rotina pessoal</p>
            </div>
          </div>

          <div className="templates-modal-header-actions">
            {activeNote && activeNoteHasContent && !createMode && (
              <button
                type="button"
                className="templates-save-current-btn"
                onClick={openSaveCurrentForm}
                title="Salvar o conteúdo desta nota como um novo template reutilizável"
              >
                <Plus size={14} aria-hidden="true" />
                <span>Salvar nota como template</span>
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              title="Fechar galeria (Esc)"
              aria-label="Fechar galeria de templates"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        {createMode ? (
          <form className="templates-create-form" onSubmit={(e) => void handleSaveTemplateSubmit(e)}>
            <div className="templates-create-intro">
              <Sparkles size={16} aria-hidden="true" />
              <div>
                <strong>Salvar nota atual como template personalizado</strong>
                <p>
                  Toda a formatação TipTap (tabelas, checklists, callouts, diagramas e fórmulas) será preservada em <em>Meus Templates</em>.
                </p>
              </div>
            </div>

            <div className="templates-form-grid">
              <label className="templates-form-field">
                <span>Nome do template *</span>
                <input
                  type="text"
                  value={tplName}
                  onChange={(e) => setTplName(e.target.value)}
                  placeholder="Ex.: Pauta Semanal do Comitê"
                  autoFocus
                />
              </label>

              <label className="templates-form-field">
                <span>Categoria</span>
                <CustomSelect
                  value={tplCategory}
                  options={[
                    { value: "corporate", label: "Corporativo & Reuniões" },
                    { value: "product", label: "Produto & PO" },
                    { value: "briefings", label: "Briefings & Projetos" },
                    { value: "academic", label: "Acadêmico & Pesquisa" },
                    { value: "personal", label: "Pessoal & Diário" },
                    { value: "custom", label: "Meus Templates" },
                  ]}
                  onChange={(val) => setTplCategory(val as NoteTemplateCategory)}
                  ariaLabel="Categoria do template"
                />
              </label>

              <label className="templates-form-field full">
                <span>Título padrão ao criar nota (opcional — aceita {"{{hoje}}"})</span>
                <input
                  type="text"
                  value={tplDefaultTitle}
                  onChange={(e) => setTplDefaultTitle(e.target.value)}
                  placeholder="Ex.: Reunião Comitê — {{hoje}}"
                />
              </label>

              <label className="templates-form-field full">
                <span>Descrição curta</span>
                <input
                  type="text"
                  value={tplDescription}
                  onChange={(e) => setTplDescription(e.target.value)}
                  placeholder="Para que serve este modelo e quando usá-lo..."
                />
              </label>
            </div>

            {tplError && <p className="dialog-error">{tplError}</p>}

            <footer className="templates-create-footer">
              <button
                type="button"
                className="templates-btn-secondary"
                onClick={() => setCreateMode(false)}
                disabled={tplSaving}
              >
                Voltar à galeria
              </button>
              <button
                type="submit"
                className="templates-btn-primary"
                disabled={tplSaving}
              >
                <Check size={14} aria-hidden="true" />
                <span>{tplSaving ? "Salvando..." : "Salvar template"}</span>
              </button>
            </footer>
          </form>
        ) : (
          <>
            <div className="templates-toolbar">
              <div className="templates-search-box">
                <Search size={14} aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nome, cenário (ex.: reunião, PRD, briefing, ABNT, diário)..."
                  aria-label="Buscar templates"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    className="templates-search-clear"
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>

              <div className="templates-categories" role="tablist" aria-label="Categorias de templates">
                {TEMPLATE_CATEGORIES.map((cat) => {
                  const count =
                    cat.id === "all"
                      ? allTemplates.length
                      : cat.id === "custom"
                        ? customTemplates.length
                        : allTemplates.filter((t) => t.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      role="tab"
                      aria-selected={category === cat.id}
                      className={`templates-cat-pill ${category === cat.id ? "active" : ""}`}
                      onClick={() => setCategory(cat.id)}
                    >
                      <span>{cat.shortLabel}</span>
                      <span className="templates-cat-count">{count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="templates-body">
              <div className="templates-grid-pane">
                {filteredTemplates.length === 0 ? (
                  <div className="templates-empty-state">
                    <LayoutTemplate size={28} aria-hidden="true" />
                    <strong>
                      {category === "custom"
                        ? "Nenhum template personalizado salvo ainda"
                        : "Nenhum template encontrado"}
                    </strong>
                    <p>
                      {category === "custom"
                        ? "Escreva uma nota estruturada e clique em \"Salvar nota como template\" para reutilizá-la sempre que precisar."
                        : "Tente buscar por outro termo ou selecione outra categoria."}
                    </p>
                  </div>
                ) : (
                  <div className="templates-grid">
                    {filteredTemplates.map((tpl) => {
                      const isSelected = selectedTemplate?.id === tpl.id;
                      return (
                        <button
                          key={tpl.id}
                          type="button"
                          className={`template-card ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedId(tpl.id);
                            setConfirmDeleteId(null);
                          }}
                          onDoubleClick={() => {
                            if (!activeNoteHasContent) {
                              onApplyTemplate(tpl, "replace", applyTags);
                            }
                          }}
                        >
                          <div className="template-card-top">
                            <span className={`template-card-icon cat-${tpl.category}`}>
                              {renderTemplateIcon(tpl.icon, 15)}
                            </span>
                            <span className="template-card-cat">
                              {tpl.builtIn
                                ? TEMPLATE_CATEGORY_LABELS[tpl.category] || "Geral"
                                : "Personalizado"}
                            </span>
                          </div>
                          <strong className="template-card-name">{tpl.name}</strong>
                          <p className="template-card-desc">{tpl.description}</p>
                          {tpl.features && tpl.features.length > 0 && (
                            <div className="template-card-features">
                              {tpl.features.map((feat) => (
                                <span key={feat} className="template-feature-chip">
                                  {feat}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <aside className="templates-preview-pane" aria-label="Pré-visualização do template">
                {selectedTemplate ? (
                  <>
                    <div className="templates-preview-head">
                      <div className="templates-preview-title-row">
                        <span className={`template-card-icon cat-${selectedTemplate.category}`}>
                          {renderTemplateIcon(selectedTemplate.icon, 16)}
                        </span>
                        <div className="templates-preview-title-meta">
                          <h3>{selectedTemplate.name}</h3>
                          <span>
                            {TEMPLATE_CATEGORY_LABELS[selectedTemplate.category] || "Personalizado"}
                          </span>
                        </div>
                        {!selectedTemplate.builtIn && (
                          confirmDeleteId === selectedTemplate.id ? (
                            <button
                              type="button"
                              className="templates-delete-confirm-btn"
                              onClick={() => {
                                void onDeleteCustomTemplate(selectedTemplate.id);
                                setConfirmDeleteId(null);
                              }}
                            >
                              Confirmar exclusão
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="icon-button danger-button"
                              onClick={() => setConfirmDeleteId(selectedTemplate.id)}
                              title="Excluir template personalizado"
                              aria-label="Excluir template personalizado"
                            >
                              <Trash2 size={14} aria-hidden="true" />
                            </button>
                          )
                        )}
                      </div>
                      <p className="templates-preview-desc">{selectedTemplate.description}</p>
                      {selectedTemplate.tags && selectedTemplate.tags.length > 0 && (
                        <div className="templates-preview-tags">
                          {selectedTemplate.tags.map((tag) => (
                            <span key={tag} className="templates-preview-tag">
                              <Hash size={10} aria-hidden="true" />
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="templates-preview-scroll">
                      <div className="templates-preview-paper">
                        <div className="templates-preview-doc-title">
                          {interpolateTemplatePlaceholders(
                            selectedTemplate.defaultTitle || selectedTemplate.name
                          )}
                        </div>
                        <TemplateDocPreview body={selectedTemplate.body} />
                      </div>
                    </div>

                    <footer className="templates-preview-footer">
                      {selectedTemplate.tags && selectedTemplate.tags.length > 0 && (
                        <label className="templates-apply-tags-check">
                          <input
                            type="checkbox"
                            checked={applyTags}
                            onChange={(e) => setApplyTags(e.target.checked)}
                          />
                          <span>Adicionar etiquetas sugeridas à nota</span>
                        </label>
                      )}

                      <div className="templates-apply-actions">
                        {activeNoteHasContent ? (
                          <>
                            <button
                              type="button"
                              className="templates-btn-primary"
                              onClick={() => onApplyTemplate(selectedTemplate, "append", applyTags)}
                              title="Adiciona o template ao final do texto atual sem apagar nada"
                            >
                              <Plus size={14} aria-hidden="true" />
                              <span>Inserir ao final</span>
                            </button>
                            <button
                              type="button"
                              className="templates-btn-secondary"
                              onClick={() => onApplyTemplate(selectedTemplate, "replace", applyTags)}
                              title="Substitui o conteúdo da nota atual por este template"
                            >
                              Substituir nota
                            </button>
                            <button
                              type="button"
                              className="templates-btn-ghost"
                              onClick={() => onApplyTemplate(selectedTemplate, "new-note", applyTags)}
                              title="Cria uma nova nota na pasta atual usando este template"
                            >
                              <FilePlus2 size={14} aria-hidden="true" />
                              <span>Nova nota</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="templates-btn-primary"
                              onClick={() => onApplyTemplate(selectedTemplate, "replace", applyTags)}
                            >
                              <Check size={14} aria-hidden="true" />
                              <span>Usar este template</span>
                            </button>
                            <button
                              type="button"
                              className="templates-btn-ghost"
                              onClick={() => onApplyTemplate(selectedTemplate, "new-note", applyTags)}
                              title="Criar uma nova nota separada com este template"
                            >
                              <FilePlus2 size={14} aria-hidden="true" />
                              <span>Criar nova nota</span>
                            </button>
                          </>
                        )}
                      </div>
                    </footer>
                  </>
                ) : (
                  <div className="templates-empty-state">
                    <LayoutTemplate size={26} aria-hidden="true" />
                    <p>Selecione um template à esquerda para pré-visualizar sua estrutura.</p>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

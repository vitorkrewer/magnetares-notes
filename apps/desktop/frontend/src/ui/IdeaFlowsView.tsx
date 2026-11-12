import { IdeaReferenceKind } from "./IdeaNodeLinkModal";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Copy,
  Edit2,
  ExternalLink,
  GitBranch,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { IdeaFlowCanvas } from "./IdeaFlowCanvas";
import { getIdeaFlowIconComponent, resolveIdeaFlowColorHex } from "./IdeaFlowDialog";
import {
  IdeaFlowGraphRecord,
  IdeaFlowRecord,
  NavigationRecord,
  SaveIdeaFlowGraphInput,
} from "./types";

type HubViewMode = "cards" | "list";

const VIEW_MODE_STORAGE_KEY = "magnetares_idea_flows_view_mode";

export type IdeaFlowsViewProps = {
  flows: IdeaFlowRecord[];
  selectedFlowId: string | null;
  onSelectFlow: (flowId: string | null) => void;
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onNewFlow: () => void;
  onEditFlow: (flow: IdeaFlowRecord) => void;
  onDuplicateFlow: (flow: IdeaFlowRecord) => Promise<void> | void;
  onDeleteFlow: (flow: IdeaFlowRecord) => void;
  onGraphSaved?: (flow: IdeaFlowRecord) => void;
  onNavigateToReference: (kind: IdeaReferenceKind, id: string) => void;
  navigation?: NavigationRecord;
  theme?: "light" | "dark";
  demoGraphs?: Record<string, IdeaFlowGraphRecord>;
  onSaveDemoGraph?: (input: SaveIdeaFlowGraphInput) => IdeaFlowGraphRecord;
};

function formatRelativeDate(value: string): string {
  if (!value) return "Agora";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Agora";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `Hoje, ${new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)}`;
  }
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: date.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  }).format(date);
}

function formatCounts(nodeCount: number, edgeCount: number): string {
  const nLabel = nodeCount === 1 ? "nó" : "nós";
  const eLabel = edgeCount === 1 ? "conexão" : "conexões";
  return `${nodeCount} ${nLabel} · ${edgeCount} ${eLabel}`;
}

export function IdeaFlowsView({
  flows,
  selectedFlowId,
  onSelectFlow,
  sidebarOpen,
  onOpenSidebar,
  onNewFlow,
  onEditFlow,
  onDuplicateFlow,
  onDeleteFlow,
  onGraphSaved,
  onNavigateToReference,
  navigation,
  theme,
  demoGraphs,
  onSaveDemoGraph,
}: IdeaFlowsViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<HubViewMode>(() => {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === "list" ? "list" : "cards";
  });

  const activeFlow = useMemo(
    () => (selectedFlowId ? flows.find((f) => f.id === selectedFlowId) ?? null : null),
    [flows, selectedFlowId]
  );

  const filteredFlows = useMemo(() => {
    const needle = searchQuery.trim().toLocaleLowerCase();
    if (!needle) return flows;
    return flows.filter(
      (flow) =>
        flow.title.toLocaleLowerCase().includes(needle) ||
        (flow.description || "").toLocaleLowerCase().includes(needle)
    );
  }, [flows, searchQuery]);

  const handleSetViewMode = (mode: HubViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  };

  if (activeFlow) {
    return (
      <IdeaFlowCanvas
        flow={activeFlow}
        sidebarOpen={sidebarOpen}
        onOpenSidebar={onOpenSidebar}
        onBack={() => onSelectFlow(null)}
        onGraphSaved={onGraphSaved}
        onNavigateToReference={onNavigateToReference}
        navigation={navigation}
        theme={theme}
        demoGraph={demoGraphs?.[activeFlow.id]}
        onSaveDemoGraph={onSaveDemoGraph}
      />
    );
  }

  return (
    <section className="idea-hub-shell" aria-label="Hub de Fluxo de Ideias">
      <header className="idea-hub-header">
        <div className="idea-hub-title-row">
          <div className="idea-hub-title-group">
            {!sidebarOpen && (
              <button
                type="button"
                className="icon-button"
                onClick={onOpenSidebar}
                title="Mostrar barra lateral"
                aria-label="Mostrar barra lateral"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            )}
            <div className="idea-hub-brand-icon">
              <GitBranch size={20} aria-hidden="true" />
            </div>
            <div>
              <h1>Fluxo de Ideias</h1>
              <p>
                Mapas mentais e diagramas conectados às suas notas, listas de tarefas e stickers.
              </p>
            </div>
          </div>

          <div className="idea-hub-actions">
            <div className="idea-view-toggle" role="group" aria-label="Modo de visualização">
              <button
                type="button"
                className={viewMode === "cards" ? "active" : ""}
                onClick={() => handleSetViewMode("cards")}
                title="Visualização em Cards"
                aria-pressed={viewMode === "cards"}
              >
                <LayoutGrid size={15} aria-hidden="true" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={() => handleSetViewMode("list")}
                title="Visualização em Lista"
                aria-pressed={viewMode === "list"}
              >
                <ListIcon size={15} aria-hidden="true" />
                <span>Lista</span>
              </button>
            </div>

            <button
              type="button"
              className="idea-primary-btn"
              onClick={onNewFlow}
            >
              <Plus size={16} aria-hidden="true" />
              <span>Novo Fluxo de Ideias</span>
            </button>
          </div>
        </div>

        <div className="idea-hub-toolbar">
          <label className="idea-hub-search">
            <Search size={15} aria-hidden="true" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
              placeholder="Buscar fluxos por título ou descrição..."
              aria-label="Buscar fluxos de ideias"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                title="Limpar busca"
                aria-label="Limpar busca"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </label>
          <span className="idea-hub-count">
            {filteredFlows.length} {filteredFlows.length === 1 ? "fluxo" : "fluxos"}
          </span>
        </div>
      </header>

      <div className="idea-hub-body">
        {flows.length === 0 ? (
          <div className="idea-hub-empty">
            <div className="idea-hub-empty-icon">
              <Sparkles size={28} aria-hidden="true" />
            </div>
            <h2>Crie seu primeiro Fluxo de Ideias</h2>
            <p>
              Visualize arquiteturas, brainstormings e conexões entre seus projetos em um espaço
              vetorial interativo.
            </p>
            <button type="button" className="idea-primary-btn" onClick={onNewFlow}>
              <Plus size={16} aria-hidden="true" />
              <span>Criar Primeiro Mapa Mental</span>
            </button>
          </div>
        ) : filteredFlows.length === 0 ? (
          <div className="idea-hub-empty">
            <div className="idea-hub-empty-icon">
              <Search size={24} aria-hidden="true" />
            </div>
            <h2>Nenhum fluxo encontrado</h2>
            <p>Nenhum mapa mental corresponde a "{searchQuery}".</p>
            <button
              type="button"
              className="idea-back-button"
              onClick={() => setSearchQuery("")}
            >
              Limpar filtro
            </button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="idea-cards-grid">
            {filteredFlows.map((flow) => {
              const colorHex = resolveIdeaFlowColorHex(flow.color);
              const IconComp = getIdeaFlowIconComponent(flow.icon);
              return (
                <article
                  key={flow.id}
                  className="idea-card"
                  onClick={() => onSelectFlow(flow.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectFlow(flow.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir fluxo ${flow.title}`}
                >
                  <div className="idea-card-accent" style={{ backgroundColor: colorHex }} />
                  <div className="idea-card-top">
                    <span
                      className="idea-flow-icon-badge"
                      style={{ backgroundColor: `${colorHex}1f`, color: colorHex }}
                    >
                      <IconComp size={18} aria-hidden="true" />
                    </span>
                    <div
                      className="idea-card-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="idea-action-btn"
                        title="Abrir"
                        aria-label={`Abrir ${flow.title}`}
                        onClick={() => onSelectFlow(flow.id)}
                      >
                        <ExternalLink size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="idea-action-btn"
                        title="Editar"
                        aria-label={`Editar ${flow.title}`}
                        onClick={() => onEditFlow(flow)}
                      >
                        <Edit2 size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="idea-action-btn"
                        title="Duplicar"
                        aria-label={`Duplicar ${flow.title}`}
                        onClick={() => void onDuplicateFlow(flow)}
                      >
                        <Copy size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="idea-action-btn danger"
                        title="Excluir"
                        aria-label={`Excluir ${flow.title}`}
                        onClick={() => onDeleteFlow(flow)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="idea-card-content">
                    <h3>{flow.title}</h3>
                    <p>
                      {flow.description?.trim()
                        ? flow.description
                        : "Sem descrição. Clique para abrir e editar no canvas."}
                    </p>
                  </div>

                  <footer className="idea-card-footer">
                    <span className="idea-card-stats">
                      {formatCounts(flow.nodeCount ?? 0, flow.edgeCount ?? 0)}
                    </span>
                    <span className="idea-card-date">
                      {formatRelativeDate(flow.updatedAt)}
                    </span>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="idea-list-table-wrap">
            <table className="idea-list-table">
              <thead>
                <tr>
                  <th>Fluxo</th>
                  <th>Descrição</th>
                  <th>Estrutura</th>
                  <th>Última edição</th>
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredFlows.map((flow) => {
                  const colorHex = resolveIdeaFlowColorHex(flow.color);
                  const IconComp = getIdeaFlowIconComponent(flow.icon);
                  return (
                    <tr
                      key={flow.id}
                      className="idea-list-row"
                      onClick={() => onSelectFlow(flow.id)}
                    >
                      <td>
                        <div className="idea-list-title-cell">
                          <span
                            className="idea-list-color-dot"
                            style={{ backgroundColor: colorHex }}
                          />
                          <span
                            className="idea-flow-icon-badge small"
                            style={{ backgroundColor: `${colorHex}1f`, color: colorHex }}
                          >
                            <IconComp size={15} aria-hidden="true" />
                          </span>
                          <strong>{flow.title}</strong>
                        </div>
                      </td>
                      <td className="idea-list-desc-cell">
                        {flow.description?.trim() ? flow.description : "—"}
                      </td>
                      <td className="idea-list-stats-cell">
                        {formatCounts(flow.nodeCount ?? 0, flow.edgeCount ?? 0)}
                      </td>
                      <td className="idea-list-date-cell">
                        {formatRelativeDate(flow.updatedAt)}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="idea-list-actions">
                          <button
                            type="button"
                            className="idea-action-btn"
                            title="Abrir"
                            aria-label={`Abrir ${flow.title}`}
                            onClick={() => onSelectFlow(flow.id)}
                          >
                            <ExternalLink size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="idea-action-btn"
                            title="Editar"
                            aria-label={`Editar ${flow.title}`}
                            onClick={() => onEditFlow(flow)}
                          >
                            <Edit2 size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="idea-action-btn"
                            title="Duplicar"
                            aria-label={`Duplicar ${flow.title}`}
                            onClick={() => void onDuplicateFlow(flow)}
                          >
                            <Copy size={14} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className="idea-action-btn danger"
                            title="Excluir"
                            aria-label={`Excluir ${flow.title}`}
                            onClick={() => onDeleteFlow(flow)}
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

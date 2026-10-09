import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Plus,
  Search,
  X,
  Calendar,
  Flag,
  FileText,
  ListTodo,
  Trash2,
  ChevronRight,
  CheckSquare,
  Clock,
  Edit2,
  Sparkles,
} from "lucide-react";
import { TaskListRecord, TaskRecord, SubtaskRecord, TaskNoteRecord } from "./types";
import { getTaskListIconComponent, TASK_LIST_PALETTE } from "./TaskListDialog";

export type TaskListViewProps = {
  list: TaskListRecord;
  allLists: TaskListRecord[];
  sidebarOpen: boolean;
  onOpenSidebar: () => void;
  onEditList: (list: TaskListRecord) => void;
  onDeleteList: (list: TaskListRecord) => void;
  onTaskCountChange: (listId: string, count: number) => void;
  refreshKey?: string | number;
};

const PRIORITY_CONFIG = [
  { value: 0, label: "Nenhuma", color: "var(--muted, #888)", bg: "transparent", border: "var(--border, #ccc)" },
  { value: 1, label: "Alta", color: "#ef4444", bg: "rgba(239, 68, 68, 0.12)", border: "#ef4444" },
  { value: 2, label: "Média", color: "#f97316", bg: "rgba(249, 115, 22, 0.12)", border: "#f97316" },
  { value: 3, label: "Baixa", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.12)", border: "#3b82f6" },
] as const;

export function parseTaskNotes(rawNotes?: string | null): TaskNoteRecord[] {
  if (!rawNotes || !rawNotes.trim()) return [];
  try {
    const parsed = JSON.parse(rawNotes);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => ({
        id: item.id || crypto.randomUUID(),
        title: item.title || "",
        content: item.content || item.body || "",
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
      }));
    }
  } catch {
    // Compatibilidade com nota legada de texto simples
  }
  return [
    {
      id: "legacy-note-1",
      title: "",
      content: rawNotes.trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

export function serializeTaskNotes(notes: TaskNoteRecord[]): string {
  if (notes.length === 0) return "";
  return JSON.stringify(notes);
}

function formatDueDate(dueDateStr?: string | null): { text: string; isOverdue: boolean; isToday: boolean } {
  if (!dueDateStr) return { text: "", isOverdue: false, isToday: false };

  const [year, month, day] = dueDateStr.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = target.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      text: target.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
      isOverdue: true,
      isToday: false,
    };
  }
  if (diffDays === 0) {
    return { text: "Hoje", isOverdue: false, isToday: true };
  }
  if (diffDays === 1) {
    return { text: "Amanhã", isOverdue: false, isToday: false };
  }
  return {
    text: target.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
    isOverdue: false,
    isToday: false,
  };
}

export function TaskListView({
  list,
  allLists,
  sidebarOpen,
  onOpenSidebar,
  onEditList,
  onDeleteList,
  onTaskCountChange,
  refreshKey,
}: TaskListViewProps) {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Quick-Add bar state
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState<number>(0);
  const [quickDueDate, setQuickDueDate] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Inspector details editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editPriority, setEditPriority] = useState<number>(0);
  const [editDueDate, setEditDueDate] = useState<string>("");
  const [editListId, setEditListId] = useState<string>(list.id);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  // Multiple Notes state 
  const [taskNotes, setTaskNotes] = useState<TaskNoteRecord[]>([]);
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");

  const quickInputRef = useRef<HTMLInputElement>(null);

  const IconComponent = getTaskListIconComponent(list.icon);
  const listColorHex = TASK_LIST_PALETTE.find((c) => c.id === list.color)?.hex ?? "#3b82f6";

  // Load tasks for current list
  const loadTasks = async () => {
    setIsLoading(true);
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.ListTasks) {
        const loaded = await bridge.ListTasks(list.id, true);
        setTasks(loaded);
        const openCount = loaded.filter((t) => !t.completed).length;
        onTaskCountChange(list.id, openCount);

        // Se uma tarefa estava selecionada, atualiza dados dela
        if (selectedTask) {
          const fresh = loaded.find((t) => t.id === selectedTask.id);
          if (fresh) {
            setSelectedTask(fresh);
            setEditTitle(fresh.title);
            setEditPriority(fresh.priority);
            setEditDueDate(fresh.dueDate || "");
            setEditListId(fresh.listId);
            setTaskNotes(parseTaskNotes(fresh.notes));
          } else {
            setSelectedTask(null);
          }
        }
      }
    } catch (err) {
      console.error("Falha ao carregar tarefas:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTasks();
    setSelectedTask(null);
  }, [list.id, refreshKey]);

  // Sincroniza campos do inspector sempre que a tarefa selecionada mudar
  useEffect(() => {
    if (selectedTask) {
      setEditTitle(selectedTask.title);
      setIsEditingTitle(false);
      setEditPriority(selectedTask.priority);
      setEditDueDate(selectedTask.dueDate || "");
      setEditListId(selectedTask.listId);
      setTaskNotes(parseTaskNotes(selectedTask.notes));
      setIsAddingNote(false);
      setEditingNoteId(null);
      setNewSubtaskTitle("");
    }
  }, [selectedTask?.id]);

  // Carrega detalhes completos da tarefa ao selecionar (com subtarefas)
  const handleSelectTask = async (task: TaskRecord) => {
    // Imediatamente atualiza o estado local para resposta instantânea na UI
    setSelectedTask(task);
    setEditTitle(task.title);
    setIsEditingTitle(false);
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate || "");
    setEditListId(task.listId);
    setTaskNotes(parseTaskNotes(task.notes));
    setIsAddingNote(false);
    setEditingNoteId(null);

    try {
      const bridge = window.go?.main?.App;
      if (bridge?.GetTaskWithSubtasks) {
        const fullTask = await bridge.GetTaskWithSubtasks(task.id);
        setSelectedTask(fullTask);
        setEditTitle(fullTask.title);
        setEditPriority(fullTask.priority);
        setEditDueDate(fullTask.dueDate || "");
        setEditListId(fullTask.listId);
        setTaskNotes(parseTaskNotes(fullTask.notes));
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes completos da tarefa:", err);
    }
  };

  // Quick Add Task
  const handleQuickAdd = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.SaveTask) {
        const newTask: TaskRecord = {
          id: crypto.randomUUID(),
          listId: list.id,
          title: trimmed,
          notes: "",
          completed: false,
          priority: quickPriority,
          dueDate: quickDueDate || null,
          position: 0,
          updatedAt: new Date().toISOString(),
        };

        const saved = await bridge.SaveTask(newTask);
        setTasks((prev) => [saved, ...prev]);
        setQuickTitle("");
        setQuickPriority(0);
        setQuickDueDate("");
        if (filter === "completed") {
          setFilter("all");
        }
        onTaskCountChange(list.id, tasks.filter((t) => !t.completed).length + 1);
      }
    } catch (err) {
      console.error("Falha ao salvar tarefa:", err);
    } finally {
      setIsSubmitting(false);
      quickInputRef.current?.focus();
    }
  };

  // Toggle Task Completed
  const handleToggleCompleted = async (task: TaskRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !task.completed;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.ToggleTaskCompleted) {
        await bridge.ToggleTaskCompleted(task.id, nextState);
        const completedAt = nextState ? new Date().toISOString() : null;
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, completed: nextState, completedAt } : t))
        );
        if (selectedTask?.id === task.id) {
          setSelectedTask((curr) => (curr ? { ...curr, completed: nextState, completedAt } : null));
        }
        const openCount = tasks.filter((t) => (t.id === task.id ? !nextState : !t.completed)).length;
        onTaskCountChange(list.id, openCount);
      }
    } catch (err) {
      console.error("Falha ao alternar conclusão da tarefa:", err);
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm("Excluir esta tarefa permanentemente?")) return;

    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteTask) {
        await bridge.DeleteTask(taskId);
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
        }
        const openCount = tasks.filter((t) => t.id !== taskId && !t.completed).length;
        onTaskCountChange(list.id, openCount);
      }
    } catch (err) {
      console.error("Falha ao excluir tarefa:", err);
    }
  };

  // Save Task Detail Changes (Title, Priority, DueDate, List, Notes)
  const saveTaskDetails = async (overrides?: Partial<TaskRecord>) => {
    if (!selectedTask) return;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.SaveTask) {
        const updated: TaskRecord = {
          ...selectedTask,
          title: overrides?.title !== undefined ? overrides.title : editTitle.trim() || selectedTask.title,
          notes: overrides?.notes !== undefined ? overrides.notes : selectedTask.notes,
          priority: overrides?.priority !== undefined ? overrides.priority : editPriority,
          dueDate: overrides?.dueDate !== undefined ? overrides.dueDate : editDueDate || null,
          listId: overrides?.listId !== undefined ? overrides.listId : editListId,
          updatedAt: new Date().toISOString(),
        };

        const saved = await bridge.SaveTask(updated);
        setSelectedTask((prev) => (prev ? { ...prev, ...saved } : null));

        // Se moveu para outra lista, remove da lista atual
        if (saved.listId !== list.id) {
          setTasks((prev) => prev.filter((t) => t.id !== saved.id));
          setSelectedTask(null);
        } else {
          setTasks((prev) => prev.map((t) => (t.id === saved.id ? { ...t, ...saved } : t)));
        }
      }
    } catch (err) {
      console.error("Falha ao salvar detalhes da tarefa:", err);
    }
  };

  // Multiple Notes Actions 
  const handleAddNote = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newNoteContent.trim();
    if (!trimmed || !selectedTask) return;

    const newNoteItem: TaskNoteRecord = {
      id: crypto.randomUUID(),
      content: trimmed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextNotes = [...taskNotes, newNoteItem];
    setTaskNotes(nextNotes);
    setNewNoteContent("");
    setIsAddingNote(false);
    await saveTaskDetails({ notes: serializeTaskNotes(nextNotes) });
  };

  const handleSaveEditNote = async (noteId: string) => {
    const trimmed = editingNoteContent.trim();
    if (!trimmed || !selectedTask) return;

    const nextNotes = taskNotes.map((n) =>
      n.id === noteId ? { ...n, content: trimmed, updatedAt: new Date().toISOString() } : n
    );
    setTaskNotes(nextNotes);
    setEditingNoteId(null);
    setEditingNoteContent("");
    await saveTaskDetails({ notes: serializeTaskNotes(nextNotes) });
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!selectedTask) return;
    if (!window.confirm("Excluir esta anotação da tarefa?")) return;

    const nextNotes = taskNotes.filter((n) => n.id !== noteId);
    setTaskNotes(nextNotes);
    if (editingNoteId === noteId) {
      setEditingNoteId(null);
    }
    await saveTaskDetails({ notes: serializeTaskNotes(nextNotes) });
  };

  // Subtask Actions
  const handleAddSubtask = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newSubtaskTitle.trim();
    if (!trimmed || !selectedTask) return;

    try {
      const bridge = window.go?.main?.App;
      if (bridge?.SaveSubtask) {
        const sub: SubtaskRecord = {
          id: crypto.randomUUID(),
          taskId: selectedTask.id,
          title: trimmed,
          completed: false,
          position: 0,
          updatedAt: new Date().toISOString(),
        };
        const saved = await bridge.SaveSubtask(sub);
        const nextSubtasks = [...(selectedTask.subtasks || []), saved];
        setSelectedTask((prev) =>
          prev
            ? {
                ...prev,
                subtasks: nextSubtasks,
                subtaskTotal: (prev.subtaskTotal || 0) + 1,
              }
            : null
        );
        setTasks((prev) =>
          prev.map((t) =>
            t.id === selectedTask.id
              ? {
                  ...t,
                  subtaskTotal: (t.subtaskTotal || 0) + 1,
                }
              : t
          )
        );
        setNewSubtaskTitle("");
      }
    } catch (err) {
      console.error("Falha ao adicionar subtarefa:", err);
    }
  };

  const handleToggleSubtask = async (sub: SubtaskRecord) => {
    if (!selectedTask) return;
    const nextState = !sub.completed;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.ToggleSubtaskCompleted) {
        await bridge.ToggleSubtaskCompleted(sub.id, nextState);
        const completedAt = nextState ? new Date().toISOString() : null;
        const nextSubtasks = (selectedTask.subtasks || []).map((s) =>
          s.id === sub.id ? { ...s, completed: nextState, completedAt } : s
        );
        const doneCount = nextSubtasks.filter((s) => s.completed).length;

        setSelectedTask((prev) =>
          prev
            ? {
                ...prev,
                subtasks: nextSubtasks,
                subtaskDone: doneCount,
              }
            : null
        );
        setTasks((prev) =>
          prev.map((t) =>
            t.id === selectedTask.id
              ? {
                  ...t,
                  subtaskDone: doneCount,
                }
              : t
          )
        );
      }
    } catch (err) {
      console.error("Falha ao alternar subtarefa:", err);
    }
  };

  const handleDeleteSubtask = async (subId: string) => {
    if (!selectedTask) return;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteSubtask) {
        await bridge.DeleteSubtask(subId);
        const nextSubtasks = (selectedTask.subtasks || []).filter((s) => s.id !== subId);
        const doneCount = nextSubtasks.filter((s) => s.completed).length;
        setSelectedTask((prev) =>
          prev
            ? {
                ...prev,
                subtasks: nextSubtasks,
                subtaskTotal: nextSubtasks.length,
                subtaskDone: doneCount,
              }
            : null
        );
        setTasks((prev) =>
          prev.map((t) =>
            t.id === selectedTask.id
              ? {
                  ...t,
                  subtaskTotal: nextSubtasks.length,
                  subtaskDone: doneCount,
                }
              : t
          )
        );
      }
    } catch (err) {
      console.error("Falha ao excluir subtarefa:", err);
    }
  };

  // Filter and search tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "active" && t.completed) return false;
      if (filter === "completed" && !t.completed) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return t.title.toLowerCase().includes(q) || (t.notes && t.notes.toLowerCase().includes(q));
      }
      return true;
    });
  }, [tasks, filter, searchQuery]);

  const activeCount = useMemo(() => tasks.filter((t) => !t.completed).length, [tasks]);
  const completedCount = useMemo(() => tasks.filter((t) => t.completed).length, [tasks]);

  return (
    <div className="task-list-view-container">
      {/* Coluna Principal da Lista de Tarefas */}
      <section className="task-main-pane">
        {/* Header da Lista */}
        <header className="task-view-header">
          <div className="task-header-left">
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
            <div className="task-list-title-wrap">
              <span className="task-list-badge" style={{ backgroundColor: listColorHex }}>
                <IconComponent size={16} color="#fff" />
              </span>
              <h2>{list.name}</h2>
              <span className="task-count-pill">{activeCount} abertas</span>
            </div>
          </div>

          <div className="task-header-right">
            {/* Filtros rápidos */}
            <div className="task-filter-chips">
              <button
                type="button"
                className={`task-filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                Todas ({tasks.length})
              </button>
              <button
                type="button"
                className={`task-filter-btn ${filter === "active" ? "active" : ""}`}
                onClick={() => setFilter("active")}
              >
                Incompletas ({activeCount})
              </button>
              <button
                type="button"
                className={`task-filter-btn ${filter === "completed" ? "active" : ""}`}
                onClick={() => setFilter("completed")}
              >
                Concluídas ({completedCount})
              </button>
            </div>

            {/* Menu de ações da lista */}
            <button
              type="button"
              className="icon-button"
              onClick={() => onEditList(list)}
              title="Configurar lista"
              aria-label="Configurar lista"
            >
              <Edit2 size={16} />
            </button>
            {list.id !== "list-inbox" && (
              <button
                type="button"
                className="icon-button"
                onClick={() => onDeleteList(list)}
                title="Excluir lista"
                aria-label="Excluir lista"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </header>

        {/* Quick-Add Bar (Barra de entrada rápida) */}
        <form className="task-quick-add-bar" onSubmit={handleQuickAdd}>
          <div className="quick-add-input-wrap">
            <Plus size={18} className="quick-add-icon" />
            <input
              ref={quickInputRef}
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              placeholder="Adicionar uma tarefa... (pressione Enter para salvar)"
              maxLength={250}
              disabled={isSubmitting}
            />
          </div>

          <div className="quick-add-controls">
            {/* Prioridade Rápida */}
            <div className="quick-priority-picker" title="Definir prioridade">
              {[1, 2, 3, 0].map((pVal) => {
                const conf = PRIORITY_CONFIG[pVal as 0 | 1 | 2 | 3];
                const isSelected = quickPriority === pVal;
                return (
                  <button
                    key={pVal}
                    type="button"
                    className={`quick-priority-btn ${isSelected ? "selected" : ""}`}
                    onClick={() => setQuickPriority(pVal)}
                    style={{
                      borderColor: conf.border,
                      color: conf.color,
                      backgroundColor: isSelected ? conf.bg : "transparent",
                    }}
                    title={`Prioridade ${conf.label}`}
                  >
                    <Flag size={13} fill={pVal > 0 && isSelected ? conf.color : "none"} />
                  </button>
                );
              })}
            </div>

            {/* Prazo Rápido */}
            <label className="quick-date-picker" title="Data de vencimento">
              <Calendar size={14} className="quick-date-icon" />
              <input
                type="date"
                value={quickDueDate}
                onChange={(e) => setQuickDueDate(e.target.value)}
                className="quick-date-input"
              />
            </label>

            <button
              type="submit"
              className="quick-add-submit-btn"
              disabled={!quickTitle.trim() || isSubmitting}
              title="Adicionar tarefa"
            >
              Adicionar
            </button>
          </div>
        </form>

        {/* Campo de Busca Rápida na Lista */}
        {tasks.length > 3 && (
          <div className="task-search-bar">
            <Search size={14} className="task-search-icon" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filtrar tarefas nesta lista..."
            />
            {searchQuery && (
              <button type="button" className="task-search-clear" onClick={() => setSearchQuery("")}>
                <X size={13} />
              </button>
            )}
          </div>
        )}

        {/* Lista de Tarefas */}
        <div className="task-items-scroll">
          {isLoading ? (
            <div className="tasks-empty-state">
              <Clock size={32} className="tasks-spin" />
              <p>Carregando tarefas...</p>
            </div>
          ) : filteredTasks.length === 0 ? (
            <div className="tasks-empty-state">
              <CheckCircle2 size={44} style={{ color: listColorHex, opacity: 0.8 }} />
              <h3>Tudo em dia!</h3>
              <p>
                {filter === "completed"
                  ? "Nenhuma tarefa concluída nesta lista."
                  : filter === "active"
                  ? "Nenhuma tarefa pendente. Aproveite o momento ou adicione novas tarefas acima!"
                  : "Nenhuma tarefa cadastrada nesta lista."}
              </p>
              {filter === "completed" && activeCount > 0 && (
                <button
                  type="button"
                  className="task-filter-reset-link"
                  onClick={() => setFilter("all")}
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: "var(--accent, #3b82f6)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Ver tarefas em aberto ({activeCount})
                </button>
              )}
            </div>
          ) : (
            <ul className="task-items-list" role="list">
              {filteredTasks.map((task) => {
                const isSelected = selectedTask?.id === task.id;
                const priorityConf = PRIORITY_CONFIG[task.priority as 0 | 1 | 2 | 3] || PRIORITY_CONFIG[0];
                const dueInfo = formatDueDate(task.dueDate);
                const notesList = parseTaskNotes(task.notes);

                return (
                  <li
                    key={task.id}
                    className={`task-item-row ${task.completed ? "is-completed" : ""} ${
                      isSelected ? "is-selected" : ""
                    }`}
                    onClick={() => handleSelectTask(task)}
                    style={{
                      borderLeftColor: task.priority > 0 ? priorityConf.color : "transparent",
                    }}
                  >
                    {/* Botão de Checkbox */}
                    <button
                      type="button"
                      className="task-checkbox-btn"
                      onClick={(e) => handleToggleCompleted(task, e)}
                      title={task.completed ? "Marcar como não concluída" : "Concluir tarefa"}
                      aria-label={task.completed ? "Concluída" : "Pendente"}
                    >
                      {task.completed ? (
                        <CheckCircle2 size={19} className="task-check-icon-done" />
                      ) : (
                        <Circle size={19} className="task-check-icon-circle" />
                      )}
                    </button>

                    {/* Título e Metadados */}
                    <div className="task-item-content">
                      <span className="task-item-title">{task.title}</span>

                      <div className="task-item-meta">
                        {/* Prazo */}
                        {dueInfo.text && (
                          <span
                            className={`task-meta-tag task-due-tag ${
                              dueInfo.isOverdue ? "is-overdue" : dueInfo.isToday ? "is-today" : ""
                            }`}
                          >
                            <Calendar size={11} />
                            {dueInfo.text}
                          </span>
                        )}

                        {/* Subtarefas */}
                        {task.subtaskTotal && task.subtaskTotal > 0 ? (
                          <span className="task-meta-tag task-subtasks-tag">
                            <CheckSquare size={11} />
                            {task.subtaskDone || 0}/{task.subtaskTotal}
                          </span>
                        ) : null}

                        {/* Indicador de Notas Anexas (com contagem) */}
                        {notesList.length > 0 && (
                          <span
                            className="task-meta-tag task-notes-tag"
                            title={`${notesList.length} ${notesList.length === 1 ? "anotação" : "anotações"}`}
                          >
                            <FileText size={11} />
                            {notesList.length === 1 ? "1 nota" : `${notesList.length} notas`}
                          </span>
                        )}

                        {/* Prioridade alta/média badge */}
                        {task.priority > 0 && (
                          <span
                            className="task-meta-tag"
                            style={{
                              color: priorityConf.color,
                              backgroundColor: priorityConf.bg,
                              borderColor: priorityConf.border,
                            }}
                          >
                            <Flag size={10} fill={priorityConf.color} />
                            {priorityConf.label}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Botões rápidos ao passar o mouse */}
                    <div className="task-item-actions">
                      <button
                        type="button"
                        className="task-action-btn delete"
                        onClick={(e) => handleDeleteTask(task.id, e)}
                        title="Excluir tarefa"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Painel Lateral de Detalhes da Tarefa (Inspector Drawer) */}
      {selectedTask && (
        <aside className="task-inspector-pane" aria-label="Detalhes da tarefa">
          <header className="inspector-header">
            <div className="inspector-header-title">
              <button
                type="button"
                className="inspector-complete-toggle"
                onClick={(e) => handleToggleCompleted(selectedTask, e)}
              >
                {selectedTask.completed ? (
                  <>
                    <CheckCircle2 size={16} className="text-emerald-500" />
                    <span>Concluída</span>
                  </>
                ) : (
                  <>
                    <Circle size={16} />
                    <span>Marcar concluída</span>
                  </>
                )}
              </button>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSelectedTask(null)}
              title="Fechar painel de detalhes"
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </header>

          <div className="inspector-body">
            {/* Título da Tarefa: Exibição clara e edição inline */}
            <div className="inspector-title-container">
              {isEditingTitle ? (
                <input
                  type="text"
                  className="inspector-title-input active-edit"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    setIsEditingTitle(false);
                    void saveTaskDetails({ title: editTitle });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setIsEditingTitle(false);
                      void saveTaskDetails({ title: editTitle });
                    } else if (e.key === "Escape") {
                      setEditTitle(selectedTask.title);
                      setIsEditingTitle(false);
                    }
                  }}
                  autoFocus
                  maxLength={250}
                  placeholder="Nome da tarefa"
                />
              ) : (
                <div
                  className="inspector-title-display"
                  onClick={() => setIsEditingTitle(true)}
                  title="Clique para renomear esta tarefa"
                >
                  <h3 className="inspector-task-heading">{selectedTask.title || "Sem título"}</h3>
                  <button
                    type="button"
                    className="inspector-title-edit-btn"
                    aria-label="Editar título"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditingTitle(true);
                    }}
                  >
                    <Edit2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {/* Metadados: Lista, Prioridade, Prazo */}
            <div className="inspector-properties-grid">
              {/* Mover para Lista */}
              <div className="inspector-property-row">
                <span className="inspector-prop-label">
                  <ListTodo size={14} /> Lista
                </span>
                <select
                  value={editListId}
                  onChange={(e) => {
                    const nextListId = e.target.value;
                    setEditListId(nextListId);
                    void saveTaskDetails({ listId: nextListId });
                  }}
                  className="inspector-select"
                >
                  {allLists.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prioridade */}
              <div className="inspector-property-row">
                <span className="inspector-prop-label">
                  <Flag size={14} /> Prioridade
                </span>
                <select
                  value={editPriority}
                  onChange={(e) => {
                    const pVal = Number(e.target.value);
                    setEditPriority(pVal);
                    void saveTaskDetails({ priority: pVal });
                  }}
                  className="inspector-select"
                >
                  <option value={0}>Nenhuma</option>
                  <option value={1}>Alta (🔴 Vermelho)</option>
                  <option value={2}>Média (🟠 Laranja)</option>
                  <option value={3}>Baixa (🔵 Azul)</option>
                </select>
              </div>

              {/* Data de Vencimento */}
              <div className="inspector-property-row">
                <span className="inspector-prop-label">
                  <Calendar size={14} /> Vencimento
                </span>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => {
                    const dVal = e.target.value;
                    setEditDueDate(dVal);
                    void saveTaskDetails({ dueDate: dVal || null });
                  }}
                  className="inspector-date-input"
                />
              </div>
            </div>

            {/* Seção de Subtarefas (Checklist anexo) */}
            <div className="inspector-section">
              <div className="inspector-section-header">
                <h4>Subtarefas</h4>
                {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                  <span className="subtasks-counter">
                    {selectedTask.subtasks.filter((s) => s.completed).length}/{selectedTask.subtasks.length}
                  </span>
                )}
              </div>

              {/* Barra de progresso das subtarefas */}
              {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                <div className="subtask-progress-bar-bg">
                  <div
                    className="subtask-progress-bar-fill"
                    style={{
                      width: `${
                        (selectedTask.subtasks.filter((s) => s.completed).length / selectedTask.subtasks.length) * 100
                      }%`,
                      backgroundColor: listColorHex,
                    }}
                  />
                </div>
              )}

              {/* Lista de subtarefas */}
              <ul className="subtasks-list">
                {(selectedTask.subtasks || []).map((sub) => (
                  <li key={sub.id} className={`subtask-item ${sub.completed ? "is-done" : ""}`}>
                    <button
                      type="button"
                      className="subtask-checkbox"
                      onClick={() => handleToggleSubtask(sub)}
                      title={sub.completed ? "Reabrir subtarefa" : "Concluir subtarefa"}
                    >
                      {sub.completed ? (
                        <CheckCircle2 size={15} className="text-emerald-500" />
                      ) : (
                        <Circle size={15} />
                      )}
                    </button>
                    <span className="subtask-title">{sub.title}</span>
                    <button
                      type="button"
                      className="subtask-delete-btn"
                      onClick={() => handleDeleteSubtask(sub.id)}
                      title="Excluir subtarefa"
                    >
                      <X size={13} />
                    </button>
                  </li>
                ))}
              </ul>

              {/* Formulário para adicionar subtarefa */}
              <form onSubmit={handleAddSubtask} className="add-subtask-form">
                <input
                  type="text"
                  value={newSubtaskTitle}
                  onChange={(e) => setNewSubtaskTitle(e.target.value)}
                  placeholder="Adicionar um passo ou subtarefa..."
                  maxLength={200}
                />
                <button
                  type="submit"
                  disabled={!newSubtaskTitle.trim()}
                  className="add-subtask-btn"
                  title="Adicionar subtarefa"
                >
                  <Plus size={14} />
                </button>
              </form>
            </div>

            {/* Seção de Notas Múltiplas */}
            <div className="inspector-section">
              <div className="inspector-section-header">
                <h4>
                  <FileText size={14} style={{ display: "inline", marginRight: "6px" }} />
                  Notas ({taskNotes.length})
                </h4>
                {!isAddingNote && (
                  <button
                    type="button"
                    className="inspector-add-note-btn"
                    onClick={() => {
                      setIsAddingNote(true);
                      setNewNoteContent("");
                    }}
                    title="Adicionar nova anotação"
                  >
                    <Plus size={13} />
                    <span>Adicionar nota</span>
                  </button>
                )}
              </div>

              {/* Formulário para adicionar nova nota */}
              {isAddingNote && (
                <div className="task-note-editor-card">
                  <textarea
                    value={newNoteContent}
                    onChange={(e) => setNewNoteContent(e.target.value)}
                    placeholder="Escreva sua anotação..."
                    rows={3}
                    autoFocus
                    className="task-note-textarea"
                  />
                  <div className="task-note-editor-actions">
                    <button
                      type="button"
                      className="ghost-button mini"
                      onClick={() => {
                        setIsAddingNote(false);
                        setNewNoteContent("");
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="primary-button mini"
                      onClick={() => void handleAddNote()}
                      disabled={!newNoteContent.trim()}
                    >
                      Salvar nota
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de cards de notas */}
              {taskNotes.length === 0 && !isAddingNote ? (
                <div className="task-notes-empty">
                  <p>Nenhuma nota anexada a esta tarefa.</p>
                  <button
                    type="button"
                    className="task-notes-empty-add-btn"
                    onClick={() => setIsAddingNote(true)}
                  >
                    <Plus size={13} /> Adicionar uma nota
                  </button>
                </div>
              ) : (
                <div className="task-notes-list">
                  {taskNotes.map((note) => {
                    const isEditing = editingNoteId === note.id;
                    return (
                      <div key={note.id} className="task-note-card">
                        {isEditing ? (
                          <div className="task-note-editor-card inline">
                            <textarea
                              value={editingNoteContent}
                              onChange={(e) => setEditingNoteContent(e.target.value)}
                              rows={3}
                              autoFocus
                              className="task-note-textarea"
                            />
                            <div className="task-note-editor-actions">
                              <button
                                type="button"
                                className="ghost-button mini"
                                onClick={() => setEditingNoteId(null)}
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                className="primary-button mini"
                                onClick={() => void handleSaveEditNote(note.id)}
                                disabled={!editingNoteContent.trim()}
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="task-note-card-body">
                              <p className="task-note-card-text">{note.content}</p>
                            </div>
                            <div className="task-note-card-footer">
                              <span className="task-note-date">
                                {new Date(note.updatedAt || note.createdAt).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <div className="task-note-card-tools">
                                <button
                                  type="button"
                                  className="task-note-tool-btn"
                                  onClick={() => {
                                    setEditingNoteId(note.id);
                                    setEditingNoteContent(note.content);
                                  }}
                                  title="Editar nota"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="task-note-tool-btn delete"
                                  onClick={() => void handleDeleteNote(note.id)}
                                  title="Excluir nota"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <footer className="inspector-footer">
            <button
              type="button"
              className="inspector-delete-btn"
              onClick={() => handleDeleteTask(selectedTask.id)}
            >
              <Trash2 size={14} />
              <span>Excluir tarefa</span>
            </button>
          </footer>
        </aside>
      )}
    </div>
  );
}

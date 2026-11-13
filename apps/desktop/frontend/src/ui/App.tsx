import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Archive, ArchiveRestore, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Download, ExternalLink, FileCode, FileCode2, FileDown, FilePenLine, FileText, Folder, GitBranch, Globe, Hash, Link2, List, Minimize2, Moon, Network, PictureInPicture2, Pin, Plus, Printer, RotateCcw, Search, Settings, Sparkles, StickyNote, Sun, Trash2, Upload, X } from "lucide-react";
import { StructuredEditor } from "./StructuredEditor";
import { CodeEditor } from "./CodeEditor";
import { CustomSelect } from "./CustomSelect";
import { TitleBar } from "./TitleBar";
import { OrganizationDialog, getFolderIconComponent, getTagIconComponent } from "./OrganizationDialog";
import { SettingsDialog, type SettingsTab, type ThemeOption } from "./SettingsDialog";
import { ConflictDialog } from "./ConflictDialog";
import { StickerBoardDialog, STICKER_PALETTE, DelicateStickerIcon } from "./StickerBoardDialog";
import { StickerBoardView } from "./StickerBoardView";
import { TaskListDialog, TASK_LIST_PALETTE, getTaskListIconComponent } from "./TaskListDialog";
import { TaskListView } from "./TaskListView";
import { IdeaFlowDialog } from "./IdeaFlowDialog";
import { IdeaFlowsView } from "./IdeaFlowsView";
import type { IdeaReferenceKind } from "./IdeaNodeLinkModal";
import { ConnectionsGraphView, buildDemoConnectionsPayload } from "./ConnectionsGraphView";
import type { NoteLinkMeta } from "./NoteLinkNode";
import { AppInfoRecord, ConnectionsGraphPayload, DatabaseMigrationMode, FolderRecord, IdeaFlowGraphRecord, IdeaFlowRecord, NavigationRecord, Note, NoteConnectionSummary, NoteQuery, SaveIdeaFlowGraphInput, SaveIdeaFlowInput, SmartFolderRecord, StickerBoardRecord, SyncConfiguration, SyncConflict, SyncResult, TagRecord, TaskListRecord, UpdateCheckResultRecord } from "./types";
import { downloadBlob, downloadFile, exportToHTML, exportToMarkdown, parseImportedFile } from "./exportUtils";
import { exportToAbntDocxBase64, exportToAbntDocxBlob } from "./abntExport";
import { exportToPdfBase64, exportToPdfBlob } from "./pdfExport";

type SaveState = "saved" | "saving" | "error";
type LibraryView = "notes" | "deleted" | "stickers" | "tasks" | "ideas" | "connections";

const DEFAULT_APP_INFO: AppInfoRecord = {
  appName: "Magnetares Notes",
  version: "2.0.0",
  buildDate: "2026-11-12",
  description: "Caderno de anotações local-first, rápido e privado com suporte a Markdown rico, fórmulas científicas, tarefas, stickers e mapas mentais.",
  author: "Vitor Krewer",
  authorUrl: "https://www.linkedin.com/in/vitorkrewer/",
  repository: "https://github.com/vitorkrewer/magnetares-notes",
  website: "https://vitorkrewer.github.io/magnetares-notes/",
  license: "Source-Available (Uso Pessoal Não-Comercial)"
};

const demo: Note[] = [
  { id: "welcome", title: "Bem-vindo ao Magnetares", body: "Um lugar tranquilo para pensar, planejar e guardar o que importa.", bodyText: "Um lugar tranquilo para pensar, planejar e guardar o que importa.", folder: "Notas", updatedAt: new Date().toISOString() },
  { id: "ideas", title: "Ideias", body: "• Diário de projeto\n• Atalhos de teclado\n• Sincronização segura", bodyText: "• Diário de projeto\n• Atalhos de teclado\n• Sincronização segura", folder: "Notas", updatedAt: new Date(Date.now() - 7_200_000).toISOString() }
];

export function LanguageBadge({ language }: { language?: string }) {
  const devicons: Record<string, string> = {
    javascript: "devicon-javascript-plain colored",
    typescript: "devicon-typescript-plain colored",
    python: "devicon-python-plain colored",
    html: "devicon-html5-plain colored",
    css: "devicon-css3-plain colored",
    go: "devicon-go-original-wordmark colored",
    json: "devicon-json-plain colored",
    sql: "devicon-mysql-plain colored",
    markdown: "devicon-markdown-original",
    php: "devicon-php-plain colored",
    shell: "devicon-bash-plain colored",
    cpp: "devicon-cplusplus-plain colored",
    java: "devicon-java-plain colored",
    rust: "devicon-rust-plain",
    yaml: "devicon-yaml-plain colored"
  };

  const iconClass = devicons[language || ""];

  if (iconClass) {
    return (
      <i className={iconClass} style={{ fontSize: '15px', marginRight: '6px', verticalAlign: 'text-bottom' }} title={language} aria-hidden="true"></i>
    );
  }

  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '15px',
      height: '15px',
      borderRadius: '4px',
      backgroundColor: "#888888",
      color: "#ffffff",
      fontSize: '8px',
      fontWeight: 'bold',
      marginRight: '6px',
      verticalAlign: 'text-bottom',
      lineHeight: 1,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace"
    }} title={language} aria-hidden="true">
      {language ? language.substring(0, 2).toUpperCase() : "Tx"}
    </span>
  );
}

const dateLabel = (value: string) => {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
};

const fullDateLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "medium",
  timeStyle: "short"
}).format(new Date(value));

export function App() {
  const [notes, setNotes] = useState<Note[]>(demo);
  const [deletedNotes, setDeletedNotes] = useState<Note[]>([]);
  const [navigation, setNavigation] = useState<NavigationRecord>({ folders: [], tags: [], smartFolders: [], stickerBoards: [], taskLists: [] });
  const [selectedQuery, setSelectedQuery] = useState<NoteQuery>({ kind: "all" });
  const [view, setView] = useState<LibraryView>("notes");
  const [activeId, setActiveId] = useState("welcome");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dialogMode, setDialogMode] = useState<{ kind: "folder"; parentId?: string; folderToEdit?: FolderRecord } | { kind: "tag"; tagToEdit?: TagRecord } | { kind: "smart" } | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<FolderRecord | null>(null);
  const [deleteTagTarget, setDeleteTagTarget] = useState<TagRecord | null>(null);
  const [stickerBoardDialogOpen, setStickerBoardDialogOpen] = useState(false);
  const [boardToEdit, setBoardToEdit] = useState<StickerBoardRecord | undefined>(undefined);
  const [deleteBoardTarget, setDeleteBoardTarget] = useState<StickerBoardRecord | null>(null);
  const [taskListDialogOpen, setTaskListDialogOpen] = useState(false);
  const [listToEdit, setListToEdit] = useState<TaskListRecord | undefined>(undefined);
  const [deleteListTarget, setDeleteListTarget] = useState<TaskListRecord | null>(null);
  const [archivedListsExpanded, setArchivedListsExpanded] = useState(false);
  const [ideaFlows, setIdeaFlows] = useState<IdeaFlowRecord[]>([]);
  const [selectedIdeaFlowId, setSelectedIdeaFlowId] = useState<string | null>(null);
  const [ideaFlowDialogOpen, setIdeaFlowDialogOpen] = useState(false);
  const [ideaFlowToEdit, setIdeaFlowToEdit] = useState<IdeaFlowRecord | undefined>(undefined);
  const [deleteIdeaFlowTarget, setDeleteIdeaFlowTarget] = useState<IdeaFlowRecord | null>(null);
  const [demoIdeaGraphs, setDemoIdeaGraphs] = useState<Record<string, IdeaFlowGraphRecord>>({});
  const [connectionsGraph, setConnectionsGraph] = useState<ConnectionsGraphPayload>({ notes: [], links: [], tags: [], folders: [] });
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [activeNoteConnections, setActiveNoteConnections] = useState<NoteConnectionSummary[]>([]);
  const [noteLinksPanelOpen, setNoteLinksPanelOpen] = useState(false);
  const [noteLinksPanelTab, setNoteLinksPanelTab] = useState<"notes" | "tags" | "connected">("notes");
  const [noteLinksPanelSearch, setNoteLinksPanelSearch] = useState("");
  const [noteLinksPanelFolder, setNoteLinksPanelFolder] = useState("");
  const [floatingModalNoteId, setFloatingModalNoteId] = useState<string | null>(null);
  const [floatingModalTagInput, setFloatingModalTagInput] = useState("");
  const [theme, setTheme] = useState<ThemeOption>(() => ((localStorage.getItem("magnetares_theme") || localStorage.getItem("aster_theme")) as ThemeOption) || "light");
  const [isDark, setIsDark] = useState<boolean>(() => {
    const saved = ((localStorage.getItem("magnetares_theme") || localStorage.getItem("aster_theme")) as ThemeOption) || "light";
    return saved === "dark" || (saved === "system" && typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
  });
  const [detachedFocusNoteIds, setDetachedFocusNoteIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>("general");
  const [appInfo, setAppInfo] = useState<AppInfoRecord>(DEFAULT_APP_INFO);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResultRecord | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState("");
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [dbPath, setDbPath] = useState("%LOCALAPPDATA%\\Magnetares Notes\\magnetares.db");
  // Vazio = o backend usa o pipeline direto do Turso (ou syncApiUrl do config.json).
  const [syncServiceURL] = useState(() => import.meta.env.VITE_API_BASE_URL || "");
  const [syncConfiguration, setSyncConfiguration] = useState<SyncConfiguration>({ tursoDatabaseUrl: "", autoSyncIntervalMinutes: 0, configured: false });
  const [newTagInput, setNewTagInput] = useState("");
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [nextSyncCountdown, setNextSyncCountdown] = useState<string>("");
  const nextSyncTimeRef = useRef<number | null>(null);
  const [syncNotification, setSyncNotification] = useState<{ type: "success" | "warning" | "error" | "info"; message: string } | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [conflictsOpen, setConflictsOpen] = useState(false);
  const [taskSyncNonce, setTaskSyncNonce] = useState(0);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [focusedStickerId, setFocusedStickerId] = useState<string | null>(null);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draggedNoteIdRef = useRef<string | null>(null);
  const draggedFolderIdRef = useRef<string | null>(null);
  const activeIdRef = useRef(activeId);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);
  const syncRunnerRef = useRef<(() => Promise<SyncResult>) | null>(null);

  useEffect(() => {
    localStorage.setItem("magnetares_theme", theme);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const updateTheme = () => {
      const dark = theme === "dark" || (theme === "system" && (media?.matches ?? false));
      setIsDark(dark);
      if (dark) {
        document.documentElement.setAttribute("data-theme", "dark");
      } else {
        document.documentElement.removeAttribute("data-theme");
      }
    };
    updateTheme();
    media?.addEventListener?.("change", updateTheme);
    return () => media?.removeEventListener?.("change", updateTheme);
  }, [theme]);

  useEffect(() => {
    localStorage.removeItem("aster_turso_auth_token");
    localStorage.removeItem("magnetares_turso_auth_token");
    localStorage.removeItem("aster_turso_db_url");
    localStorage.removeItem("magnetares_turso_db_url");
  }, []);

  const openExternalURL = (url: string) => {
    const bridge = window.go?.main?.App;
    if (bridge?.OpenExternalURL) {
      void bridge.OpenExternalURL(url).catch(() => {
        window.open(url, "_blank", "noopener,noreferrer");
      });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleCheckForUpdates = async (silent = false) => {
    const bridge = window.go?.main?.App;
    if (!bridge?.CheckForUpdates) {
      if (!silent) {
        setUpdateCheckError("Verificação de atualizações disponível apenas no aplicativo desktop.");
      }
      return;
    }
    setCheckingUpdates(true);
    if (!silent) {
      setUpdateCheckError("");
    }
    try {
      const result = await bridge.CheckForUpdates();
      setUpdateInfo(result);
      setUpdateCheckError("");
      if (result.hasUpdate) {
        const dismissedVersion = localStorage.getItem("magnetares_dismissed_update");
        if (dismissedVersion !== result.latestVersion) {
          setUpdateBannerDismissed(false);
        }
      }
    } catch (error) {
      if (!silent) {
        setUpdateCheckError(error instanceof Error ? error.message : "Não foi possível verificar atualizações.");
      }
    } finally {
      setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    const bridge = window.go?.main?.App;
    if (bridge?.GetDatabasePath) {
      void bridge.GetDatabasePath().then(setDbPath);
    }
    if (bridge?.GetSyncConfiguration) {
      void bridge.GetSyncConfiguration().then(setSyncConfiguration);
    }
    if (bridge?.ListNoteConflicts) {
      void bridge.ListNoteConflicts().then(setConflicts);
    }
    if (bridge?.GetAppInfo) {
      void bridge.GetAppInfo().then((info) => {
        if (info) setAppInfo(info);
      }).catch(() => undefined);
    }
    const timer = window.setTimeout(() => {
      void handleCheckForUpdates(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, []);

  const reloadConnectionsGraph = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.GetConnectionsGraph) return;
    setConnectionsLoading(true);
    try {
      const graph = await bridge.GetConnectionsGraph();
      if (graph) setConnectionsGraph(graph);
    } catch {
      // Ignora erro transitório
    } finally {
      setConnectionsLoading(false);
    }
  };

  const refreshActiveNoteConnections = async (noteId: string) => {
    const bridge = window.go?.main?.App;
    if (!noteId) {
      setActiveNoteConnections([]);
      return;
    }
    if (bridge?.GetNoteConnections) {
      try {
        const items = await bridge.GetNoteConnections(noteId);
        setActiveNoteConnections(items || []);
      } catch {
        // Ignora
      }
    }
  };

  // Sincroniza estado de Modo Foco e notas entre janelas via Eventos nativos e BroadcastChannel
  useEffect(() => {
    // 1. Escuta evento nativo emitido pelo Go quando a janela independente fecha (por Esc, 'X', etc.)
    const cleanupNative = window.runtime?.EventsOn?.("focus:closed", (closedNoteId: string) => {
      setDetachedFocusNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(closedNoteId);
        return next;
      });

      // Recarrega a nota do SQLite para exibir o conteúdo atualizado imediatamente
      const bridge = window.go?.main?.App;
      if (bridge?.GetNote) {
        bridge.GetNote(closedNoteId).then((updated) => {
          if (updated) {
            setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
          }
        }).catch(() => undefined);
      }
      void reloadConnectionsGraph();
      if (activeIdRef.current === closedNoteId) {
        void refreshActiveNoteConnections(closedNoteId);
      }
    });

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("magnetares_focus_sync");
      channel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === "FOCUS_WINDOW_OPENED" && data.noteId) {
          setDetachedFocusNoteIds((prev) => new Set(prev).add(data.noteId));
        } else if (data.type === "FOCUS_WINDOW_CLOSED" && data.noteId) {
          setDetachedFocusNoteIds((prev) => {
            const next = new Set(prev);
            next.delete(data.noteId);
            return next;
          });
          const bridge = window.go?.main?.App;
          if (bridge?.GetNote) {
            bridge.GetNote(data.noteId).then((updated) => {
              if (updated) {
                setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
              }
            }).catch(() => undefined);
          }
          void reloadConnectionsGraph();
        } else if (data.type === "NOTE_UPDATED" && data.note) {
          setNotes((current) => current.map((n) => (n.id === data.note.id ? { ...n, ...data.note } : n)));
          void reloadConnectionsGraph();
          if (activeIdRef.current === data.note.id) {
            void refreshActiveNoteConnections(data.note.id);
          }
        }
      };
    } catch {
      // Ignora se BroadcastChannel não estiver disponível
    }

    return () => {
      if (typeof cleanupNative === "function") {
        cleanupNative();
      } else {
        window.runtime?.EventsOff?.("focus:closed");
      }
      try {
        channel?.close();
      } catch {}
    };
  }, []);

  const handleLaunchFocusById = async (noteId: string) => {
    if (!noteId) {
      return;
    }
    const bridge = window.go?.main?.App;
    if (bridge?.LaunchFocusWindow) {
      try {
        await bridge.LaunchFocusWindow(noteId);
        setDetachedFocusNoteIds((prev) => new Set(prev).add(noteId));
      } catch (err) {
        console.error("Falha ao abrir janela de foco:", err);
      }
    } else {
      window.open(`?focusNote=${noteId}`, `magnetares_focus_${noteId}`, "width=620,height=780");
      setDetachedFocusNoteIds((prev) => new Set(prev).add(noteId));
    }
  };

  const handleOpenSeparateEditorModal = async (noteId: string) => {
    if (!noteId) return;
    const exists = notes.some((n) => n.id === noteId);
    if (!exists) {
      const bridge = window.go?.main?.App;
      if (bridge?.GetNote) {
        try {
          const fetched = await bridge.GetNote(noteId);
          if (fetched) {
            setNotes((prev) => (prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev]));
          }
        } catch {
          // Ignora falha
        }
      }
    }
    setFloatingModalNoteId(noteId);
  };

  const handleLaunchFocusMode = async (note: Note) => {
    await handleLaunchFocusById(note.id);
  };

  const handleCloseFocusWindow = (noteId: string) => {
    const bridge = window.go?.main?.App;
    if (bridge?.CloseFocusWindow) {
      void bridge.CloseFocusWindow(noteId);
    }
    try {
      const channel = new BroadcastChannel("magnetares_focus_sync");
      channel.postMessage({ type: "REQUEST_CLOSE_FOCUS", noteId });
      channel.close();
    } catch {}
    setDetachedFocusNoteIds((prev) => {
      const next = new Set(prev);
      next.delete(noteId);
      return next;
    });
    if (bridge?.GetNote) {
      bridge.GetNote(noteId).then((updated) => {
        if (updated) {
          setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
        }
      }).catch(() => undefined);
    }
  };

  const pendingNotes = useRef(new Map<string, Note>());
  const saveTimers = useRef(new Map<string, number>());
  const saveQueues = useRef(new Map<string, Promise<void>>());
  const saveVersions = useRef(new Map<string, number>());

  activeIdRef.current = activeId;
  const currentNotes = view === "deleted" ? deletedNotes : notes;
  const active = currentNotes.find((note) => note.id === activeId) ?? currentNotes[0];
  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return currentNotes;
    return currentNotes.filter((note) => `${note.title} ${note.bodyText ?? note.body}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [currentNotes, query]);
  const folderOptions = navigation.folders.length > 0
    ? navigation.folders
    : [{ id: "folder-default", name: "Notas", parentId: null, noteCount: notes.length }];
  const foldersByParent = useMemo(() => {
    const folders = new Map<string | null, FolderRecord[]>();
    folderOptions.forEach((folder) => {
      const parentId = folder.parentId ?? null;
      folders.set(parentId, [...(folders.get(parentId) ?? []), folder]);
    });
    return folders;
  }, [folderOptions]);

  const enqueueSave = (note: Note, version: number) => {
    const saveNote = window.go?.main?.App?.SaveNote;
    if (!saveNote) {
      if (activeIdRef.current === note.id) setSaveState("saved");
      return Promise.resolve();
    }

    const previous = saveQueues.current.get(note.id) ?? Promise.resolve();
    const request = previous
      .catch(() => undefined)
      .then(async () => {
        const saved = await saveNote(note);
        if (saveVersions.current.get(note.id) !== version) return;
        setNotes((current) => current.map((item) => item.id === saved.id ? saved : item));
        if (activeIdRef.current === note.id) {
          setSaveState("saved");
          void refreshActiveNoteConnections(saved.id);
        }
        void reloadConnectionsGraph();
      })
      .catch(() => {
        if (saveVersions.current.get(note.id) === version && activeIdRef.current === note.id) {
          setSaveState("error");
        }
      })
      .finally(() => {
        if (saveQueues.current.get(note.id) === request) saveQueues.current.delete(note.id);
      });
    saveQueues.current.set(note.id, request);
    return request;
  };

  const flushNote = (id: string) => {
    const timer = saveTimers.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    saveTimers.current.delete(id);

    const note = pendingNotes.current.get(id);
    if (!note) return saveQueues.current.get(id) ?? Promise.resolve();
    pendingNotes.current.delete(id);
    return enqueueSave(note, saveVersions.current.get(id) ?? 0);
  };

  const flushAllPendingNotes = async () => {
    const pendingIDs = new Set([
      ...pendingNotes.current.keys(),
      ...saveTimers.current.keys(),
      ...saveQueues.current.keys()
    ]);
    await Promise.all([...pendingIDs].map((id) => flushNote(id)));
    while (saveQueues.current.size > 0) {
      await Promise.all([...saveQueues.current.values()]);
    }
  };

  const scheduleSave = (note: Note) => {
    const previousTimer = saveTimers.current.get(note.id);
    if (previousTimer !== undefined) window.clearTimeout(previousTimer);

    const version = (saveVersions.current.get(note.id) ?? 0) + 1;
    saveVersions.current.set(note.id, version);
    pendingNotes.current.set(note.id, note);
    setSaveState("saving");
    saveTimers.current.set(note.id, window.setTimeout(() => void flushNote(note.id), 450));
  };

  const save = (patch: Partial<Note>) => {
    if (!active || view === "deleted") return;
    const next = { ...active, ...patch, updatedAt: new Date().toISOString() };
    setNotes((current) => current.map((note) => note.id === next.id ? next : note));
    scheduleSave(next);
  };

  const saveNoteById = (noteId: string, patch: Partial<Note>) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target) return;
    const next = { ...target, ...patch, updatedAt: new Date().toISOString() };
    setNotes((current) => current.map((note) => (note.id === next.id ? next : note)));
    scheduleSave(next);
  };

  const toggleTagOnNoteById = async (noteId: string, tagName: string) => {
    const target = notes.find((n) => n.id === noteId);
    if (!target || !tagName.trim()) return;
    const cleanTag = tagName.trim().replace(/^#/, "");
    const currentTags = target.tags ?? [];
    const hasTag = currentTags.some((t) => t.toLowerCase() === cleanTag.toLowerCase());
    const nextTags = hasTag
      ? currentTags.filter((t) => t.toLowerCase() !== cleanTag.toLowerCase())
      : [...currentTags, cleanTag];
    const bridge = window.go?.main?.App;
    if (bridge?.SetNoteTags) {
      try {
        const updated = await bridge.SetNoteTags(target.id, nextTags);
        setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
        void reloadNavigation();
      } catch {
        setSaveState("error");
      }
    } else {
      const updated = { ...target, tags: nextTags };
      setNotes((current) => current.map((n) => (n.id === updated.id ? updated : n)));
    }
  };

  const insertNoteLinkIntoNote = (targetNoteId: string, targetTitle: string) => {
    if (!active || view === "deleted" || targetNoteId === active.id) return;
    if (active.type === "code") {
      const nextBody = `${active.body}\n// [[${targetTitle || "Sem título"}]]`;
      save({ body: nextBody, bodyText: nextBody });
      return;
    }
    window.dispatchEvent(
      new CustomEvent("magnetares:insert-note-link", {
        detail: {
          editorNoteId: active.id,
          noteId: targetNoteId,
          title: targetTitle || "Sem título",
        },
      })
    );
  };

  const selectQuery = (targetQuery: NoteQuery) => {
    setFocusedTaskId(null);
    setFocusedStickerId(null);
    setSelectedQuery(targetQuery);
    const nextView: LibraryView =
      targetQuery.kind === "deleted"
        ? "deleted"
        : targetQuery.kind === "stickerBoard"
        ? "stickers"
        : targetQuery.kind === "taskList"
        ? "tasks"
        : targetQuery.kind === "ideaFlows" || targetQuery.kind === "ideaFlow"
        ? "ideas"
        : targetQuery.kind === "connections"
        ? "connections"
        : "notes";
    setView(nextView);
    if (targetQuery.kind === "ideaFlow") {
      setSelectedIdeaFlowId(targetQuery.id ?? null);
    } else if (targetQuery.kind === "ideaFlows") {
      setSelectedIdeaFlowId(null);
    }
    setQuery("");
    setLoadError("");
    if (targetQuery.kind === "connections") {
      void reloadConnectionsGraph();
    } else if (
      targetQuery.kind !== "stickerBoard" &&
      targetQuery.kind !== "taskList" &&
      targetQuery.kind !== "ideaFlows" &&
      targetQuery.kind !== "ideaFlow"
    ) {
      void loadQueryNotes(targetQuery);
    }
    setSaveState("saved");
  };

  const selectNote = (id: string) => {
    setActiveId(id);
    setSaveState(saveTimers.current.has(id) || saveQueues.current.has(id) ? "saving" : "saved");
  };

  const togglePinActiveNote = async () => {
    if (!active || view === "deleted") return;
    const bridge = window.go?.main?.App;
    const isPinned = Boolean(active.pinnedAt);
    if (bridge?.SetNotePinned) {
      try {
        const updated = await bridge.SetNotePinned(active.id, !isPinned);
        setNotes((current) => current.map((n) => n.id === updated.id ? updated : n));
      } catch {
        setSaveState("error");
      }
    } else {
      const now = new Date().toISOString();
      const updated = { ...active, pinnedAt: isPinned ? null : now };
      setNotes((current) => current.map((n) => n.id === updated.id ? updated : n));
    }
  };

  const addTagToActiveNote = async (tagName: string) => {
    if (!active || view === "deleted" || !tagName.trim()) return;
    const cleanTag = tagName.trim().replace(/^#/, "");
    const currentTags = active.tags ?? [];
    if (currentTags.some((t) => t.toLowerCase() === cleanTag.toLowerCase())) return;
    const nextTags = [...currentTags, cleanTag];
    const bridge = window.go?.main?.App;
    if (bridge?.SetNoteTags) {
      try {
        const updated = await bridge.SetNoteTags(active.id, nextTags);
        setNotes((current) => current.map((n) => n.id === updated.id ? updated : n));
        void reloadNavigation();
      } catch {
        setSaveState("error");
      }
    } else {
      const updated = { ...active, tags: nextTags };
      setNotes((current) => current.map((n) => n.id === updated.id ? updated : n));
    }
    setNewTagInput("");
    setTagInputOpen(false);
  };

  const removeTagFromActiveNote = async (tagName: string) => {
    if (!active || view === "deleted") return;
    const currentTags = active.tags ?? [];
    const nextTags = currentTags.filter((t) => t.toLowerCase() !== tagName.toLowerCase());
    const bridge = window.go?.main?.App;
    if (bridge?.SetNoteTags) {
      try {
        const updated = await bridge.SetNoteTags(active.id, nextTags);
        setNotes((current) => current.map((n) => n.id === updated.id ? updated : n));
        void reloadNavigation();
      } catch {
        setSaveState("error");
      }
    } else {
      const updated = { ...active, tags: nextTags };
      setNotes((current) => current.map((n) => n.id === updated.id ? updated : n));
    }
  };

  const handlePrint = () => {
    if (!active) return;
    // Tenta desmarcar foco de inputs ou popovers ativos antes da impressão
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const originalDocTitle = document.title;
    if (active.title && active.title.trim()) {
      document.title = active.title.trim();
    }
    window.print();
    setTimeout(() => {
      document.title = originalDocTitle;
    }, 1500);
  };

  const handleExport = async (format: "md" | "html" | "txt" | "code" | "docx" | "pdf") => {
    if (!active) return;
    const cleanTitle = active.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "Nota";
    let filename = "";
    let content = "";
    let mimeType = "";
    let isDocx = false;
    let isPdf = false;

    if (format === "pdf") {
      isPdf = true;
      filename = `${cleanTitle}.pdf`;
      mimeType = "application/pdf";
      const base64Pdf = await exportToPdfBase64(active);
      content = `base64:${base64Pdf}`;
    } else if (format === "code" || (active.type === "code" && format !== "txt")) {
      let ext = ".txt";
      switch (active.language) {
        case "javascript": ext = ".js"; break;
        case "typescript": ext = ".ts"; break;
        case "python": ext = ".py"; break;
        case "go": ext = ".go"; break;
        case "html": ext = ".html"; break;
        case "css": ext = ".css"; break;
        case "json": ext = ".json"; break;
        case "shell":
        case "bash": ext = ".sh"; break;
        case "sql": ext = ".sql"; break;
        case "markdown": ext = ".md"; break;
        case "cpp": ext = ".cpp"; break;
      }
      filename = `${cleanTitle}${ext}`;
      content = active.body;
      mimeType = "text/plain";
    } else if (format === "docx") {
      isDocx = true;
      filename = `${cleanTitle} (ABNT).docx`;
      mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const base64Doc = await exportToAbntDocxBase64(active.title, active.body);
      content = `base64:${base64Doc}`;
    } else if (format === "md") {
      filename = `${cleanTitle}.md`;
      content = exportToMarkdown(active.title, active.body, active.bodyText);
      mimeType = "text/markdown";
    } else if (format === "html") {
      filename = `${cleanTitle}.html`;
      content = exportToHTML(active.title, active.body, active.bodyText);
      mimeType = "text/html";
    } else if (format === "txt") {
      filename = `${cleanTitle}.txt`;
      content = `${cleanTitle}\n\n${active.bodyText || active.body}`;
      mimeType = "text/plain";
    }

    setExportMenuOpen(false);

    const bridge = window.go?.main?.App;
    if (bridge?.ExportNoteFile) {
      try {
        const savedPath = await bridge.ExportNoteFile(filename, content);
        if (savedPath) {
          setSyncNotification({
            type: "success",
            message: `Nota exportada com sucesso em: ${savedPath}`,
          });
          setTimeout(() => setSyncNotification(null), 5000);
        }
      } catch (err: any) {
        console.error("Erro ao exportar nota:", err);
        setSyncNotification({
          type: "error",
          message: err?.message || "Erro ao exportar nota.",
        });
        setTimeout(() => setSyncNotification(null), 7000);
      }
    } else {
      if (isPdf) {
        const blob = await exportToPdfBlob(active);
        downloadBlob(filename, blob);
      } else if (isDocx) {
        const blob = await exportToAbntDocxBlob(active.title, active.body);
        downloadBlob(filename, blob);
      } else {
        downloadFile(filename, content, mimeType);
      }
    }
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const parsed = parseImportedFile(file.name, text);
        const now = new Date().toISOString();
        const newNote: Note = {
          id: crypto.randomUUID(),
          title: parsed.title,
          body: parsed.body,
          bodyText: parsed.bodyText,
          folder: "Notas",
          revision: 0,
          createdAt: now,
          updatedAt: now
        };

        const bridge = window.go?.main?.App;
        if (bridge?.SaveNote) {
          const saved = await bridge.SaveNote(newNote);
          setNotes((current) => [saved, ...current]);
          setActiveId(saved.id);
        } else {
          setNotes((current) => [newNote, ...current]);
          setActiveId(newNote.id);
        }
      } catch {
        setLoadError("Erro ao importar o arquivo.");
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
    setView("notes");
    void reloadNavigation();
  };

  const handleDbPathChange = async (
    newPath: string,
    mode: DatabaseMigrationMode = "copy",
    isReset = false
  ) => {
    const bridge = window.go?.main?.App;
    await flushAllPendingNotes();

    let updatedPath = newPath;
    if (isReset && bridge?.ResetDatabasePathToDefault) {
      updatedPath = await bridge.ResetDatabasePathToDefault(mode);
    } else if (bridge?.MigrateDatabasePath) {
      updatedPath = await bridge.MigrateDatabasePath(newPath, mode);
    } else if (bridge?.SetCustomDatabasePath) {
      updatedPath = await bridge.SetCustomDatabasePath(newPath);
    }

    setDbPath(updatedPath);

    if (bridge) {
      const [loadedNotes, loadedDeletedNotes] = await Promise.all([
        bridge.ListNotes?.() ?? Promise.resolve([]),
        bridge.ListDeletedNotes?.() ?? Promise.resolve([]),
        reloadNavigation(),
      ]);
      setNotes(loadedNotes);
      setDeletedNotes(loadedDeletedNotes);
      setActiveId(loadedNotes[0]?.id ?? "");

      if (
        selectedQuery.kind !== "all" &&
        selectedQuery.kind !== "deleted" &&
        selectedQuery.kind !== "stickerBoard" &&
        selectedQuery.kind !== "taskList" &&
        selectedQuery.kind !== "ideaFlows" &&
        selectedQuery.kind !== "ideaFlow"
      ) {
        await loadQueryNotes(selectedQuery);
      }

      setTaskSyncNonce((n) => n + 1);
    }
  };

  const handleSyncWithCloud = async () => {
    if (syncingRef.current) {
      throw new Error("Uma sincronização já está em andamento.");
    }
    syncingRef.current = true;
    setSyncing(true);

    try {
    const bridge = window.go?.main?.App;
    if (!bridge?.SyncNow) {
      throw new Error("Sincronização em nuvem está disponível apenas no aplicativo desktop.");
    }
    if (!syncConfiguration.configured) {
      throw new Error("Conecte a Nuvem em Preferências antes de sincronizar.");
    }
    await flushAllPendingNotes();
    const result = await bridge.SyncNow(syncServiceURL);
    await Promise.all([
      bridge.ListNotes?.() ?? Promise.resolve([]),
      bridge.ListDeletedNotes?.() ?? Promise.resolve([]),
      bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [], stickerBoards: [] })
    ]).then(([loadedNotes, loadedDeletedNotes, loadedNav]) => {
      setNotes(loadedNotes);
      setDeletedNotes(loadedDeletedNotes);
      setNavigation(loadedNav);
      setActiveId((currentActiveId) => {
        if (loadedNotes.some((n) => n.id === currentActiveId)) return currentActiveId;
        return loadedNotes[0]?.id ?? "";
      });
      setTaskSyncNonce((n) => n + 1);
    });
    if (result?.conflictNotes?.length && bridge.ListNoteConflicts) {
      const currentConflicts = await bridge.ListNoteConflicts();
      setConflicts(currentConflicts);
      setConflictsOpen(currentConflicts.length > 0);
    }
    return result;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      const minutes = syncConfiguration.autoSyncIntervalMinutes;
      if (syncConfiguration.configured && minutes > 0) {
        nextSyncTimeRef.current = Date.now() + minutes * 60 * 1000;
      }
    }
  };

  syncRunnerRef.current = handleSyncWithCloud;

  useEffect(() => {
    const minutes = syncConfiguration.autoSyncIntervalMinutes;
    if (!syncConfiguration.configured || minutes <= 0) {
      nextSyncTimeRef.current = null;
      setNextSyncCountdown("");
      return;
    }

    if (!nextSyncTimeRef.current || nextSyncTimeRef.current <= Date.now()) {
      nextSyncTimeRef.current = Date.now() + minutes * 60 * 1000;
    }

    const updateCountdown = () => {
      if (!nextSyncTimeRef.current) return;
      const diffMs = nextSyncTimeRef.current - Date.now();
      if (diffMs <= 0) {
        if (!syncingRef.current && syncRunnerRef.current) {
          nextSyncTimeRef.current = Date.now() + minutes * 60 * 1000;
          void syncRunnerRef.current()
            .then((result) => {
              if (result.conflictNotes?.length) {
                setSyncNotification({ type: "warning", message: result.message || "Há conflitos preservados para revisar." });
                setTimeout(() => setSyncNotification(null), 7000);
              }
            })
            .catch((error: any) => {
              setSyncNotification({ type: "error", message: error?.message || "Falha na sincronização automática." });
              setTimeout(() => setSyncNotification(null), 7000);
            });
        }
        return;
      }

      const totalSec = Math.ceil(diffMs / 1000);
      if (totalSec >= 60) {
        const m = Math.ceil(totalSec / 60);
        setNextSyncCountdown(`${m}m`);
      } else {
        setNextSyncCountdown(`${totalSec}s`);
      }
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(interval);
  }, [syncConfiguration.configured, syncConfiguration.autoSyncIntervalMinutes]);

  const handleResolveConflict = async (noteID: string, resolution: "local" | "remote" | "merge") => {
    const bridge = window.go?.main?.App;
    if (!bridge?.ResolveNoteConflict) return;
    await bridge.ResolveNoteConflict(noteID, resolution);
    const [loadedNotes, loadedDeletedNotes, loadedNav, currentConflicts] = await Promise.all([
      bridge.ListNotes?.() ?? Promise.resolve([]),
      bridge.ListDeletedNotes?.() ?? Promise.resolve([]),
      bridge.ListNavigation?.() ?? Promise.resolve<NavigationRecord>({ folders: [], tags: [], smartFolders: [], stickerBoards: [], ideaFlows: [] }),
      bridge.ListNoteConflicts?.() ?? Promise.resolve([])
    ]);
    setNotes(loadedNotes);
    setDeletedNotes(loadedDeletedNotes);
    setNavigation(loadedNav);
    setConflicts(currentConflicts);
    setConflictsOpen(currentConflicts.length > 0);
    const message = resolution === "local"
      ? "Sua versão foi mantida e será enviada à nuvem."
      : resolution === "remote"
        ? "A versão da nuvem foi restaurada nesta máquina."
        : "As versões local e da nuvem foram mescladas em uma única nota e serão sincronizadas.";
    setSyncNotification({ type: "success", message });
    setTimeout(() => setSyncNotification(null), 5000);
  };

  const handleSaveSyncConfiguration = async (databaseURL: string, authToken: string) => {
    const bridge = window.go?.main?.App;
    if (!bridge?.SaveSyncConfiguration) {
      throw new Error("Configuração de nuvem está disponível apenas no aplicativo desktop.");
    }
    const configuration = await bridge.SaveSyncConfiguration(databaseURL, authToken);
    setSyncConfiguration(configuration);
  };

  const handleSaveAutoSyncInterval = async (minutes: number) => {
    const bridge = window.go?.main?.App;
    if (!bridge?.SaveAutoSyncInterval) {
      throw new Error("Configuração automática disponível apenas no aplicativo desktop.");
    }
    const configuration = await bridge.SaveAutoSyncInterval(minutes);
    setSyncConfiguration(configuration);
  };

  const handleQuickSync = async () => {
    if (syncingRef.current) return;
    setSyncNotification({ type: "info", message: "Sincronizando notas com a nuvem..." });
    try {
      const result = await handleSyncWithCloud();
      const msg = result?.message || (result?.uploaded !== undefined
        ? `Sincronização concluída: ${result.uploaded} enviadas, ${result.downloaded} recebidas, ${result.conflicts} conflitos.`
        : "Sincronização concluída com sucesso!");
      setSyncNotification({ type: result?.conflictNotes?.length ? "warning" : "success", message: msg });
      setTimeout(() => setSyncNotification(null), 5000);
    } catch (err: any) {
      const errorMsg = err?.message || err?.toString() || "Falha ao sincronizar com a nuvem.";
      setSyncNotification({ type: "error", message: errorMsg });
      setTimeout(() => setSyncNotification(null), 7000);
    }
  };

  const moveNoteToFolder = async (noteID: string, folderID: string) => {
    const source = notes.find((note) => note.id === noteID);
    const destination = folderOptions.find((folder) => folder.id === folderID);
    if (!source || !destination || source.folderId === folderID) return;

    setSaveState("saving");
    await flushNote(noteID);
    try {
      const bridge = window.go?.main?.App;
      await bridge?.MoveNote?.(noteID, folderID);
      const updated = { ...source, folderId: folderID, folder: destination.name, updatedAt: new Date().toISOString() };
      setNotes((current) => current.map((note) => note.id === updated.id ? updated : note));
      if (bridge?.MoveNote) {
        void reloadNavigation();
      } else {
        const previousFolderID = source.folderId ?? "folder-default";
        setNavigation((current) => ({
          ...current,
          folders: current.folders.map((folder) => ({
            ...folder,
            noteCount: folder.id === folderID
              ? folder.noteCount + 1
              : folder.id === previousFolderID
                ? Math.max(0, folder.noteCount - 1)
                : folder.noteCount
          }))
        }));
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const handleMoveActiveNote = async (folderID: string) => {
    if (!active || view === "deleted") return;
    await moveNoteToFolder(active.id, folderID);
  };

  const handleDropOnFolder = async (targetFolderID: string, transferredNoteID?: string, transferredFolderID?: string) => {
    const draggedNote = transferredNoteID || draggedNoteIdRef.current || draggedNoteId;
    const draggedFolder = transferredFolderID || draggedFolderIdRef.current || draggedFolderId;
    setDropTargetFolderId(null);
    setDraggedNoteId(null);
    setDraggedFolderId(null);
    draggedNoteIdRef.current = null;
    draggedFolderIdRef.current = null;

    if (draggedNote) {
      await moveNoteToFolder(draggedNote, targetFolderID);
      return;
    }

    if (!draggedFolder || draggedFolder === targetFolderID) return;
    const folder = folderOptions.find((item) => item.id === draggedFolder);
    if (!folder || folder.parentId === targetFolderID) return;

    try {
      const bridge = window.go?.main?.App;
      const updated = { ...folder, parentId: targetFolderID };
      await bridge?.SaveFolder?.(updated);
      if (bridge?.SaveFolder) {
        void reloadNavigation();
      } else {
        setNavigation((current) => ({
          ...current,
          folders: current.folders.map((item) => item.id === updated.id ? updated : item)
        }));
      }
      setExpandedFolderIds((current) => new Set([...current, targetFolderID]));
    } catch {
      setLoadError("Não foi possível mover a pasta. Uma pasta não pode conter a si mesma.");
    }
  };

  const handleSaveFolder = async (folder: FolderRecord) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SaveFolder) {
      await bridge.SaveFolder(folder);
      void reloadNavigation();
    } else {
      setNavigation((current) => ({
        ...current,
        folders: [...current.folders, folder]
      }));
    }
  };

  const handleSaveTag = async (tag: TagRecord) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SaveTag) {
      await bridge.SaveTag(tag);
      await Promise.all([
        reloadNavigation(),
        bridge.ListNotes ? bridge.ListNotes().then(setNotes) : Promise.resolve()
      ]);
    } else {
      setNavigation((current) => ({
        ...current,
        tags: [...current.tags.filter((item) => item.id !== tag.id), tag]
      }));
    }
  };

  const handleSaveSmartFolder = async (smart: SmartFolderRecord) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SaveSmartFolder) {
      await bridge.SaveSmartFolder(smart);
      void reloadNavigation();
    } else {
      setNavigation((current) => ({
        ...current,
        smartFolders: [...current.smartFolders, smart]
      }));
    }
  };

  const createNote = (type: "rtf" | "code" = "rtf") => {
    const now = new Date().toISOString();
    const targetFolderID = selectedQuery.kind === "folder" && selectedQuery.id ? selectedQuery.id : "folder-default";
    const targetFolder = folderOptions.find((f) => f.id === targetFolderID)?.name ?? "Notas";

    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      bodyText: "",
      type: type,
      language: type === "code" ? "javascript" : "plaintext",
      folder: targetFolder,
      folderId: targetFolderID,
      revision: 0,
      createdAt: now,
      updatedAt: now
    };
    setView("notes");
    setNotes((current) => [note, ...current]);
    setActiveId(note.id);
    setQuery("");
    setSaveState("saving");
    const version = (saveVersions.current.get(note.id) ?? 0) + 1;
    saveVersions.current.set(note.id, version);
    void enqueueSave(note, version);
    window.setTimeout(() => titleRef.current?.focus(), 50);
  };

  const deleteNote = async (note: Note) => {
    setSaveState("saving");
    await flushNote(note.id);
    try {
      await window.go?.main?.App?.DeleteNote?.(note.id);
      const deleted = { ...note, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      const remaining = notes.filter((item) => item.id !== note.id);
      setNotes(remaining);
      setDeletedNotes((current) => [deleted, ...current]);
      setActiveId(remaining[0]?.id ?? "");
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  const restoreNote = async (note: Note) => {
    try {
      await window.go?.main?.App?.RestoreNote?.(note.id);
      const restored = { ...note, deletedAt: null, updatedAt: new Date().toISOString() };
      const remaining = deletedNotes.filter((item) => item.id !== note.id);
      setDeletedNotes(remaining);
      setNotes((current) => [restored, ...current]);
      setActiveId(remaining[0]?.id ?? "");
    } catch {
      setSaveState("error");
    }
  };

  const permanentlyDeleteNote = async (note: Note) => {
    try {
      await window.go?.main?.App?.PermanentlyDeleteNote?.(note.id);
      const remaining = deletedNotes.filter((item) => item.id !== note.id);
      setDeletedNotes(remaining);
      setActiveId(remaining[0]?.id ?? "");
    } catch {
      setSaveState("error");
    }
  };

  const emptyDeletedNotes = async () => {
    try {
      await window.go?.main?.App?.EmptyDeletedNotes?.();
      setDeletedNotes([]);
      setActiveId("");
    } catch {
      setSaveState("error");
    }
  };

  const reloadNavigation = async () => {
    const bridge = window.go?.main?.App;
    if (!bridge?.ListNavigation) return;
    try {
      const [nav, flows] = await Promise.all([
        bridge.ListNavigation(),
        bridge.ListIdeaFlows ? bridge.ListIdeaFlows() : Promise.resolve(null),
      ]);
      setNavigation(nav);
      if (flows) {
        setIdeaFlows(flows);
      } else if (nav.ideaFlows) {
        setIdeaFlows(nav.ideaFlows);
      }
      void reloadConnectionsGraph();
    } catch {
      // Graceful fallback for browser
    }
  };

  const loadQueryNotes = async (targetQuery: NoteQuery) => {
    const bridge = window.go?.main?.App;
    if (!bridge?.QueryNotes) return;
    try {
      const result = await bridge.QueryNotes(targetQuery);
      if (targetQuery.kind === "deleted") {
        setDeletedNotes(result);
      } else {
        setNotes(result);
      }
      setActiveId(result[0]?.id ?? "");
    } catch {
      setLoadError("Não foi possível carregar as notas.");
    }
  };

  useEffect(() => {
    const bridge = window.go?.main?.App;
    if (!bridge?.ListNotes) return;

    setIsLoading(true);
    void Promise.all([
      bridge.ListNotes(),
      bridge.ListDeletedNotes?.() ?? Promise.resolve([]),
      bridge.ListNavigation?.() ?? Promise.resolve<NavigationRecord>({ folders: [], tags: [], smartFolders: [], stickerBoards: [], ideaFlows: [] }),
      bridge.ListIdeaFlows?.() ?? Promise.resolve(null),
      bridge.GetConnectionsGraph?.() ?? Promise.resolve(null),
    ])
      .then(([loadedNotes, loadedDeletedNotes, loadedNav, loadedFlows, loadedGraph]) => {
        setNotes(loadedNotes);
        setDeletedNotes(loadedDeletedNotes);
        setNavigation(loadedNav);
        setIdeaFlows(loadedFlows ?? loadedNav.ideaFlows ?? []);
        if (loadedGraph) setConnectionsGraph(loadedGraph);
        setActiveId(loadedNotes[0]?.id ?? "");
      })
      .catch(() => setLoadError("Não foi possível abrir suas notas."))
      .finally(() => setIsLoading(false));
  }, []);

  // Em modo demonstração (browser sem Wails), mantém o grafo derivado do estado em memória
  useEffect(() => {
    if (window.go?.main?.App?.GetConnectionsGraph) return;
    const derived = buildDemoConnectionsPayload(notes, navigation.tags, navigation.folders);
    setConnectionsGraph(derived);
  }, [notes, navigation.tags, navigation.folders]);

  // Atualiza painel de conexões da nota ativa sempre que a seleção mudar
  useEffect(() => {
    if (!activeId || view === "deleted") {
      setActiveNoteConnections([]);
      return;
    }
    const bridge = window.go?.main?.App;
    if (bridge?.GetNoteConnections) {
      void refreshActiveNoteConnections(activeId);
    } else {
      const titleMap = new Map(notes.map((n) => [n.id, n]));
      const items: NoteConnectionSummary[] = [];
      for (const link of connectionsGraph.links) {
        if (link.sourceNoteId === activeId) {
          const target = titleMap.get(link.targetNoteId);
          if (target) {
            items.push({
              noteId: target.id,
              title: target.title,
              folder: target.folder || "Notas",
              noteType: target.type || "rtf",
              direction: "outgoing",
            });
          }
        } else if (link.targetNoteId === activeId) {
          const src = titleMap.get(link.sourceNoteId);
          if (src) {
            items.push({
              noteId: src.id,
              title: src.title,
              folder: src.folder || "Notas",
              noteType: src.type || "rtf",
              direction: "incoming",
            });
          }
        }
      }
      setActiveNoteConnections(items);
    }
  }, [activeId, view, connectionsGraph.links]);

  const availableLinkNotes = useMemo<NoteLinkMeta[]>(() => {
    if (connectionsGraph.notes.length > 0) {
      return connectionsGraph.notes.map((n) => ({ id: n.id, title: n.title, folder: n.folder }));
    }
    return notes.map((n) => ({ id: n.id, title: n.title, folder: n.folder }));
  }, [connectionsGraph.notes, notes]);

  // Mapa rápido de indicadores de conexão para todas as notas (links diretos + etiquetas compartilhadas)
  const noteConnectionsMetaMap = useMemo(() => {
    const map = new Map<
      string,
      {
        directCount: number;
        tagsCount: number;
        linkedNoteIds: Set<string>;
        relatedByTag: Array<{ id: string; title: string; folder: string; sharedTag: string }>;
      }
    >();

    const allSourceNotes =
      connectionsGraph.notes.length > 0
        ? connectionsGraph.notes
        : notes.map((n) => ({
            id: n.id,
            title: n.title,
            folderId: n.folderId || "folder-default",
            folder: n.folder || "Notas",
            noteType: n.type || "rtf",
            language: n.language || "",
            pinned: Boolean(n.pinnedAt),
            tags: n.tags || [],
            updatedAt: n.updatedAt,
          }));

    const tagToNotes = new Map<string, Array<{ id: string; title: string; folder: string; rawTag: string }>>();
    for (const n of allSourceNotes) {
      map.set(n.id, {
        directCount: 0,
        tagsCount: n.tags?.length ?? 0,
        linkedNoteIds: new Set<string>(),
        relatedByTag: [],
      });
      for (const rawTag of n.tags || []) {
        const key = rawTag.trim().toLocaleLowerCase();
        if (!key) continue;
        const list = tagToNotes.get(key) ?? [];
        list.push({ id: n.id, title: n.title || "Sem título", folder: n.folder || "Notas", rawTag });
        tagToNotes.set(key, list);
      }
    }

    for (const link of connectionsGraph.links || []) {
      const srcMeta = map.get(link.sourceNoteId);
      if (srcMeta && !srcMeta.linkedNoteIds.has(link.targetNoteId)) {
        srcMeta.linkedNoteIds.add(link.targetNoteId);
        srcMeta.directCount += 1;
      }
      const tgtMeta = map.get(link.targetNoteId);
      if (tgtMeta && !tgtMeta.linkedNoteIds.has(link.sourceNoteId)) {
        tgtMeta.linkedNoteIds.add(link.sourceNoteId);
        tgtMeta.directCount += 1;
      }
    }

    for (const n of allSourceNotes) {
      const meta = map.get(n.id);
      if (!meta) continue;
      const seenRel = new Set<string>();
      for (const rawTag of n.tags || []) {
        const key = rawTag.trim().toLocaleLowerCase();
        const peers = tagToNotes.get(key) || [];
        for (const peer of peers) {
          if (peer.id !== n.id && !seenRel.has(peer.id)) {
            seenRel.add(peer.id);
            meta.relatedByTag.push({
              id: peer.id,
              title: peer.title,
              folder: peer.folder,
              sharedTag: peer.rawTag,
            });
          }
        }
      }
    }

    return map;
  }, [connectionsGraph.notes, connectionsGraph.links, notes]);

  const floatingModalNote = useMemo(
    () => (floatingModalNoteId ? notes.find((n) => n.id === floatingModalNoteId) ?? null : null),
    [floatingModalNoteId, notes]
  );

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLocaleLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key.toLocaleLowerCase() === "n") {
        event.preventDefault();
        createNote();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  });

  useEffect(() => {
    const flushPendingNotes = () => {
      for (const id of pendingNotes.current.keys()) void flushNote(id);
    };
    window.addEventListener("pagehide", flushPendingNotes);
    return () => {
      window.removeEventListener("pagehide", flushPendingNotes);
      flushPendingNotes();
    };
  }, []);

  const emptyTitle = query
    ? "Nenhuma nota encontrada"
    : view === "deleted" ? "Nenhuma nota apagada" : "Nenhuma nota ainda";
  const emptyDescription = query
    ? "Tente buscar outro termo."
    : view === "deleted" ? "As notas movidas para a lixeira aparecerão aqui." : "Crie uma nota para começar.";

  const handleDeleteFolder = async (folder: FolderRecord) => {
    if (folder.id === "folder-default") return;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteFolder) {
        await bridge.DeleteFolder(folder.id);
        void reloadNavigation();
        if (selectedQuery.kind === "folder" && selectedQuery.id === folder.id) {
          selectQuery({ kind: "all" });
        } else {
          void loadQueryNotes(selectedQuery);
        }
      } else {
        setNavigation((current) => ({
          ...current,
          folders: current.folders.filter((f) => f.id !== folder.id)
        }));
      }
    } catch {
      setLoadError("Não foi possível excluir a pasta.");
    } finally {
      setDeleteFolderTarget(null);
    }
  };

  const handleDeleteTag = async (tag: TagRecord) => {
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteTag) {
        await bridge.DeleteTag(tag.id);
        await Promise.all([
          reloadNavigation(),
          bridge.ListNotes ? bridge.ListNotes().then(setNotes) : Promise.resolve()
        ]);
        if (selectedQuery.kind === "tag" && selectedQuery.id === tag.id) {
          selectQuery({ kind: "all" });
        }
      } else {
        setNavigation((current) => ({
          ...current,
          tags: current.tags.filter((item) => item.id !== tag.id)
        }));
      }
    } catch (error: any) {
      setLoadError(error?.message || "Não foi possível excluir a etiqueta.");
    } finally {
      setDeleteTagTarget(null);
    }
  };

  const handleSaveStickerBoard = async (boardRecord: StickerBoardRecord) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SaveStickerBoard) {
      try {
        const saved = await bridge.SaveStickerBoard(boardRecord);
        await reloadNavigation();
        selectQuery({ kind: "stickerBoard", id: saved.id });
      } catch (err: any) {
        setLoadError(err?.message || "Não foi possível salvar o quadro de stickers.");
      }
    } else {
      setNavigation((current) => ({
        ...current,
        stickerBoards: current.stickerBoards.some((b) => b.id === boardRecord.id)
          ? current.stickerBoards.map((b) => (b.id === boardRecord.id ? boardRecord : b))
          : [...current.stickerBoards, boardRecord]
      }));
      selectQuery({ kind: "stickerBoard", id: boardRecord.id });
    }
  };

  const handleDeleteStickerBoard = async (boardRecord: StickerBoardRecord) => {
    if (boardRecord.id === "board-default") return;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteStickerBoard) {
        await bridge.DeleteStickerBoard(boardRecord.id);
        await reloadNavigation();
        if (selectedQuery.kind === "stickerBoard" && selectedQuery.id === boardRecord.id) {
          selectQuery({ kind: "all" });
        }
      } else {
        setNavigation((current) => ({
          ...current,
          stickerBoards: current.stickerBoards.filter((b) => b.id !== boardRecord.id)
        }));
        if (selectedQuery.kind === "stickerBoard" && selectedQuery.id === boardRecord.id) {
          selectQuery({ kind: "all" });
        }
      }
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível excluir o quadro de stickers.");
    } finally {
      setDeleteBoardTarget(null);
    }
  };

  const handleStickerCountChange = (boardId: string, count: number) => {
    setNavigation((prev) => ({
      ...prev,
      stickerBoards: (prev.stickerBoards || []).map((b) =>
        b.id === boardId ? { ...b, stickerCount: count } : b
      ),
    }));
  };

  const handleSaveTaskList = async (listRecord: TaskListRecord) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SaveTaskList) {
      try {
        const saved = await bridge.SaveTaskList(listRecord);
        await reloadNavigation();
        selectQuery({ kind: "taskList", id: saved.id });
      } catch (err: any) {
        setLoadError(err?.message || "Não foi possível salvar a lista de tarefas.");
      }
    } else {
      setNavigation((current) => ({
        ...current,
        taskLists: (current.taskLists || []).some((l) => l.id === listRecord.id)
          ? (current.taskLists || []).map((l) => (l.id === listRecord.id ? listRecord : l))
          : [...(current.taskLists || []), listRecord]
      }));
      selectQuery({ kind: "taskList", id: listRecord.id });
    }
  };

  const handleArchiveTaskList = async (listRecord: TaskListRecord) => {
    if (listRecord.id === "list-inbox") return;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.ArchiveTaskList) {
        await bridge.ArchiveTaskList(listRecord.id);
        await reloadNavigation();
      } else {
        setNavigation((current) => ({
          ...current,
          taskLists: (current.taskLists || []).filter((l) => l.id !== listRecord.id),
          archivedTaskLists: [
            ...(current.archivedTaskLists || []).filter((l) => l.id !== listRecord.id),
            { ...listRecord, archivedAt: new Date().toISOString() },
          ],
        }));
      }
      setTaskSyncNonce((n) => n + 1);
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível arquivar a lista de tarefas.");
    }
  };

  const handleUnarchiveTaskList = async (listRecord: TaskListRecord) => {
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.UnarchiveTaskList) {
        await bridge.UnarchiveTaskList(listRecord.id);
        await reloadNavigation();
      } else {
        setNavigation((current) => ({
          ...current,
          archivedTaskLists: (current.archivedTaskLists || []).filter((l) => l.id !== listRecord.id),
          taskLists: [
            ...(current.taskLists || []).filter((l) => l.id !== listRecord.id),
            { ...listRecord, archivedAt: null },
          ],
        }));
      }
      setTaskSyncNonce((n) => n + 1);
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível desarquivar a lista de tarefas.");
    }
  };

  const handleDeleteTaskList = async (listRecord: TaskListRecord) => {
    if (listRecord.id === "list-inbox") return;
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteTaskList) {
        await bridge.DeleteTaskList(listRecord.id);
        await reloadNavigation();
        if (selectedQuery.kind === "taskList" && selectedQuery.id === listRecord.id) {
          selectQuery({ kind: "taskList", id: "list-inbox" });
        }
      } else {
        setNavigation((current) => ({
          ...current,
          taskLists: (current.taskLists || []).filter((l) => l.id !== listRecord.id),
          archivedTaskLists: (current.archivedTaskLists || []).filter((l) => l.id !== listRecord.id),
        }));
        if (selectedQuery.kind === "taskList" && selectedQuery.id === listRecord.id) {
          selectQuery({ kind: "taskList", id: "list-inbox" });
        }
      }
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível excluir a lista de tarefas.");
    } finally {
      setDeleteListTarget(null);
    }
  };

  const handleTaskCountChange = (listId: string, count: number) => {
    setNavigation((prev) => ({
      ...prev,
      taskLists: (prev.taskLists || []).map((l) =>
        l.id === listId ? { ...l, taskCount: count } : l
      ),
    }));
  };

  const handleSaveIdeaFlow = async (input: SaveIdeaFlowInput) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SaveIdeaFlow) {
      const saved = await bridge.SaveIdeaFlow(input);
      setIdeaFlows((prev) =>
        prev.some((f) => f.id === saved.id)
          ? prev.map((f) => (f.id === saved.id ? saved : f))
          : [...prev, saved]
      );
      void reloadNavigation();
      selectQuery({ kind: "ideaFlow", id: saved.id });
    } else {
      const now = new Date().toISOString();
      const existing = input.id ? ideaFlows.find((f) => f.id === input.id) : undefined;
      const saved: IdeaFlowRecord = existing
        ? {
            ...existing,
            title: input.title,
            description: input.description,
            color: input.color,
            icon: input.icon,
            position: input.position ?? existing.position,
            updatedAt: now,
          }
        : {
            id: input.id || crypto.randomUUID(),
            title: input.title,
            description: input.description,
            color: input.color || "#4b75ff",
            icon: input.icon || "git-branch",
            viewportX: 0,
            viewportY: 0,
            viewportZoom: 1,
            position: input.position ?? ideaFlows.length,
            nodeCount: 0,
            edgeCount: 0,
            createdAt: now,
            updatedAt: now,
          };
      setIdeaFlows((prev) =>
        prev.some((f) => f.id === saved.id)
          ? prev.map((f) => (f.id === saved.id ? saved : f))
          : [...prev, saved]
      );
      selectQuery({ kind: "ideaFlow", id: saved.id });
    }
  };

  const handleDuplicateIdeaFlow = async (flow: IdeaFlowRecord) => {
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DuplicateIdeaFlow) {
        const duplicated = await bridge.DuplicateIdeaFlow(flow.id);
        setIdeaFlows((prev) => [...prev, duplicated]);
        void reloadNavigation();
      } else {
        const now = new Date().toISOString();
        const newId = crypto.randomUUID();
        const duplicated: IdeaFlowRecord = {
          ...flow,
          id: newId,
          title: `${flow.title} (cópia)`,
          position: ideaFlows.length,
          createdAt: now,
          updatedAt: now,
        };
        const sourceGraph = demoIdeaGraphs[flow.id];
        if (sourceGraph) {
          const nodeMap = new Map<string, string>();
          const clonedNodes = sourceGraph.nodes.map((n) => {
            const clonedId = crypto.randomUUID();
            nodeMap.set(n.id, clonedId);
            return { ...n, id: clonedId, flowId: newId, createdAt: now, updatedAt: now };
          });
          const clonedEdges = sourceGraph.edges.map((e) => ({
            ...e,
            id: crypto.randomUUID(),
            flowId: newId,
            sourceNodeId: nodeMap.get(e.sourceNodeId) ?? e.sourceNodeId,
            targetNodeId: nodeMap.get(e.targetNodeId) ?? e.targetNodeId,
            createdAt: now,
            updatedAt: now,
          }));
          setDemoIdeaGraphs((prev) => ({
            ...prev,
            [newId]: { flow: duplicated, nodes: clonedNodes, edges: clonedEdges },
          }));
        }
        setIdeaFlows((prev) => [...prev, duplicated]);
      }
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível duplicar o fluxo de ideias.");
    }
  };

  const handleDeleteIdeaFlow = async (flow: IdeaFlowRecord) => {
    try {
      const bridge = window.go?.main?.App;
      if (bridge?.DeleteIdeaFlow) {
        await bridge.DeleteIdeaFlow(flow.id);
        setIdeaFlows((prev) => prev.filter((f) => f.id !== flow.id));
        void reloadNavigation();
      } else {
        setIdeaFlows((prev) => prev.filter((f) => f.id !== flow.id));
        setDemoIdeaGraphs((prev) => {
          const next = { ...prev };
          delete next[flow.id];
          return next;
        });
      }
      if (selectedIdeaFlowId === flow.id) {
        setSelectedIdeaFlowId(null);
        setSelectedQuery({ kind: "ideaFlows" });
      }
    } catch (err: any) {
      setLoadError(err?.message || "Não foi possível excluir o fluxo de ideias.");
    } finally {
      setDeleteIdeaFlowTarget(null);
    }
  };

  const handleIdeaFlowGraphSaved = (updatedFlow: IdeaFlowRecord) => {
    setIdeaFlows((prev) =>
      prev.map((f) => (f.id === updatedFlow.id ? updatedFlow : f))
    );
  };

  const handleSaveDemoIdeaGraph = (input: SaveIdeaFlowGraphInput): IdeaFlowGraphRecord => {
    const now = new Date().toISOString();
    const currentFlow = ideaFlows.find((f) => f.id === input.flowId);
    const updatedFlow: IdeaFlowRecord = {
      ...(currentFlow ?? {
        id: input.flowId,
        title: "Fluxo de Ideias",
        description: "",
        color: "#4b75ff",
        icon: "git-branch",
        position: 0,
        createdAt: now,
      }),
      viewportX: input.viewportX,
      viewportY: input.viewportY,
      viewportZoom: input.viewportZoom,
      nodeCount: input.nodes.length,
      edgeCount: input.edges.length,
      updatedAt: now,
    };
    const nextGraph: IdeaFlowGraphRecord = {
      flow: updatedFlow,
      nodes: input.nodes,
      edges: input.edges,
    };
    setDemoIdeaGraphs((prev) => ({ ...prev, [input.flowId]: nextGraph }));
    return nextGraph;
  };

  const handleNavigateToReference = async (
    kind: IdeaReferenceKind,
    id: string
  ) => {
    if (kind === "taskList") {
      selectQuery({ kind: "taskList", id });
      return;
    }
    if (kind === "task") {
      const [listId, taskId] = id.split("::");
      if (!listId) return;
      selectQuery({ kind: "taskList", id: listId });
      setFocusedTaskId(taskId || null);
      return;
    }
    if (kind === "stickerBoard") {
      selectQuery({ kind: "stickerBoard", id });
      return;
    }
    if (kind === "sticker") {
      const [boardId, stickerId] = id.split("::");
      if (!boardId) return;
      selectQuery({ kind: "stickerBoard", id: boardId });
      setFocusedStickerId(stickerId || null);
      return;
    }
    // Navigate directly to a note
    setSelectedQuery({ kind: "all" });
    setView("notes");
    setQuery("");
    setLoadError("");
    const existing = notes.find((n) => n.id === id);
    if (existing) {
      setActiveId(existing.id);
      return;
    }
    const bridge = window.go?.main?.App;
    if (bridge?.GetNote) {
      try {
        const fetched = await bridge.GetNote(id);
        setNotes((prev) => (prev.some((n) => n.id === fetched.id) ? prev : [fetched, ...prev]));
        setActiveId(fetched.id);
        return;
      } catch {
        // Fallback to loading all notes
      }
    }
    if (bridge?.QueryNotes) {
      try {
        const all = await bridge.QueryNotes({ kind: "all" });
        setNotes(all);
        setActiveId(all.some((n) => n.id === id) ? id : all[0]?.id ?? "");
      } catch {
        setLoadError("Não foi possível abrir a nota referenciada.");
      }
    }
  };

  const toggleFolderExpanded = (folderID: string) => {
    setExpandedFolderIds((current) => {
      const next = new Set(current);
      if (next.has(folderID)) next.delete(folderID);
      else next.add(folderID);
      return next;
    });
  };

  const renderFolderNode = (folder: FolderRecord, depth = 0) => {
    const children = foldersByParent.get(folder.id) ?? [];
    const hasChildren = children.length > 0;
    const isExpanded = expandedFolderIds.has(folder.id);
    const isDropTarget = dropTargetFolderId === folder.id;

    const FolderIconComp = getFolderIconComponent(folder.icon);
    const folderIconStyle = folder.color ? { color: folder.color } : undefined;

    return (
      <div className="folder-node" key={folder.id}>
        <div className={`folder-node-row depth-${depth} ${hasChildren ? "has-children" : "no-children"}`} style={{ paddingLeft: depth === 0 ? 0 : depth * 14 }}>
          {hasChildren ? (
            <button type="button" className="folder-expander" onClick={() => toggleFolderExpanded(folder.id)} aria-label={isExpanded ? `Recolher ${folder.name}` : `Expandir ${folder.name}`}>
              {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </button>
          ) : depth > 0 ? (
            <span className="folder-expander-spacer" />
          ) : null}
          <button
            type="button"
            draggable
            className={`nav-item folder-item folder-drop-zone ${hasChildren || depth > 0 ? "has-expander" : ""} ${selectedQuery.kind === "folder" && selectedQuery.id === folder.id ? "selected-folder" : ""} ${isDropTarget ? "drop-target" : ""}`}
            onClick={() => selectQuery({ kind: "folder", id: folder.id })}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("application/x-magnetares-folder", folder.id);
              draggedFolderIdRef.current = folder.id;
              setDraggedFolderId(folder.id);
            }}
            onDragEnd={() => {
              setDraggedFolderId(null);
              draggedFolderIdRef.current = null;
              setDropTargetFolderId(null);
            }}
            onDragOver={(event) => {
              if (!draggedNoteId && !draggedFolderId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTargetFolderId(folder.id);
            }}
            onDragLeave={() => setDropTargetFolderId((current) => current === folder.id ? null : current)}
            onDrop={(event) => {
              event.preventDefault();
              void handleDropOnFolder(
                folder.id,
                event.dataTransfer.getData("application/x-magnetares-note"),
                event.dataTransfer.getData("application/x-magnetares-folder")
              );
            }}
          >
            <span><FolderIconComp className="folder-icon" style={folderIconStyle} aria-hidden="true" /> <span className="nav-item-title">{folder.name}</span></span>
            <div className="folder-item-actions">
              <small className="folder-note-count">{folder.noteCount}</small>
              {folder.id !== "folder-default" && (
                <div className="folder-hover-btns">
                  <button
                    type="button"
                    className="folder-action-btn"
                    title="Editar pasta"
                    aria-label={`Editar pasta ${folder.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialogMode({ kind: "folder", folderToEdit: folder });
                    }}
                  >
                    <FilePenLine size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="folder-action-btn danger"
                    title="Excluir pasta"
                    aria-label={`Excluir pasta ${folder.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteFolderTarget(folder);
                    }}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          </button>
        </div>
        {hasChildren && isExpanded && <div className="folder-children">{children.map((child) => renderFolderNode(child, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="app-container">
      <TitleBar
        title={
          view === "stickers"
            ? `${(navigation.stickerBoards || []).find((b) => b.id === selectedQuery.id)?.name ?? "Stickers"} — Magnetares`
            : view === "tasks"
            ? `${(navigation.taskLists || []).find((l) => l.id === selectedQuery.id)?.name ?? "Tarefas"} — Magnetares`
            : view === "ideas"
            ? `${(selectedIdeaFlowId ? ideaFlows.find((f) => f.id === selectedIdeaFlowId)?.title : null) ?? "Fluxo de Ideias"} — Magnetares`
            : view === "connections"
            ? "Minhas Conexões — Magnetares"
            : active?.title
            ? `${active.title} — Magnetares`
            : "Magnetares Notes"
        }
      />
      {syncNotification && !conflictsOpen && (
        <div className={`app-toast ${syncNotification.type}`} role="status">
          <span>{syncNotification.message}</span>
          <button type="button" onClick={() => setSyncNotification(null)} aria-label="Fechar notificação">
            <X aria-hidden="true" />
          </button>
        </div>
      )}
      <main className={`shell ${sidebarOpen ? "" : "sidebar-closed"} ${view === "stickers" ? "stickers-view" : ""} ${view === "tasks" ? "tasks-view" : ""} ${view === "ideas" ? "ideas-view" : ""} ${view === "connections" ? "connections-view" : ""}`}>
      <aside className="sidebar" aria-label="Pastas">
        <div className="sidebar-heading">
          <img
            src="/icon.png"
            alt="Magnetares"
            className="brand-mark brand-icon"
            aria-hidden="true"
          />
          <strong>Magnetares</strong>
          <button className="icon-button" onClick={() => setSidebarOpen(false)} title="Ocultar barra lateral" aria-label="Ocultar barra lateral"><ChevronLeft aria-hidden="true" /></button>
        </div>
        <div className="sidebar-content">
        <nav aria-label="Biblioteca">
          <button className={`nav-item ${selectedQuery.kind === "all" ? "selected" : ""}`} onClick={() => selectQuery({ kind: "all" })}>
            <span><List aria-hidden="true" /><span className="nav-item-title">Todas as notas</span></span>
            <small>{notes.length}</small>
          </button>
        </nav>

        <div className="sidebar-section-header">
          <span className="folder-label">PASTAS</span>
          <button className="icon-button mini-add" onClick={() => setDialogMode({ kind: "folder" })} title="Nova pasta" aria-label="Nova pasta"><Plus aria-hidden="true" /></button>
        </div>
        <div className="folder-tree">
          {navigation.folders.length === 0 ? (
            <button className={`nav-item folder-item ${selectedQuery.kind === "all" ? "selected-folder" : ""}`} onClick={() => selectQuery({ kind: "all" })}>
              <span><Folder className="folder-icon" aria-hidden="true" /><span className="nav-item-title">Notas</span></span>
              <small>{notes.length}</small>
            </button>
          ) : (
            (foldersByParent.get(null) ?? []).map((folder) => renderFolderNode(folder))
          )}
        </div>

        {navigation.smartFolders.length > 0 && (
          <>
            <div className="sidebar-section-header">
              <span className="folder-label">PASTAS INTELIGENTES</span>
              <button className="icon-button mini-add" onClick={() => setDialogMode({ kind: "smart" })} title="Nova Pasta Inteligente" aria-label="Nova Pasta Inteligente"><Plus aria-hidden="true" /></button>
            </div>
            <div className="folder-tree">
              {navigation.smartFolders.map((smart) => (
                <button key={smart.id} className={`nav-item smart-item ${selectedQuery.kind === "smart" && selectedQuery.id === smart.id ? "selected" : ""}`} onClick={() => selectQuery({ kind: "smart", id: smart.id })} title={smart.name}>
                  <span><Sparkles className="smart-icon" aria-hidden="true" /><span className="nav-item-title">{smart.name}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        <>
          <div className="sidebar-section-header">
            <span className="folder-label">STICKERS</span>
            <button
              className="icon-button mini-add"
              onClick={() => {
                setBoardToEdit(undefined);
                setStickerBoardDialogOpen(true);
              }}
              title="Novo quadro de stickers"
              aria-label="Novo quadro de stickers"
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <div className="folder-tree">
            {(navigation.stickerBoards || []).map((board) => {
              const isSelected = selectedQuery.kind === "stickerBoard" && selectedQuery.id === board.id;
              const colorHex = STICKER_PALETTE.find((c) => c.id === board.color)?.hex ?? "#eab308";
              return (
                <button
                  key={board.id}
                  type="button"
                  className={`nav-item sticker-board-item ${isSelected ? "selected" : ""}`}
                  onClick={() => selectQuery({ kind: "stickerBoard", id: board.id })}
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("application/x-magnetares-sticker")) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }
                  }}
                  onDrop={async (event) => {
                    const stickerId = event.dataTransfer.getData("application/x-magnetares-sticker");
                    if (stickerId && board.id !== selectedQuery.id) {
                      event.preventDefault();
                      const bridge = window.go?.main?.App;
                      if (bridge?.MoveSticker) {
                        await bridge.MoveSticker(stickerId, board.id, "");
                        await reloadNavigation();
                        selectQuery({ kind: "stickerBoard", id: board.id });
                      }
                    }
                  }}
                  title={board.name}
                >
                  <span>
                    <DelicateStickerIcon
                      size={14}
                      className="tag-icon sticker-board-icon"
                      style={{ color: colorHex }}
                    />
                    <span className="nav-item-title">{board.name}</span>
                  </span>
                  <div className="folder-item-actions">
                    <small className="folder-note-count">{board.stickerCount ?? 0}</small>
                    <div className="folder-hover-btns">
                      <span
                        className="folder-action-btn"
                        role="button"
                        tabIndex={0}
                        title="Editar quadro"
                        aria-label={`Editar quadro ${board.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setBoardToEdit(board);
                          setStickerBoardDialogOpen(true);
                        }}
                      >
                        <FilePenLine size={13} aria-hidden="true" />
                      </span>
                      {board.id !== "board-default" && (
                        <span
                          className="folder-action-btn danger"
                          role="button"
                          tabIndex={0}
                          title="Excluir quadro"
                          aria-label={`Excluir quadro ${board.name}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteBoardTarget(board);
                          }}
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>

        <>
          <div className="sidebar-section-header">
            <span className="folder-label">FLUXO DE IDEIAS</span>
            <button
              className="icon-button mini-add"
              onClick={() => {
                setIdeaFlowToEdit(undefined);
                setIdeaFlowDialogOpen(true);
              }}
              title="Novo fluxo de ideias"
              aria-label="Novo fluxo de ideias"
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <div className="folder-tree">
            <button
              type="button"
              className={`nav-item idea-flow-nav-item ${view === "ideas" ? "selected" : ""}`}
              onClick={() => selectQuery({ kind: "ideaFlows" })}
              title="Abrir Meus Fluxos"
            >
              <span>
                <GitBranch className="idea-flow-nav-icon" size={14} aria-hidden="true" />
                <span className="nav-item-title">Meus Fluxos</span>
              </span>
              <small>{ideaFlows.length}</small>
            </button>
          </div>
        </>

        <>
          <div className="sidebar-section-header">
            <span className="folder-label">CONEXÕES</span>
          </div>
          <div className="folder-tree">
            <button
              type="button"
              className={`nav-item idea-flow-nav-item ${view === "connections" ? "selected" : ""}`}
              onClick={() => selectQuery({ kind: "connections" })}
              title="Abrir mapa de conexões entre notas e etiquetas"
            >
              <span>
                <Network className="idea-flow-nav-icon" size={14} aria-hidden="true" />
                <span className="nav-item-title">Minhas Conexões</span>
              </span>
              <small>
                {connectionsGraph.links.length +
                  connectionsGraph.notes.reduce((acc, n) => acc + (n.tags?.length ?? 0), 0)}
              </small>
            </button>
          </div>
        </>

        <>
          <div className="sidebar-section-header">
            <span className="folder-label">LISTAS</span>
            <button
              className="icon-button mini-add"
              onClick={() => {
                setListToEdit(undefined);
                setTaskListDialogOpen(true);
              }}
              title="Nova lista de tarefas"
              aria-label="Nova lista de tarefas"
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <div className="folder-tree">
            {(navigation.taskLists || []).map((tl) => {
              const isSelected = selectedQuery.kind === "taskList" && selectedQuery.id === tl.id;
              const colorHex = TASK_LIST_PALETTE.find((c) => c.id === tl.color)?.hex ?? "#3b82f6";
              const IconComp = getTaskListIconComponent(tl.icon);
              return (
                <button
                  key={tl.id}
                  type="button"
                  className={`nav-item task-list-item ${isSelected ? "selected" : ""}`}
                  onClick={() => selectQuery({ kind: "taskList", id: tl.id })}
                  title={tl.name}
                >
                  <span>
                    <IconComp
                      size={14}
                      className="tag-icon task-list-icon"
                      style={{ color: colorHex }}
                    />
                    <span className="nav-item-title">{tl.name}</span>
                  </span>
                  <div className="folder-item-actions">
                    <small className="folder-note-count">{tl.taskCount ?? 0}</small>
                    <div className="folder-hover-btns">
                      <span
                        className="folder-action-btn"
                        role="button"
                        tabIndex={0}
                        title="Editar lista"
                        aria-label={`Editar lista ${tl.name}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setListToEdit(tl);
                          setTaskListDialogOpen(true);
                        }}
                      >
                        <FilePenLine size={13} aria-hidden="true" />
                      </span>
                      {tl.id !== "list-inbox" && (
                        <>
                          <span
                            className="folder-action-btn"
                            role="button"
                            tabIndex={0}
                            title="Arquivar lista"
                            aria-label={`Arquivar lista ${tl.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleArchiveTaskList(tl);
                            }}
                          >
                            <Archive size={13} aria-hidden="true" />
                          </span>
                          <span
                            className="folder-action-btn danger"
                            role="button"
                            tabIndex={0}
                            title="Excluir lista"
                            aria-label={`Excluir lista ${tl.name}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setDeleteListTarget(tl);
                            }}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
            {(navigation.archivedTaskLists || []).length > 0 && (
              <div className="sidebar-archived-section">
                <button
                  type="button"
                  className="sidebar-archived-toggle"
                  onClick={() => setArchivedListsExpanded((prev) => !prev)}
                >
                  <ChevronRight
                    size={13}
                    className={`nav-chevron ${archivedListsExpanded ? "expanded" : ""}`}
                  />
                  <Archive size={13} />
                  <span>Arquivadas ({navigation.archivedTaskLists!.length})</span>
                </button>
                {archivedListsExpanded && (
                  <div className="sidebar-archived-list">
                    {navigation.archivedTaskLists!.map((tl) => {
                      const isSelected = selectedQuery.kind === "taskList" && selectedQuery.id === tl.id;
                      const colorHex = TASK_LIST_PALETTE.find((c) => c.id === tl.color)?.hex ?? "#888";
                      const IconComp = getTaskListIconComponent(tl.icon);
                      return (
                        <button
                          key={tl.id}
                          type="button"
                          className={`nav-item task-list-item archived ${isSelected ? "selected" : ""}`}
                          onClick={() => selectQuery({ kind: "taskList", id: tl.id })}
                          title={`${tl.name} (Arquivada)`}
                        >
                          <span>
                            <IconComp
                              size={14}
                              className="tag-icon task-list-icon"
                              style={{ color: colorHex, opacity: 0.7 }}
                            />
                            <span className="nav-item-title">{tl.name}</span>
                          </span>
                          <div className="folder-item-actions">
                            <small className="folder-note-count">{tl.taskCount ?? 0}</small>
                            <div className="folder-hover-btns">
                              <span
                                className="folder-action-btn"
                                role="button"
                                tabIndex={0}
                                title="Desarquivar lista"
                                aria-label={`Desarquivar lista ${tl.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleUnarchiveTaskList(tl);
                                }}
                              >
                                <ArchiveRestore size={13} aria-hidden="true" />
                              </span>
                              <span
                                className="folder-action-btn danger"
                                role="button"
                                tabIndex={0}
                                title="Excluir lista definitivamente"
                                aria-label={`Excluir lista ${tl.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setDeleteListTarget(tl);
                                }}
                              >
                                <Trash2 size={13} aria-hidden="true" />
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </>

        <>
          <div 
            className="sidebar-section-header" 
            style={{ cursor: "pointer", userSelect: "none" }} 
            onClick={() => setTagsExpanded(prev => !prev)}
            title={tagsExpanded ? "Recolher Etiquetas" : "Expandir Etiquetas"}
          >
            <span className="folder-label" style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              <ChevronRight aria-hidden="true" style={{ width: 14, height: 14, transform: tagsExpanded ? "rotate(90deg)" : "none", transition: "transform 0.15s ease", opacity: 0.7 }} />
              ETIQUETAS
            </span>
            <button className="icon-button mini-add" onClick={(e) => { e.stopPropagation(); setDialogMode({ kind: "tag" }); }} title="Nova etiqueta" aria-label="Nova etiqueta"><Plus aria-hidden="true" /></button>
          </div>
          {tagsExpanded && (
            <div className="folder-tree">
              {navigation.tags.map((tag) => {
                const TagIcon = getTagIconComponent(tag.icon);
                return (
                  <button key={tag.id} className={`nav-item tag-item ${selectedQuery.kind === "tag" && selectedQuery.id === tag.id ? "selected" : ""}`} onClick={() => selectQuery({ kind: "tag", id: tag.id })} title={`#${tag.name}`}>
                    <span><TagIcon className="tag-icon" aria-hidden="true" /><span className="nav-item-title">{tag.name}</span></span>
                    <div className="folder-item-actions">
                      <small className="folder-note-count">{tag.noteCount}</small>
                      <div className="folder-hover-btns">
                        <span className="folder-action-btn" role="button" tabIndex={0} title="Editar etiqueta" aria-label={`Editar etiqueta ${tag.name}`} onClick={(event) => { event.stopPropagation(); setDialogMode({ kind: "tag", tagToEdit: tag }); }}><FilePenLine size={13} aria-hidden="true" /></span>
                        <span className="folder-action-btn danger" role="button" tabIndex={0} title="Excluir etiqueta" aria-label={`Excluir etiqueta ${tag.name}`} onClick={(event) => { event.stopPropagation(); setDeleteTagTarget(tag); }}><Trash2 size={13} aria-hidden="true" /></span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
        </div>

        <div className="sidebar-footer-group">
          <button className={`nav-item trash-item ${view === "deleted" ? "selected" : ""}`} onClick={() => selectQuery({ kind: "deleted" })} title="Lixeira">
            <span><Trash2 aria-hidden="true" /><span className="nav-item-title">Lixeira</span></span>
            <small>{deletedNotes.length}</small>
          </button>
          <footer>
            <div
              className={`footer-status ${syncing ? "syncing" : ""} ${syncConfiguration.configured ? "connected" : "local"}`}
              onClick={() => {
                setSettingsInitialTab("general");
                setSettingsOpen(true);
              }}
              style={{ cursor: "pointer" }}
              title={
                syncing
                  ? "Sincronizando com a nuvem..."
                  : syncConfiguration.configured
                  ? syncConfiguration.autoSyncIntervalMinutes > 0 && nextSyncCountdown
                    ? `Nuvem Ativa — Próxima sincronização automática em ${nextSyncCountdown}`
                    : "Nuvem Ativa — clique para ver configurações"
                  : "Armazenamento local — clique para conectar nuvem"
              }
            >
              <div className="footer-cloud-wrapper">
                <Cloud
                  className={`footer-cloud-icon ${syncing ? "syncing-cloud" : syncConfiguration.configured ? "active-cloud" : "local-cloud"}`}
                  aria-hidden="true"
                />
                <span className={`sync-dot ${syncing ? "pulse-dot" : syncConfiguration.configured ? "cloud-active" : ""}`} />
              </div>
              <span className="footer-status-text">
                {syncing ? "Sincronizando..." : syncConfiguration.configured ? "Nuvem Ativa" : "Armazenamento local"}
              </span>
              {syncConfiguration.configured && syncConfiguration.autoSyncIntervalMinutes > 0 && !syncing && nextSyncCountdown && (
                <span className="footer-sync-countdown" title={`Próxima sincronização automática em ${nextSyncCountdown}`}>
                  {nextSyncCountdown}
                </span>
              )}
            </div>
            <div className="sidebar-footer-actions" style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
              <button
                type="button"
                className="icon-button theme-toggle-btn"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                title={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
                aria-label={isDark ? "Alternar para tema claro" : "Alternar para tema escuro"}
              >
                {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
              </button>
              <button
                type="button"
                className="icon-button settings-btn"
                onClick={() => {
                  setSettingsInitialTab("general");
                  setSettingsOpen(true);
                }}
                title="Preferências & Configurações"
                aria-label="Preferências"
              >
                <Settings aria-hidden="true" />
              </button>
            </div>
          </footer>
        </div>
      </aside>

      {view === "stickers" ? (
        <StickerBoardView
          key={`stickers-${selectedQuery.id ?? "default"}-${taskSyncNonce}`}
          board={
            (navigation.stickerBoards || []).find((b) => b.id === selectedQuery.id) ||
            (navigation.stickerBoards || [])[0] || {
              id: "board-default",
              name: "Geral",
              color: "yellow",
              stickerCount: 0,
            }
          }
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onEditBoard={(board) => {
            setBoardToEdit(board);
            setStickerBoardDialogOpen(true);
          }}
          onDeleteBoard={(board) => setDeleteBoardTarget(board)}
          onStickerCountChange={handleStickerCountChange}
          focusStickerId={focusedStickerId}
        />
      ) : view === "tasks" ? (
        <TaskListView
          list={
            (navigation.taskLists || []).find((l) => l.id === selectedQuery.id) ||
            (navigation.archivedTaskLists || []).find((l) => l.id === selectedQuery.id) ||
            (navigation.taskLists || [])[0] || {
              id: "list-inbox",
              name: "Entrada",
              color: "blue",
              icon: "inbox",
              position: 0,
              taskCount: 0,
              updatedAt: new Date().toISOString(),
            }
          }
          allLists={[...(navigation.taskLists || []), ...(navigation.archivedTaskLists || [])]}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onEditList={(tl) => {
            setListToEdit(tl);
            setTaskListDialogOpen(true);
          }}
          onDeleteList={(tl) => setDeleteListTarget(tl)}
          onArchiveList={handleArchiveTaskList}
          onUnarchiveList={handleUnarchiveTaskList}
          onTaskCountChange={handleTaskCountChange}
          refreshKey={taskSyncNonce}
          focusTaskId={focusedTaskId}
        />
      ) : view === "ideas" ? (
        <IdeaFlowsView
          flows={ideaFlows}
          selectedFlowId={selectedIdeaFlowId}
          onSelectFlow={(flowId) => {
            setSelectedIdeaFlowId(flowId);
            setSelectedQuery(flowId ? { kind: "ideaFlow", id: flowId } : { kind: "ideaFlows" });
          }}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onNewFlow={() => {
            setIdeaFlowToEdit(undefined);
            setIdeaFlowDialogOpen(true);
          }}
          onEditFlow={(flow) => {
            setIdeaFlowToEdit(flow);
            setIdeaFlowDialogOpen(true);
          }}
          onDuplicateFlow={handleDuplicateIdeaFlow}
          onDeleteFlow={(flow) => setDeleteIdeaFlowTarget(flow)}
          onGraphSaved={handleIdeaFlowGraphSaved}
          onNavigateToReference={(kind, id) => void handleNavigateToReference(kind, id)}
          navigation={navigation}
          theme={isDark ? "dark" : "light"}
          demoGraphs={demoIdeaGraphs}
          onSaveDemoGraph={handleSaveDemoIdeaGraph}
        />
      ) : view === "connections" ? (
        <ConnectionsGraphView
          payload={connectionsGraph}
          loading={connectionsLoading}
          sidebarOpen={sidebarOpen}
          onOpenSidebar={() => setSidebarOpen(true)}
          onRefresh={() => void reloadConnectionsGraph()}
          onOpenNoteSeparateWindow={(noteId) => void handleOpenSeparateEditorModal(noteId)}
          onNavigateToNote={(noteId) => void handleNavigateToReference("note", noteId)}
          detachedFocusNoteIds={detachedFocusNoteIds}
        />
      ) : (
        <>
          <section className="note-list" aria-label="Lista de notas">
        <div className="list-toolbar">
          {!sidebarOpen && <button className="icon-button" onClick={() => setSidebarOpen(true)} title="Mostrar barra lateral" aria-label="Mostrar barra lateral"><ChevronRight aria-hidden="true" /></button>}
          <label className="search">
            <Search aria-hidden="true" />
            <input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")} placeholder="Buscar" aria-label="Buscar notas" />
            {query && <button onClick={() => setQuery("")} title="Limpar busca" aria-label="Limpar busca"><X aria-hidden="true" /></button>}
          </label>
          <input ref={fileInputRef} type="file" accept=".md,.markdown,.txt" multiple style={{ display: "none" }} onChange={(event) => void handleFileImport(event)} />
          <button className="icon-button" onClick={() => fileInputRef.current?.click()} title="Importar nota (.md, .txt)" aria-label="Importar nota"><Upload aria-hidden="true" /></button>
          <button className="icon-button compose-button" onClick={() => createNote("code")} title="Novo código" aria-label="Novo código"><FileCode2 aria-hidden="true" /></button>
          <button className="icon-button compose-button" onClick={() => createNote("rtf")} title="Nova nota (Ctrl+N)" aria-label="Nova nota"><FilePenLine aria-hidden="true" /></button>
        </div>
        <div className="list-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1>{view === "deleted" ? "Lixeira" : "Notas"}</h1>
            <p>{visible.length} {visible.length === 1 ? "nota" : "notas"}</p>
          </div>
          {view === "deleted" && deletedNotes.length > 0 && (
            <button className="action-button danger" style={{ fontSize: '12px', padding: '4px 8px' }} onClick={() => void emptyDeletedNotes()} title="Esvaziar lixeira" aria-label="Esvaziar lixeira">
              <Trash2 aria-hidden="true" size={14} /> Esvaziar
            </button>
          )}
        </div>
        <div className="notes" aria-live="polite">
          {isLoading && <div className="list-message">Abrindo notas…</div>}
          {loadError && <div className="list-message error">{loadError}</div>}
          {!isLoading && !loadError && visible.map((note) => {
            const connMeta = noteConnectionsMetaMap.get(note.id);
            const directCount = connMeta?.directCount ?? 0;
            const tagsCount = note.tags?.length ?? connMeta?.tagsCount ?? 0;
            const relatedCount = connMeta?.relatedByTag.length ?? 0;
            return (
              <button
                key={note.id}
                type="button"
                draggable={view !== "deleted"}
                className={`note-row ${note.id === active?.id ? "active" : ""}`}
                onClick={() => selectNote(note.id)}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-magnetares-note", note.id);
                  draggedNoteIdRef.current = note.id;
                  setDraggedNoteId(note.id);
                }}
                onDragEnd={() => {
                  setDraggedNoteId(null);
                  draggedNoteIdRef.current = null;
                  setDropTargetFolderId(null);
                }}
              >
                <strong>
                  {Boolean(note.pinnedAt) && <Pin className="pin-icon" aria-hidden="true" />}
                  {note.type === "code" && <LanguageBadge language={note.language} />}
                  {note.title || "Nova nota"}
                </strong>
                <span className="note-preview"><time>{dateLabel(note.updatedAt)}</time> {(note.bodyText ?? note.body).replace(/\s+/g, " ") || "Nenhum texto adicional"}</span>
                {(directCount > 0 || tagsCount > 0) && (
                  <span className="note-row-conn-indicators">
                    {directCount > 0 && (
                      <span
                        className="note-row-conn-badge direct"
                        title={`${directCount} ${directCount === 1 ? "vínculo direto com outra nota" : "vínculos diretos com outras notas"}`}
                      >
                        <Network size={10} aria-hidden="true" />
                        <span>{directCount} {directCount === 1 ? "vínculo" : "vínculos"}</span>
                      </span>
                    )}
                    {tagsCount > 0 && (
                      <span
                        className="note-row-conn-badge tags"
                        title={`${tagsCount} ${tagsCount === 1 ? "etiqueta" : "etiquetas"}${relatedCount > 0 ? ` · ${relatedCount} nota(s) relacionada(s)` : ""}`}
                      >
                        <Hash size={10} aria-hidden="true" />
                        <span>{tagsCount}</span>
                      </span>
                    )}
                    {relatedCount > 0 && (
                      <span
                        className="note-row-conn-badge related"
                        title={`${relatedCount} ${relatedCount === 1 ? "nota compartilha etiqueta" : "notas compartilham etiquetas"}`}
                      >
                        +{relatedCount} {relatedCount === 1 ? "conexão" : "conexões"}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
          {!isLoading && !loadError && visible.length === 0 && (
            <div className="empty-list">
              {view === "deleted" ? <Trash2 aria-hidden="true" /> : <Search aria-hidden="true" />}
              <strong>{emptyTitle}</strong>
              <p>{emptyDescription}</p>
            </div>
          )}
        </div>
      </section>

      <article className="editor">
        {active ? (
          <>
            <header className="editor-toolbar">
              <span className="breadcrumb">{view === "deleted" ? "Lixeira" : "Notas"} <ChevronRight aria-hidden="true" /></span>
              <div className="editor-actions">
                <span className={`save-state ${saveState}`} role="status">
                  {view === "deleted" && "Na lixeira"}
                  {view === "notes" && saveState === "saving" && "Salvando…"}
                  {view === "notes" && saveState === "saved" && "Salvo"}
                  {view === "notes" && saveState === "error" && "Falha ao salvar"}
                </span>
                {view === "deleted" ? (
                  <>
                    <button className="icon-button restore-button" onClick={() => void restoreNote(active)} title="Restaurar nota" aria-label="Restaurar nota"><RotateCcw aria-hidden="true" /></button>
                    <button className="icon-button delete-button" onClick={() => void permanentlyDeleteNote(active)} title="Excluir definitivamente" aria-label="Excluir definitivamente"><Trash2 aria-hidden="true" /></button>
                  </>
                ) : (
                  <>
                    <button className="icon-button" onClick={handlePrint} title="Imprimir nota" aria-label="Imprimir nota"><Printer aria-hidden="true" /></button>
                    <button className={`icon-button cloud-sync-button ${syncing ? "syncing" : ""}`} onClick={() => void handleQuickSync()} title={syncing ? "Sincronizando com a nuvem" : "Sincronizar com a nuvem"} aria-label="Sincronizar com a nuvem" disabled={syncing}><Cloud aria-hidden="true" /></button>
                    <button
                      type="button"
                      className={`connections-header-cta ${noteLinksPanelOpen ? "active" : ""}`}
                      onClick={() => setNoteLinksPanelOpen((open) => !open)}
                      title="Abrir painel lateral de vínculos, notas e etiquetas"
                      aria-label="Abrir painel lateral de vínculos"
                    >
                      <Network size={15} aria-hidden="true" />
                      {(() => {
                        const activeMeta = noteConnectionsMetaMap.get(active.id);
                        const count =
                          activeNoteConnections.length +
                          (active.tags?.length ?? 0) +
                          (activeMeta?.relatedByTag.length ?? 0);
                        return (
                          <span className="connections-header-cta-badge">{count}</span>
                        );
                      })()}
                    </button>
                    <div className="export-popover-anchor">
                      <button className={`icon-button ${exportMenuOpen ? "active-pin" : ""}`} onClick={() => setExportMenuOpen((open) => !open)} title="Exportar nota" aria-label="Exportar nota"><Download aria-hidden="true" /></button>
                      {exportMenuOpen && (
                        <div className="export-menu" role="menu">
                          {active.type === "code" ? (
                            <>
                              <button type="button" onClick={() => handleExport("code")}><FileCode aria-hidden="true" /> Exportar Código</button>
                              <button type="button" onClick={() => handleExport("pdf")} title="Exportar código em documento PDF nativo">
                                <FileDown aria-hidden="true" /> Documento PDF (.pdf)
                              </button>
                            </>
                          ) : (
                            <>
                              <button type="button" onClick={() => handleExport("pdf")} title="Exportar nota em documento PDF nativo">
                                <FileDown aria-hidden="true" /> Documento PDF (.pdf)
                              </button>
                              <button type="button" onClick={() => handleExport("docx")} title="Exportar artigo formatado no padrão normativo ABNT (NBR 14724 / NBR 6022)">
                                <FileText aria-hidden="true" /> Artigo ABNT (.docx)
                              </button>
                              <button type="button" onClick={() => handleExport("md")}><FileCode aria-hidden="true" /> Markdown (.md)</button>
                              <button type="button" onClick={() => handleExport("html")}><Globe aria-hidden="true" /> HTML (.html)</button>
                            </>
                          )}
                          <button type="button" onClick={() => handleExport("txt")}><FileText aria-hidden="true" /> Texto (.txt)</button>
                        </div>
                      )}
                    </div>
                    <button className={`icon-button ${active.pinnedAt ? "active-pin" : ""}`} onClick={() => void togglePinActiveNote()} title={active.pinnedAt ? "Desafixar nota" : "Fixar nota"} aria-label={active.pinnedAt ? "Desafixar nota" : "Fixar nota"}><Pin aria-hidden="true" /></button>
                    <button className={`icon-button focus-trigger-button ${detachedFocusNoteIds.has(active.id) ? "active-pin" : ""}`} onClick={() => void handleLaunchFocusMode(active)} title={detachedFocusNoteIds.has(active.id) ? "Nota aberta em janela independente de foco" : "Destacar nota no Modo Foco (Janela independente)"} aria-label="Destacar nota no Modo Foco"><PictureInPicture2 aria-hidden="true" size={17} /></button>
                    <button className="icon-button danger-button" onClick={() => void deleteNote(active)} title="Mover para a Lixeira" aria-label="Apagar nota"><Trash2 aria-hidden="true" /></button>
                    <button className="icon-button" onClick={() => createNote("rtf")} title="Nova nota (Ctrl+N)" aria-label="Nova nota"><FilePenLine aria-hidden="true" /></button>
                  </>
                )}
              </div>
            </header>
            {detachedFocusNoteIds.has(active.id) ? (
              <div className="focus-mode-active-placeholder">
                <div className="focus-mode-badge-pulse">
                  <PictureInPicture2 size={40} aria-hidden="true" />
                </div>
                <h2>Modo Foco Ativado</h2>
                <p className="focus-mode-desc">
                  A nota <strong>"{active.title || "Sem título"}"</strong> está aberta em uma janela independente para você estudar, assistir a aulas e fazer anotações lado a lado.
                </p>
                <div className="focus-mode-actions">
                  <button
                    type="button"
                    className="focus-return-cta"
                    onClick={() => handleCloseFocusWindow(active.id)}
                  >
                    <Minimize2 size={16} aria-hidden="true" /> Retornar edição para esta janela
                  </button>
                </div>
                <div className="focus-mode-tips">
                  <span>💡 <strong>Acesso Total:</strong> Você pode navegar e utilizar todo o Magnetares (como ler listas de tarefas, stickers, outras notas e pastas) normalmente enquanto a nota estiver destacada.</span>
                </div>
              </div>
            ) : (
            <div className="editor-workspace-row">
            <div className="editor-scroll-area">
              <div className="editor-page">
                <time className="edited-at">{fullDateLabel(active.updatedAt)}</time>
                <input ref={titleRef} className="title" value={active.title} onChange={(event) => save({ title: event.target.value })} onBlur={() => void flushNote(active.id)} placeholder="Título" aria-label="Título da nota" readOnly={view === "deleted"} />
                <h1 className="print-title" aria-hidden="true">{active.title || "Sem título"}</h1>

                {view !== "deleted" && (
                  <div className="note-location-row">
                    <Folder aria-hidden="true" />
                    <span className="note-location-label">Pasta</span>
                    <strong className="note-location-value">{active.folder ?? "Notas"}</strong>
                    {(() => {
                      const activeMeta = noteConnectionsMetaMap.get(active.id);
                      const directCount = activeNoteConnections.length;
                      const relatedCount = activeMeta?.relatedByTag.length ?? 0;
                      const tagsCount = active.tags?.length ?? 0;
                      const hasAnyConnection = directCount > 0 || relatedCount > 0 || tagsCount > 0;
                      return (
                        <button
                          type="button"
                          className={`note-location-conn-indicator ${hasAnyConnection ? "connected" : ""}`}
                          onClick={() => setNoteLinksPanelOpen(true)}
                          title="Clique para gerenciar os vínculos e etiquetas desta nota no painel lateral"
                        >
                          <Network size={12} aria-hidden="true" />
                          {hasAnyConnection ? (
                            <span>
                              {directCount > 0
                                ? `${directCount} ${directCount === 1 ? "vínculo" : "vínculos"}`
                                : `${tagsCount} ${tagsCount === 1 ? "etiqueta" : "etiquetas"}`}
                              {relatedCount > 0
                                ? ` · ${relatedCount} ${relatedCount === 1 ? "nota conectada" : "notas conectadas"}`
                                : ""}
                            </span>
                          ) : (
                            <span>Vincular nota</span>
                          )}
                        </button>
                      );
                    })()}
                    <span className="note-location-hint">Arraste a nota para outra pasta na barra lateral</span>
                  </div>
                )}

                {view !== "deleted" && (
                  <div className="tag-chips-bar">
                    {(active.tags ?? []).map((tag) => (
                      <span key={tag} className="tag-chip" title={`#${tag}`}>
                        <span className="tag-chip-text">#{tag}</span>
                        <button type="button" onClick={() => void removeTagFromActiveNote(tag)} title={`Remover etiqueta #${tag}`} aria-label={`Remover etiqueta #${tag}`}><X aria-hidden="true" /></button>
                      </span>
                    ))}
                    {tagInputOpen ? (() => {
                      const lowerInput = newTagInput.trim().toLowerCase();
                      const suggestedTags = navigation.tags.filter((t) => 
                        !active.tags?.includes(t.name) &&
                        (lowerInput === "" || t.name.toLowerCase().includes(lowerInput))
                      );
                      return (
                      <div className="new-tag-input-box">
                        <input
                          autoFocus
                          value={newTagInput}
                          onChange={(event) => setNewTagInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              // If they typed something and hit enter, try to use exact match if there's only 1, or just the input string
                              const exactMatch = suggestedTags.find(t => t.name.toLowerCase() === lowerInput);
                              void addTagToActiveNote(exactMatch ? exactMatch.name : newTagInput);
                            } else if (event.key === "Escape") {
                              setTagInputOpen(false);
                              setNewTagInput("");
                            }
                          }}
                          placeholder="etiqueta..."
                        />
                        {suggestedTags.length > 0 && (
                          <div className="tag-suggestions-popover">
                            {suggestedTags.map((tag) => {
                              const Icon = getTagIconComponent(tag.icon);
                              return (
                                <button 
                                  key={tag.id} 
                                  type="button" 
                                  onMouseDown={(e) => { 
                                    e.preventDefault(); // Prevents input from losing focus
                                    void addTagToActiveNote(tag.name); 
                                  }}
                                >
                                  <Icon size={14} /> {tag.name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <button type="button" onClick={() => void addTagToActiveNote(newTagInput)} title="Adicionar"><Check aria-hidden="true" /></button>
                      </div>
                      );
                    })() : (
                      <button type="button" className="add-tag-chip" onClick={() => setTagInputOpen(true)}>
                        <Plus aria-hidden="true" /> Etiqueta
                      </button>
                    )}
                  </div>
                )}

                {active.type === "code" ? (
                  <CodeEditor 
                    key={`code-${active.id}`} 
                    value={active.body} 
                    language={active.language || "plaintext"} 
                    title={active.title || "Protótipo"}
                    readOnly={view === "deleted"} 
                    onChange={(text) => save({ body: text, bodyText: text })} 
                    onLanguageChange={(lang) => save({ language: lang })}
                    onBlur={() => void flushNote(active.id)} 
                  />
                ) : (
                  <StructuredEditor 
                    key={active.id} 
                    value={active.body} 
                    readOnly={view === "deleted"} 
                    currentNoteId={active.id}
                    availableNotes={availableLinkNotes}
                    onOpenConnectionsPanel={() => setNoteLinksPanelOpen(true)}
                    onOpenLinkedNote={(linkedId, _title, openSeparateWindow) => {
                      if (openSeparateWindow) {
                        void handleOpenSeparateEditorModal(linkedId);
                      } else {
                        void handleNavigateToReference("note", linkedId);
                      }
                    }}
                    onChange={(document, text) => save({ body: document, bodyText: text })} 
                    onBlur={() => void flushNote(active.id)} 
                  />
                )}

                {(() => {
                  const activeMeta = noteConnectionsMetaMap.get(active.id);
                  const relatedByTag = activeMeta?.relatedByTag ?? [];
                  const totalConnected = activeNoteConnections.length + relatedByTag.length;
                  if (view === "deleted" || totalConnected === 0) return null;
                  return (
                    <section className="note-connections-panel" aria-label="Conexões desta nota">
                      <div className="note-connections-header">
                        <div className="note-connections-title">
                          <Network size={14} aria-hidden="true" />
                          <span>Conexões desta nota ({totalConnected})</span>
                        </div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            type="button"
                            className="note-connections-map-btn"
                            onClick={() => setNoteLinksPanelOpen(true)}
                          >
                            Gerenciar vínculos
                          </button>
                          <button
                            type="button"
                            className="note-connections-map-btn"
                            onClick={() => selectQuery({ kind: "connections" })}
                            title="Visualizar todas as conexões no mapa de grafos"
                          >
                            Ver no mapa
                          </button>
                        </div>
                      </div>
                      <div className="note-connections-chips">
                        {activeNoteConnections.map((conn) => (
                          <div key={`${conn.direction}-${conn.noteId}`} className={`note-connection-pill-wrap ${conn.direction}`}>
                            <button
                              type="button"
                              className={`note-connection-pill ${conn.direction}`}
                              onClick={() => void handleOpenSeparateEditorModal(conn.noteId)}
                              title={
                                conn.direction === "outgoing"
                                  ? `Link citado nesta nota (${conn.folder}) · Abrir editor em janela separada`
                                  : `Backlink recebido de "${conn.title}" (${conn.folder}) · Abrir editor em janela separada`
                              }
                            >
                              <span className="dir-arrow" aria-hidden="true">
                                {conn.direction === "outgoing" ? "→" : "←"}
                              </span>
                              <span>{conn.title || "Sem título"}</span>
                            </button>
                          </div>
                        ))}
                        {relatedByTag.map((rel) => (
                          <div key={`tagrel-${rel.id}`} className="note-connection-pill-wrap tag-related">
                            <button
                              type="button"
                              className="note-connection-pill tag-related"
                              onClick={() => void handleOpenSeparateEditorModal(rel.id)}
                              title={`Conectada pela etiqueta #${rel.sharedTag} (${rel.folder}) · Abrir editor em janela separada`}
                            >
                              <Hash size={11} aria-hidden="true" />
                              <span>{rel.title || "Sem título"}</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  );
                })()}

                <footer className="print-footer" aria-hidden="true">
                  <span className="print-footer-brand">Gerado via Magnetares Notes</span>
                  <span className="print-footer-meta">
                    {active.title ? active.title.trim() : "Nota"} • {fullDateLabel(active.updatedAt)}
                  </span>
                </footer>
              </div>
            </div>

            {view !== "deleted" && noteLinksPanelOpen && (
              <aside className="note-links-side-panel" aria-label="Painel lateral de vínculos e etiquetas">
                <div className="note-links-side-head">
                  <div className="note-links-side-title">
                    <Network size={15} aria-hidden="true" />
                    <strong>Vínculos & Etiquetas</strong>
                  </div>
                  <div className="note-links-side-head-actions">
                    <button
                      type="button"
                      className="note-connections-map-btn"
                      onClick={() => selectQuery({ kind: "connections" })}
                      title="Abrir mapa completo de conexões"
                    >
                      Ver Mapa
                    </button>
                    <button
                      type="button"
                      className="icon-button mini"
                      onClick={() => setNoteLinksPanelOpen(false)}
                      title="Fechar painel lateral"
                      aria-label="Fechar painel lateral"
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div className="note-links-side-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={noteLinksPanelTab === "notes"}
                    className={`note-links-side-tab ${noteLinksPanelTab === "notes" ? "active" : ""}`}
                    onClick={() => setNoteLinksPanelTab("notes")}
                  >
                    <Link2 size={12} aria-hidden="true" />
                    <span>Vincular ({Math.max(0, availableLinkNotes.length - 1)})</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={noteLinksPanelTab === "tags"}
                    className={`note-links-side-tab ${noteLinksPanelTab === "tags" ? "active" : ""}`}
                    onClick={() => setNoteLinksPanelTab("tags")}
                  >
                    <Hash size={12} aria-hidden="true" />
                    <span>Etiquetas ({navigation.tags.length})</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={noteLinksPanelTab === "connected"}
                    className={`note-links-side-tab ${noteLinksPanelTab === "connected" ? "active" : ""}`}
                    onClick={() => setNoteLinksPanelTab("connected")}
                  >
                    <Network size={12} aria-hidden="true" />
                    <span>
                      Ativas (
                      {activeNoteConnections.length +
                        (noteConnectionsMetaMap.get(active.id)?.relatedByTag.length ?? 0)}
                      )
                    </span>
                  </button>
                </div>

                {noteLinksPanelTab !== "connected" && (
                  <div className="note-links-side-filters">
                    <div className="connections-explorer-search">
                      <Search size={13} className="connections-search-icon" aria-hidden="true" />
                      <input
                        type="search"
                        value={noteLinksPanelSearch}
                        onChange={(e) => setNoteLinksPanelSearch(e.target.value)}
                        placeholder={
                          noteLinksPanelTab === "notes"
                            ? "Buscar nota por título ou pasta..."
                            : "Buscar ou criar nova etiqueta..."
                        }
                        aria-label="Buscar no catálogo de vínculos"
                      />
                    </div>
                    {noteLinksPanelTab === "notes" && (
                      <CustomSelect
                        compact
                        className="note-links-folder-select"
                        value={noteLinksPanelFolder}
                        options={[
                          { value: "", label: "Todas as pastas", icon: <Folder size={13} /> },
                          ...navigation.folders.map((f) => ({
                            value: f.name,
                            label: f.name,
                            icon: <Folder size={13} />,
                          })),
                        ]}
                        onChange={(val) => setNoteLinksPanelFolder(val)}
                        ariaLabel="Filtrar notas por pasta"
                        title="Filtrar notas por pasta"
                      />
                    )}
                  </div>
                )}

                <div className="note-links-side-body">
                  {noteLinksPanelTab === "notes" &&
                    (() => {
                      const needle = noteLinksPanelSearch.trim().toLocaleLowerCase();
                      const linkedIds = new Set(activeNoteConnections.map((c) => c.noteId));
                      const candidates = availableLinkNotes.filter((item) => {
                        if (item.id === active.id) return false;
                        if (noteLinksPanelFolder && item.folder !== noteLinksPanelFolder) {
                          return false;
                        }
                        if (!needle) return true;
                        return (
                          (item.title || "Sem título").toLocaleLowerCase().includes(needle) ||
                          (item.folder || "").toLocaleLowerCase().includes(needle)
                        );
                      });

                      if (candidates.length === 0) {
                        return (
                          <p className="connections-list-empty">
                            Nenhuma nota encontrada com esse filtro.
                          </p>
                        );
                      }

                      return candidates.map((item) => {
                        const isAlreadyLinked = linkedIds.has(item.id);
                        return (
                          <div key={item.id} className="note-links-catalog-row">
                            <div className="note-links-catalog-info">
                              <strong>{item.title || "Sem título"}</strong>
                              <small>{item.folder || "Notas"}</small>
                            </div>
                            <div className="note-links-catalog-actions">
                              <button
                                type="button"
                                className={`note-links-insert-btn icon-only ${isAlreadyLinked ? "linked" : ""}`}
                                onClick={() => insertNoteLinkIntoNote(item.id, item.title || "Sem título")}
                                title={
                                  isAlreadyLinked
                                    ? "Inserir vínculo [[Nota]] novamente no texto da nota atual"
                                    : "Inserir vínculo [[Nota]] no texto da nota atual"
                                }
                                aria-label={`Vincular ${item.title || "nota"}`}
                              >
                                <Plus size={14} aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                className="icon-button mini"
                                onClick={() => void handleOpenSeparateEditorModal(item.id)}
                                title="Abrir nota em janela separada"
                                aria-label={`Abrir ${item.title || "nota"} em janela separada`}
                              >
                                <PictureInPicture2 size={13} aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        );
                      });
                    })()}

                  {noteLinksPanelTab === "tags" &&
                    (() => {
                      const needle = noteLinksPanelSearch.trim();
                      const lowerNeedle = needle.toLocaleLowerCase().replace(/^#/, "");
                      const activeTagsSet = new Set(
                        (active.tags ?? []).map((t) => t.toLocaleLowerCase())
                      );
                      const filteredTags = navigation.tags.filter((t) =>
                        !lowerNeedle ? true : t.name.toLocaleLowerCase().includes(lowerNeedle)
                      );
                      const exactExists = navigation.tags.some(
                        (t) => t.name.toLocaleLowerCase() === lowerNeedle
                      );

                      return (
                        <>
                          {lowerNeedle && !exactExists && (
                            <button
                              type="button"
                              className="note-links-create-tag-btn"
                              onClick={() => {
                                void addTagToActiveNote(lowerNeedle);
                                setNoteLinksPanelSearch("");
                              }}
                            >
                              <Plus size={13} aria-hidden="true" />
                              <span>Criar e associar etiqueta #{lowerNeedle}</span>
                            </button>
                          )}
                          {filteredTags.map((t) => {
                            const attached = activeTagsSet.has(t.name.toLocaleLowerCase());
                            return (
                              <div key={t.id} className="note-links-catalog-row">
                                <div className="note-links-catalog-info">
                                  <strong>#{t.name}</strong>
                                  <small>
                                    {t.noteCount ?? 0} {(t.noteCount ?? 0) === 1 ? "nota" : "notas"}
                                  </small>
                                </div>
                                <button
                                  type="button"
                                  className={`note-links-insert-btn ${attached ? "linked" : ""}`}
                                  onClick={() => {
                                    if (attached) {
                                      void removeTagFromActiveNote(t.name);
                                    } else {
                                      void addTagToActiveNote(t.name);
                                    }
                                  }}
                                >
                                  {attached ? (
                                    <>
                                      <Check size={12} aria-hidden="true" />
                                      <span>Associada</span>
                                    </>
                                  ) : (
                                    <>
                                      <Plus size={12} aria-hidden="true" />
                                      <span>Associar</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                          {filteredTags.length === 0 && !lowerNeedle && (
                            <p className="connections-list-empty">
                              Digite acima para criar sua primeira etiqueta.
                            </p>
                          )}
                        </>
                      );
                    })()}

                  {noteLinksPanelTab === "connected" &&
                    (() => {
                      const relatedByTag =
                        noteConnectionsMetaMap.get(active.id)?.relatedByTag ?? [];
                      return (
                        <div className="connections-inspector-lists" style={{ borderTop: 0, paddingTop: 0 }}>
                          <div className="connections-list-block">
                            <h4>Vínculos diretos ({activeNoteConnections.length})</h4>
                            {activeNoteConnections.length > 0 ? (
                              activeNoteConnections.map((conn) => (
                                <div
                                  key={`${conn.direction}-${conn.noteId}`}
                                  className="connections-neighbor-row"
                                >
                                  <button
                                    type="button"
                                    className="connections-neighbor-btn"
                                    onClick={() => void handleOpenSeparateEditorModal(conn.noteId)}
                                    title="Clique para abrir no editor de janela separada"
                                  >
                                    <span className="dir-arrow" aria-hidden="true">
                                      {conn.direction === "outgoing" ? "→" : "←"}
                                    </span>
                                    <span>{conn.title || "Sem título"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button mini"
                                    onClick={() => void handleNavigateToReference("note", conn.noteId)}
                                    title="Ir para esta nota no painel principal"
                                  >
                                    <ExternalLink size={12} aria-hidden="true" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="connections-list-empty">
                                Nenhum vínculo direto ainda. Use a aba "Vincular" ou digite{" "}
                                <code>[[</code> no texto.
                              </p>
                            )}
                          </div>

                          <div className="connections-list-block">
                            <h4>Notas conectadas por etiquetas ({relatedByTag.length})</h4>
                            {relatedByTag.length > 0 ? (
                              relatedByTag.map((rel) => (
                                <div key={rel.id} className="connections-neighbor-row">
                                  <button
                                    type="button"
                                    className="connections-neighbor-btn"
                                    onClick={() => void handleOpenSeparateEditorModal(rel.id)}
                                    title={`Compartilha #${rel.sharedTag} · Clique para abrir em janela separada`}
                                  >
                                    <Hash size={12} aria-hidden="true" />
                                    <span>{rel.title || "Sem título"}</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="icon-button mini"
                                    onClick={() => void handleNavigateToReference("note", rel.id)}
                                    title="Ir para esta nota no painel principal"
                                  >
                                    <ExternalLink size={12} aria-hidden="true" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <p className="connections-list-empty">
                                Nenhuma outra nota compartilha as etiquetas atuais.
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                </div>
              </aside>
            )}
            </div>
            )}
          </>
        ) : (
          <div className="empty-editor">
            {view === "deleted" ? <Trash2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            <strong>{view === "deleted" ? "Nenhuma nota apagada" : "Nenhuma nota selecionada"}</strong>
            {view === "notes" && <button onClick={() => createNote("rtf")}>Criar uma nota</button>}
          </div>
        )}
      </article>
      </>
      )}

      {dialogMode && (
        <OrganizationDialog
          mode={dialogMode}
          navigation={navigation}
          onClose={() => setDialogMode(null)}
          onSaveFolder={handleSaveFolder}
          onSaveTag={handleSaveTag}
          onSaveSmartFolder={handleSaveSmartFolder}
        />
      )}

      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onThemeChange={setTheme}
          dbPath={dbPath}
          onDbPathChange={handleDbPathChange}
          tursoDatabaseURL={syncConfiguration.tursoDatabaseUrl}
          autoSyncIntervalMinutes={syncConfiguration.autoSyncIntervalMinutes}
          syncConfigured={syncConfiguration.configured}
          onSaveSyncConfiguration={handleSaveSyncConfiguration}
          onAutoSyncIntervalChange={handleSaveAutoSyncInterval}
          onSyncNow={handleSyncWithCloud}
          initialTab={settingsInitialTab}
          appInfo={appInfo}
          updateInfo={updateInfo}
          checkingUpdates={checkingUpdates}
          updateCheckError={updateCheckError}
          onCheckForUpdates={() => handleCheckForUpdates(false)}
          onOpenExternalURL={openExternalURL}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {conflictsOpen && conflicts.length > 0 && (
        <ConflictDialog
          conflicts={conflicts}
          onResolve={handleResolveConflict}
          onClose={() => {
            setConflictsOpen(false);
            setSyncNotification(null);
          }}
        />
      )}

      {deleteFolderTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteFolderTarget(null)}>
          <div className="organization-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-folder-dialog-title" style={{ maxWidth: 420 }}>
            <header>
              <Trash2 aria-hidden="true" style={{ color: "#ef4444" }} />
              <h2 id="delete-folder-dialog-title">Excluir pasta</h2>
              <button type="button" onClick={() => setDeleteFolderTarget(null)} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
            </header>
            <p style={{ marginTop: 12, marginBottom: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              Ao excluir a pasta <strong>"{deleteFolderTarget.name}"</strong>, todas as notas nela contidas serão enviadas para a pasta padrão (<strong>Notas</strong>). Deseja continuar?
            </p>
            <footer>
              <button type="button" onClick={() => setDeleteFolderTarget(null)}>Cancelar</button>
              <button
                type="button"
                style={{ background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }}
                onClick={() => void handleDeleteFolder(deleteFolderTarget)}
              >
                Excluir pasta
              </button>
            </footer>
          </div>
        </div>
      )}

      {deleteTagTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteTagTarget(null)}>
          <div className="organization-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-tag-dialog-title" style={{ maxWidth: 420 }}>
            <header>
              <Trash2 aria-hidden="true" style={{ color: "#ef4444" }} />
              <h2 id="delete-tag-dialog-title">Excluir etiqueta</h2>
              <button type="button" onClick={() => setDeleteTagTarget(null)} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
            </header>
            <p style={{ marginTop: 12, marginBottom: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              A etiqueta <strong>#{deleteTagTarget.name}</strong> será removida das notas. Etiquetas usadas por Pastas Inteligentes não podem ser excluídas.
            </p>
            <footer>
              <button type="button" onClick={() => setDeleteTagTarget(null)}>Cancelar</button>
              <button type="button" style={{ background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }} onClick={() => void handleDeleteTag(deleteTagTarget)}>
                Excluir etiqueta
              </button>
            </footer>
          </div>
        </div>
      )}

      {deleteBoardTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteBoardTarget(null)}>
          <div className="organization-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-board-dialog-title" style={{ maxWidth: 420 }}>
            <header>
              <Trash2 aria-hidden="true" style={{ color: "#ef4444" }} />
              <h2 id="delete-board-dialog-title">Excluir quadro</h2>
              <button type="button" onClick={() => setDeleteBoardTarget(null)} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
            </header>
            <p style={{ marginTop: 12, marginBottom: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              Tem certeza que deseja excluir o quadro <strong>{deleteBoardTarget.name}</strong>? Os stickers deste quadro serão arquivados.
            </p>
            <footer>
              <button type="button" className="ghost" onClick={() => setDeleteBoardTarget(null)}>Cancelar</button>
              <button type="button" style={{ background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }} onClick={() => void handleDeleteStickerBoard(deleteBoardTarget)}>
                Excluir quadro
              </button>
            </footer>
          </div>
        </div>
      )}

      {stickerBoardDialogOpen && (
        <StickerBoardDialog
          boardToEdit={boardToEdit}
          onClose={() => {
            setStickerBoardDialogOpen(false);
            setBoardToEdit(undefined);
          }}
          onSave={handleSaveStickerBoard}
        />
      )}

      {deleteListTarget && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setDeleteListTarget(null)}>
          <div className="organization-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-list-dialog-title" style={{ maxWidth: 440 }}>
            <header>
              <Trash2 aria-hidden="true" style={{ color: "#ef4444" }} />
              <h2 id="delete-list-dialog-title">Excluir lista definitivamente</h2>
              <button type="button" onClick={() => setDeleteListTarget(null)} aria-label="Fechar" title="Fechar"><X aria-hidden="true" /></button>
            </header>
            <div style={{ marginTop: 12, marginBottom: 20, fontSize: 13, lineHeight: 1.5, color: "var(--muted)" }}>
              <p style={{ margin: 0, marginBottom: 10 }}>
                Tem certeza que deseja excluir permanentemente a lista <strong>{deleteListTarget.name}</strong>?
              </p>
              <p style={{ margin: 0, marginBottom: 12, color: "#dc2626", fontWeight: 600 }}>
                A lista e todas as suas tarefas serão excluídas permanentemente no seu dispositivo e na nuvem imediatamente (se conectado).
              </p>
              <p style={{ margin: 0, fontSize: 12 }}>
                Dica: Se você deseja apenas ocultar esta lista da visão principal e manter todas as tarefas preservadas para consulta, selecione <strong>Arquivar lista</strong>.
              </p>
            </div>
            <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" className="ghost" onClick={() => setDeleteListTarget(null)}>Cancelar</button>
              <button
                type="button"
                className="ghost"
                style={{ color: "#d97706", borderColor: "rgba(217, 119, 6, 0.4)" }}
                onClick={() => {
                  const target = deleteListTarget;
                  setDeleteListTarget(null);
                  void handleArchiveTaskList(target);
                }}
              >
                Arquivar lista
              </button>
              <button
                type="button"
                style={{ background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }}
                onClick={() => void handleDeleteTaskList(deleteListTarget)}
              >
                Excluir permanentemente
              </button>
            </footer>
          </div>
        </div>
      )}

      {taskListDialogOpen && (
        <TaskListDialog
          listToEdit={listToEdit}
          onClose={() => {
            setTaskListDialogOpen(false);
            setListToEdit(undefined);
          }}
          onSave={handleSaveTaskList}
        />
      )}

      {deleteIdeaFlowTarget && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDeleteIdeaFlowTarget(null)}
        >
          <div
            className="organization-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-idea-flow-dialog-title"
            style={{ maxWidth: 420 }}
          >
            <header>
              <Trash2 aria-hidden="true" style={{ color: "#ef4444" }} />
              <h2 id="delete-idea-flow-dialog-title">Excluir fluxo de ideias</h2>
              <button
                type="button"
                onClick={() => setDeleteIdeaFlowTarget(null)}
                aria-label="Fechar"
                title="Fechar"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <p style={{ marginTop: 12, marginBottom: 20, color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              Tem certeza que deseja excluir o fluxo <strong>{deleteIdeaFlowTarget.title}</strong>? Todos os nós e conexões deste mapa mental serão removidos.
            </p>
            <footer>
              <button type="button" className="ghost" onClick={() => setDeleteIdeaFlowTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                style={{ background: "#dc2626", color: "#ffffff", borderColor: "#b91c1c" }}
                onClick={() => void handleDeleteIdeaFlow(deleteIdeaFlowTarget)}
              >
                Excluir fluxo
              </button>
            </footer>
          </div>
        </div>
      )}

      {ideaFlowDialogOpen && (
        <IdeaFlowDialog
          flowToEdit={ideaFlowToEdit}
          onClose={() => {
            setIdeaFlowDialogOpen(false);
            setIdeaFlowToEdit(undefined);
          }}
          onSave={handleSaveIdeaFlow}
        />
      )}

      {updateInfo?.hasUpdate &&
        !updateBannerDismissed &&
        updateInfo.latestVersion !== localStorage.getItem("magnetares_dismissed_update") && (
          <aside className="update-notification-banner" role="status" aria-live="polite">
            <div className="update-notification-icon" aria-hidden="true">
              <Sparkles />
            </div>
            <div className="update-notification-body">
              <div className="update-notification-header">
                <div>
                  <strong>Nova versão disponível: v{updateInfo.latestVersion}</strong>
                  <span>Versão atual: v{updateInfo.currentVersion}</span>
                </div>
                <button
                  type="button"
                  className="update-notification-close"
                  aria-label="Dispensar notificação de atualização"
                  title="Dispensar"
                  onClick={() => {
                    localStorage.setItem("magnetares_dismissed_update", updateInfo.latestVersion);
                    setUpdateBannerDismissed(true);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </div>
              <div className="update-notification-actions">
                <button
                  type="button"
                  className="update-notification-download"
                  onClick={() => openExternalURL(updateInfo.websiteUrl || updateInfo.downloadUrl)}
                >
                  <Download aria-hidden="true" /> Baixar atualização
                </button>
                <button
                  type="button"
                  className="update-notification-about"
                  onClick={() => {
                    setSettingsInitialTab("about");
                    setSettingsOpen(true);
                  }}
                >
                  Sobre
                </button>
              </div>
            </div>
          </aside>
        )}
      {floatingModalNote && (
        <div
          className="dialog-backdrop separate-note-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Editor em janela separada: ${floatingModalNote.title || "Sem título"}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              void flushNote(floatingModalNote.id);
              setFloatingModalNoteId(null);
            }
          }}
        >
          <div className="separate-note-modal-window">
            <header className="separate-note-modal-header">
              <div className="separate-note-modal-meta">
                <span className="separate-note-modal-badge">
                  <PictureInPicture2 size={14} aria-hidden="true" />
                  <span>Janela Separada</span>
                </span>
                <span className="separate-note-modal-folder">
                  <Folder size={13} aria-hidden="true" />
                  <span>{floatingModalNote.folder || "Notas"}</span>
                </span>
              </div>
              <div className="separate-note-modal-actions">
                <button
                  type="button"
                  className="connections-secondary-btn"
                  onClick={() => {
                    const targetId = floatingModalNote.id;
                    void flushNote(targetId);
                    setFloatingModalNoteId(null);
                    void handleNavigateToReference("note", targetId);
                  }}
                  title="Abrir esta nota no painel principal de notas"
                >
                  <ExternalLink size={13} aria-hidden="true" />
                  <span>Ir para a nota no painel</span>
                </button>
                <button
                  type="button"
                  className="connections-secondary-btn"
                  onClick={() => {
                    const targetId = floatingModalNote.id;
                    void flushNote(targetId);
                    setFloatingModalNoteId(null);
                    void handleLaunchFocusById(targetId);
                  }}
                  title="Destacar em janela independente do sistema operacional"
                >
                  <PictureInPicture2 size={13} aria-hidden="true" />
                  <span>Destacar no sistema</span>
                </button>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => {
                    void flushNote(floatingModalNote.id);
                    setFloatingModalNoteId(null);
                  }}
                  title="Fechar editor (Esc)"
                  aria-label="Fechar janela separada"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </header>

            <div className="separate-note-modal-body">
              <div className="separate-note-modal-page">
                <time className="edited-at">{fullDateLabel(floatingModalNote.updatedAt)}</time>
                <input
                  className="title"
                  value={floatingModalNote.title}
                  onChange={(e) => saveNoteById(floatingModalNote.id, { title: e.target.value })}
                  onBlur={() => void flushNote(floatingModalNote.id)}
                  placeholder="Título da nota"
                  aria-label="Título da nota"
                />

                <div className="tag-chips-bar">
                  {(floatingModalNote.tags ?? []).map((tag) => (
                    <span key={tag} className="tag-chip" title={`#${tag}`}>
                      <span className="tag-chip-text">#{tag}</span>
                      <button
                        type="button"
                        onClick={() => void toggleTagOnNoteById(floatingModalNote.id, tag)}
                        title={`Remover etiqueta #${tag}`}
                        aria-label={`Remover etiqueta #${tag}`}
                      >
                        <X aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  <div className="new-tag-input-box">
                    <input
                      value={floatingModalTagInput}
                      onChange={(e) => setFloatingModalTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && floatingModalTagInput.trim()) {
                          e.preventDefault();
                          void toggleTagOnNoteById(floatingModalNote.id, floatingModalTagInput);
                          setFloatingModalTagInput("");
                        }
                      }}
                      placeholder="+ etiqueta..."
                    />
                    {floatingModalTagInput.trim() && (
                      <button
                        type="button"
                        onClick={() => {
                          void toggleTagOnNoteById(floatingModalNote.id, floatingModalTagInput);
                          setFloatingModalTagInput("");
                        }}
                        title="Adicionar etiqueta"
                      >
                        <Check aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {floatingModalNote.type === "code" ? (
                  <CodeEditor
                    key={`modal-code-${floatingModalNote.id}`}
                    value={floatingModalNote.body}
                    language={floatingModalNote.language || "plaintext"}
                    title={floatingModalNote.title || "Protótipo"}
                    readOnly={false}
                    onChange={(text) =>
                      saveNoteById(floatingModalNote.id, { body: text, bodyText: text })
                    }
                    onLanguageChange={(lang) =>
                      saveNoteById(floatingModalNote.id, { language: lang })
                    }
                    onBlur={() => void flushNote(floatingModalNote.id)}
                  />
                ) : (
                  <StructuredEditor
                    key={`modal-rtf-${floatingModalNote.id}`}
                    value={floatingModalNote.body}
                    readOnly={false}
                    currentNoteId={floatingModalNote.id}
                    availableNotes={availableLinkNotes}
                    onOpenLinkedNote={(linkedId) => {
                      void flushNote(floatingModalNote.id);
                      void handleOpenSeparateEditorModal(linkedId);
                    }}
                    onChange={(document, text) =>
                      saveNoteById(floatingModalNote.id, { body: document, bodyText: text })
                    }
                    onBlur={() => void flushNote(floatingModalNote.id)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
    </div>
  );
}
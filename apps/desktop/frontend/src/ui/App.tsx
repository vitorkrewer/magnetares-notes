import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Download, FileCode, FileCode2, FilePenLine, FileText, Folder, Globe, List, Pin, Plus, Printer, RotateCcw, Search, Settings, Sparkles, StickyNote, Trash2, Upload, X } from "lucide-react";
import { StructuredEditor } from "./StructuredEditor";
import { CodeEditor } from "./CodeEditor";
import { TitleBar } from "./TitleBar";
import { OrganizationDialog, getFolderIconComponent, getTagIconComponent } from "./OrganizationDialog";
import { SettingsDialog, type ThemeOption } from "./SettingsDialog";
import { ConflictDialog } from "./ConflictDialog";
import { StickerBoardDialog, STICKER_PALETTE, DelicateStickerIcon } from "./StickerBoardDialog";
import { StickerBoardView } from "./StickerBoardView";
import { FolderRecord, NavigationRecord, Note, NoteQuery, SmartFolderRecord, StickerBoardRecord, SyncConfiguration, SyncConflict, SyncResult, TagRecord } from "./types";
import { downloadFile, exportToHTML, exportToMarkdown, parseImportedFile } from "./exportUtils";

type SaveState = "saved" | "saving" | "error";
type LibraryView = "notes" | "deleted" | "stickers";

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
  const [navigation, setNavigation] = useState<NavigationRecord>({ folders: [], tags: [], smartFolders: [], stickerBoards: [] });
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
  const [theme, setTheme] = useState<ThemeOption>(() => ((localStorage.getItem("magnetares_theme") || localStorage.getItem("aster_theme")) as ThemeOption) || "light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dbPath, setDbPath] = useState("%LOCALAPPDATA%\\Magnetares Notes\\magnetares.db");
  const [syncServiceURL] = useState(() => import.meta.env.VITE_API_BASE_URL || "http://localhost:8080");
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
    const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    if (isDark) {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [theme]);

  useEffect(() => {
    localStorage.removeItem("aster_turso_auth_token");
    localStorage.removeItem("magnetares_turso_auth_token");
    localStorage.removeItem("aster_turso_db_url");
    localStorage.removeItem("magnetares_turso_db_url");
  }, []);

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
  }, []);
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
        if (activeIdRef.current === note.id) setSaveState("saved");
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

  const selectQuery = (targetQuery: NoteQuery) => {
    setSelectedQuery(targetQuery);
    const nextView: LibraryView =
      targetQuery.kind === "deleted"
        ? "deleted"
        : targetQuery.kind === "stickerBoard"
        ? "stickers"
        : "notes";
    setView(nextView);
    setQuery("");
    setLoadError("");
    if (targetQuery.kind !== "stickerBoard") {
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
    window.print();
  };

  const handleExport = async (format: "md" | "html" | "txt" | "code") => {
    if (!active) return;
    const cleanTitle = active.title.replace(/[\\/:*?"<>|]/g, "_").trim() || "Nota";
    let filename = "";
    let content = "";
    let mimeType = "";

    if (active.type === "code" || format === "code") {
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
      downloadFile(filename, content, mimeType);
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

  const handleDbPathChange = async (newPath: string) => {
    const bridge = window.go?.main?.App;
    if (bridge?.SetCustomDatabasePath) {
      const updatedPath = await bridge.SetCustomDatabasePath(newPath);
      setDbPath(updatedPath);
      void Promise.all([
        bridge.ListNotes?.() ?? Promise.resolve([]),
        bridge.ListDeletedNotes?.() ?? Promise.resolve([]),
        bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [], stickerBoards: [] })
      ]).then(([loadedNotes, loadedDeletedNotes, loadedNav]) => {
        setNotes(loadedNotes);
        setDeletedNotes(loadedDeletedNotes);
        setNavigation(loadedNav);
        setActiveId(loadedNotes[0]?.id ?? "");
      });
    } else {
      setDbPath(newPath);
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
      bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [], stickerBoards: [] }),
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
      const nav = await bridge.ListNavigation();
      setNavigation(nav);
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
      bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [], stickerBoards: [] })
    ])
      .then(([loadedNotes, loadedDeletedNotes, loadedNav]) => {
        setNotes(loadedNotes);
        setDeletedNotes(loadedDeletedNotes);
        setNavigation(loadedNav);
        setActiveId(loadedNotes[0]?.id ?? "");
      })
      .catch(() => setLoadError("Não foi possível abrir suas notas."))
      .finally(() => setIsLoading(false));
  }, []);

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
      <main className={`shell ${sidebarOpen ? "" : "sidebar-closed"} ${view === "stickers" ? "stickers-view" : ""}`}>
      <aside className="sidebar" aria-label="Pastas">
        <div className="sidebar-heading">
          <Sparkles className="brand-mark" aria-hidden="true" />
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

        <button className={`nav-item trash-item ${view === "deleted" ? "selected" : ""}`} onClick={() => selectQuery({ kind: "deleted" })}>
          <span><Trash2 aria-hidden="true" /><span className="nav-item-title">Apagadas recentemente</span></span>
          <small>{deletedNotes.length}</small>
        </button>
        </div>
        <footer>
          <div
            className={`footer-status ${syncing ? "syncing" : ""} ${syncConfiguration.configured ? "connected" : "local"}`}
            onClick={() => setSettingsOpen(true)}
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
          <button
            type="button"
            className="icon-button settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Preferências & Configurações"
            aria-label="Preferências"
          >
            <Settings aria-hidden="true" />
          </button>
        </footer>
      </aside>

      {view === "stickers" ? (
        <StickerBoardView
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
            <h1>{view === "deleted" ? "Apagadas recentemente" : "Notas"}</h1>
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
          {!isLoading && !loadError && visible.map((note) => (
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
            </button>
          ))}
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
              <span className="breadcrumb">{view === "deleted" ? "Apagadas recentemente" : "Notas"} <ChevronRight aria-hidden="true" /></span>
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
                    <div className="export-popover-anchor">
                      <button className={`icon-button ${exportMenuOpen ? "active-pin" : ""}`} onClick={() => setExportMenuOpen((open) => !open)} title="Exportar nota" aria-label="Exportar nota"><Download aria-hidden="true" /></button>
                      {exportMenuOpen && (
                        <div className="export-menu" role="menu">
                          {active.type === "code" ? (
                            <button type="button" onClick={() => handleExport("code")}><FileCode aria-hidden="true" /> Exportar Código</button>
                          ) : (
                            <>
                              <button type="button" onClick={() => handleExport("md")}><FileCode aria-hidden="true" /> Markdown (.md)</button>
                              <button type="button" onClick={() => handleExport("html")}><Globe aria-hidden="true" /> HTML (.html)</button>
                            </>
                          )}
                          <button type="button" onClick={() => handleExport("txt")}><FileText aria-hidden="true" /> Texto (.txt)</button>
                        </div>
                      )}
                    </div>
                    <button className={`icon-button ${active.pinnedAt ? "active-pin" : ""}`} onClick={() => void togglePinActiveNote()} title={active.pinnedAt ? "Desafixar nota" : "Fixar nota"} aria-label={active.pinnedAt ? "Desafixar nota" : "Fixar nota"}><Pin aria-hidden="true" /></button>
                    <button className="icon-button danger-button" onClick={() => void deleteNote(active)} title="Mover para Apagadas recentemente" aria-label="Apagar nota"><Trash2 aria-hidden="true" /></button>
                    <button className="icon-button" onClick={() => createNote("rtf")} title="Nova nota (Ctrl+N)" aria-label="Nova nota"><FilePenLine aria-hidden="true" /></button>
                  </>
                )}
              </div>
            </header>
            <div className="editor-scroll-area">
              <div className="editor-page">
                <time className="edited-at">{fullDateLabel(active.updatedAt)}</time>
                <input ref={titleRef} className="title" value={active.title} onChange={(event) => save({ title: event.target.value })} onBlur={() => void flushNote(active.id)} placeholder="Título" aria-label="Título da nota" readOnly={view === "deleted"} />

                {view !== "deleted" && (
                  <div className="note-location-row">
                    <Folder aria-hidden="true" />
                    <span className="note-location-label">Pasta</span>
                    <strong className="note-location-value">{active.folder ?? "Notas"}</strong>
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
                    onChange={(document, text) => save({ body: document, bodyText: text })} 
                    onBlur={() => void flushNote(active.id)} 
                  />
                )}
              </div>
            </div>
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
    </main>
    </div>
  );
}
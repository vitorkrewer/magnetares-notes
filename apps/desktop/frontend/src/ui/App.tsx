import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Download, FileCode, FilePenLine, FileText, Folder, FolderPlus, Globe, Hash, List, Pin, Plus, Printer, RotateCcw, Search, Settings, Sparkles, Trash2, Upload, X } from "lucide-react";
import { StructuredEditor } from "./StructuredEditor";
import { TitleBar } from "./TitleBar";
import { OrganizationDialog } from "./OrganizationDialog";
import { SettingsDialog, type ThemeOption } from "./SettingsDialog";
import { FolderRecord, NavigationRecord, Note, NoteQuery, SmartFolderRecord, SyncConfiguration } from "./types";
import { downloadFile, exportToHTML, exportToMarkdown, parseImportedFile } from "./exportUtils";

type SaveState = "saved" | "saving" | "error";
type LibraryView = "notes" | "deleted";

const demo: Note[] = [
  { id: "welcome", title: "Bem-vindo ao Magnetares", body: "Um lugar tranquilo para pensar, planejar e guardar o que importa.", bodyText: "Um lugar tranquilo para pensar, planejar e guardar o que importa.", folder: "Notas", updatedAt: new Date().toISOString() },
  { id: "ideas", title: "Ideias", body: "• Diário de projeto\n• Atalhos de teclado\n• Sincronização segura", bodyText: "• Diário de projeto\n• Atalhos de teclado\n• Sincronização segura", folder: "Notas", updatedAt: new Date(Date.now() - 7_200_000).toISOString() }
];

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
  const [navigation, setNavigation] = useState<NavigationRecord>({ folders: [], tags: [], smartFolders: [] });
  const [selectedQuery, setSelectedQuery] = useState<NoteQuery>({ kind: "all" });
  const [view, setView] = useState<LibraryView>("notes");
  const [activeId, setActiveId] = useState("welcome");
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dialogMode, setDialogMode] = useState<{ kind: "folder"; parentId?: string } | { kind: "smart" } | null>(null);
  const [theme, setTheme] = useState<ThemeOption>(() => ((localStorage.getItem("magnetares_theme") || localStorage.getItem("aster_theme")) as ThemeOption) || "light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dbPath, setDbPath] = useState("%LOCALAPPDATA%\\Magnetares Notes\\magnetares.db");
  const [syncServiceURL] = useState(() => import.meta.env.VITE_API_BASE_URL || "http://localhost:8080");
  const [syncConfiguration, setSyncConfiguration] = useState<SyncConfiguration>({ tursoDatabaseUrl: "", configured: false });
  const [newTagInput, setNewTagInput] = useState("");
  const [tagInputOpen, setTagInputOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
    const nextView = targetQuery.kind === "deleted" ? "deleted" : "notes";
    setView(nextView);
    setQuery("");
    setLoadError("");
    void loadQueryNotes(targetQuery);
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

  const handleExport = (format: "md" | "html" | "txt") => {
    if (!active) return;
    const cleanTitle = active.title.trim() || "Nota";
    if (format === "md") {
      const content = exportToMarkdown(active.title, active.body, active.bodyText);
      downloadFile(`${cleanTitle}.md`, content, "text/markdown");
    } else if (format === "html") {
      const content = exportToHTML(active.title, active.body, active.bodyText);
      downloadFile(`${cleanTitle}.html`, content, "text/html");
    } else if (format === "txt") {
      const content = `${cleanTitle}\n\n${active.bodyText || active.body}`;
      downloadFile(`${cleanTitle}.txt`, content, "text/plain");
    }
    setExportMenuOpen(false);
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
        bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [] })
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
    const bridge = window.go?.main?.App;
    if (!bridge?.SyncNow) {
      throw new Error("Sincronização em nuvem está disponível apenas no aplicativo desktop.");
    }
    if (!syncConfiguration.configured) {
      throw new Error("Conecte o Turso em Preferências antes de sincronizar.");
    }
    await bridge.SyncNow(syncServiceURL);
    await Promise.all([
      bridge.ListNotes?.() ?? Promise.resolve([]),
      bridge.ListDeletedNotes?.() ?? Promise.resolve([]),
      bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [] })
    ]).then(([loadedNotes, loadedDeletedNotes, loadedNav]) => {
      setNotes(loadedNotes);
      setDeletedNotes(loadedDeletedNotes);
      setNavigation(loadedNav);
      setActiveId(loadedNotes[0]?.id ?? "");
    });
  };

  const handleSaveSyncConfiguration = async (databaseURL: string, authToken: string) => {
    const bridge = window.go?.main?.App;
    if (!bridge?.SaveSyncConfiguration) {
      throw new Error("Configuração de nuvem está disponível apenas no aplicativo desktop.");
    }
    const configuration = await bridge.SaveSyncConfiguration(databaseURL, authToken);
    setSyncConfiguration(configuration);
  };

  const handleQuickSync = async () => {
    setSyncing(true);
    setSaveState("saving");
    try {
      await handleSyncWithCloud();
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setSyncing(false);
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

  const createNote = () => {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      title: "",
      body: "",
      bodyText: "",
      folder: "Notas",
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
    window.setTimeout(() => titleRef.current?.focus(), 0);
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
      bridge.ListNavigation?.() ?? Promise.resolve({ folders: [], tags: [], smartFolders: [] })
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

    return (
      <div className="folder-node" key={folder.id}>
        <div className="folder-node-row" style={{ paddingLeft: 4 + depth * 16 }}>
          {hasChildren ? (
            <button type="button" className="folder-expander" onClick={() => toggleFolderExpanded(folder.id)} aria-label={isExpanded ? `Recolher ${folder.name}` : `Expandir ${folder.name}`}>
              {isExpanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </button>
          ) : <span className="folder-expander-spacer" />}
          <button
            type="button"
            draggable
            className={`nav-item folder-item folder-drop-zone ${selectedQuery.kind === "folder" && selectedQuery.id === folder.id ? "selected-folder" : ""} ${isDropTarget ? "drop-target" : ""}`}
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
            <span><Folder className="folder-icon" aria-hidden="true" /> {folder.name}</span>
            <small>{folder.noteCount}</small>
          </button>
        </div>
        {hasChildren && isExpanded && <div className="folder-children">{children.map((child) => renderFolderNode(child, depth + 1))}</div>}
      </div>
    );
  };

  return (
    <div className="app-container">
      <TitleBar title={active?.title ? `${active.title} — Magnetares` : "Magnetares Notes"} />
      <main className={`shell ${sidebarOpen ? "" : "sidebar-closed"}`}>
      <aside className="sidebar" aria-label="Pastas">
        <div className="sidebar-heading">
          <Sparkles className="brand-mark" aria-hidden="true" />
          <strong>Magnetares</strong>
          <button className="icon-button" onClick={() => setSidebarOpen(false)} title="Ocultar barra lateral" aria-label="Ocultar barra lateral"><ChevronLeft aria-hidden="true" /></button>
        </div>
        <div className="sidebar-content">
        <nav aria-label="Biblioteca">
          <button className={`nav-item ${selectedQuery.kind === "all" ? "selected" : ""}`} onClick={() => selectQuery({ kind: "all" })}>
            <span><List aria-hidden="true" /> Todas as notas</span>
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
              <span><Folder className="folder-icon" aria-hidden="true" /> Notas</span>
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
                <button key={smart.id} className={`nav-item smart-item ${selectedQuery.kind === "smart" && selectedQuery.id === smart.id ? "selected" : ""}`} onClick={() => selectQuery({ kind: "smart", id: smart.id })}>
                  <span><Sparkles className="smart-icon" aria-hidden="true" /> {smart.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {navigation.tags.length > 0 && (
          <>
            <div className="sidebar-section-header">
              <span className="folder-label">ETIQUETAS</span>
            </div>
            <div className="folder-tree">
              {navigation.tags.map((tag) => (
                <button key={tag.id} className={`nav-item tag-item ${selectedQuery.kind === "tag" && selectedQuery.id === tag.id ? "selected" : ""}`} onClick={() => selectQuery({ kind: "tag", id: tag.id })}>
                  <span><Hash className="tag-icon" aria-hidden="true" /> {tag.name}</span>
                  <small>{tag.noteCount}</small>
                </button>
              ))}
            </div>
          </>
        )}

        <button className={`nav-item trash-item ${view === "deleted" ? "selected" : ""}`} onClick={() => selectQuery({ kind: "deleted" })}>
          <span><Trash2 aria-hidden="true" /> Apagadas recentemente</span>
          <small>{deletedNotes.length}</small>
        </button>
        </div>
        <footer>
          <div className="footer-status">
            <span className="sync-dot" /> Armazenado neste dispositivo
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
          <button className="icon-button compose-button" onClick={createNote} title="Nova nota (Ctrl+N)" aria-label="Nova nota"><FilePenLine aria-hidden="true" /></button>
        </div>
        <div className="list-heading">
          <h1>{view === "deleted" ? "Apagadas recentemente" : "Notas"}</h1>
          <p>{visible.length} {visible.length === 1 ? "nota" : "notas"}</p>
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
                  <button className="icon-button restore-button" onClick={() => void restoreNote(active)} title="Restaurar nota" aria-label="Restaurar nota"><RotateCcw aria-hidden="true" /></button>
                ) : (
                  <>
                    <button className="icon-button" onClick={handlePrint} title="Imprimir nota" aria-label="Imprimir nota"><Printer aria-hidden="true" /></button>
                    <button className={`icon-button cloud-sync-button ${syncing ? "syncing" : ""}`} onClick={() => void handleQuickSync()} title={syncing ? "Sincronizando com a nuvem" : "Sincronizar com a nuvem"} aria-label="Sincronizar com a nuvem" disabled={syncing}><Cloud aria-hidden="true" /></button>
                    <div className="export-popover-anchor">
                      <button className={`icon-button ${exportMenuOpen ? "active-pin" : ""}`} onClick={() => setExportMenuOpen((open) => !open)} title="Exportar nota" aria-label="Exportar nota"><Download aria-hidden="true" /></button>
                      {exportMenuOpen && (
                        <div className="export-menu" role="menu">
                          <button type="button" onClick={() => handleExport("md")}><FileCode aria-hidden="true" /> Markdown (.md)</button>
                          <button type="button" onClick={() => handleExport("html")}><Globe aria-hidden="true" /> HTML (.html)</button>
                          <button type="button" onClick={() => handleExport("txt")}><FileText aria-hidden="true" /> Texto (.txt)</button>
                        </div>
                      )}
                    </div>
                    <button className={`icon-button ${active.pinnedAt ? "active-pin" : ""}`} onClick={() => void togglePinActiveNote()} title={active.pinnedAt ? "Desafixar nota" : "Fixar nota"} aria-label={active.pinnedAt ? "Desafixar nota" : "Fixar nota"}><Pin aria-hidden="true" /></button>
                    <button className="icon-button danger-button" onClick={() => void deleteNote(active)} title="Mover para Apagadas recentemente" aria-label="Apagar nota"><Trash2 aria-hidden="true" /></button>
                    <button className="icon-button" onClick={createNote} title="Nova nota (Ctrl+N)" aria-label="Nova nota"><FilePenLine aria-hidden="true" /></button>
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
                      <span key={tag} className="tag-chip">
                        #{tag}
                        <button type="button" onClick={() => void removeTagFromActiveNote(tag)} title={`Remover etiqueta #${tag}`} aria-label={`Remover etiqueta #${tag}`}><X aria-hidden="true" /></button>
                      </span>
                    ))}
                    {tagInputOpen ? (
                      <div className="new-tag-input-box">
                        <input
                          autoFocus
                          value={newTagInput}
                          onChange={(event) => setNewTagInput(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void addTagToActiveNote(newTagInput);
                            } else if (event.key === "Escape") {
                              setTagInputOpen(false);
                              setNewTagInput("");
                            }
                          }}
                          placeholder="etiqueta..."
                        />
                        <button type="button" onClick={() => void addTagToActiveNote(newTagInput)} title="Adicionar"><Check aria-hidden="true" /></button>
                      </div>
                    ) : (
                      <button type="button" className="add-tag-chip" onClick={() => setTagInputOpen(true)}>
                        <Plus aria-hidden="true" /> Etiqueta
                      </button>
                    )}
                  </div>
                )}

                <StructuredEditor value={active.body} readOnly={view === "deleted"} onChange={(document, text) => save({ body: document, bodyText: text })} onBlur={() => void flushNote(active.id)} />
              </div>
            </div>
          </>
        ) : (
          <div className="empty-editor">
            {view === "deleted" ? <Trash2 aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            <strong>{view === "deleted" ? "Nenhuma nota apagada" : "Nenhuma nota selecionada"}</strong>
            {view === "notes" && <button onClick={createNote}>Criar uma nota</button>}
          </div>
        )}
      </article>

      {dialogMode && (
        <OrganizationDialog
          mode={dialogMode}
          navigation={navigation}
          onClose={() => setDialogMode(null)}
          onSaveFolder={handleSaveFolder}
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
          syncConfigured={syncConfiguration.configured}
          onSaveSyncConfiguration={handleSaveSyncConfiguration}
          onSyncNow={handleSyncWithCloud}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
    </div>
  );
}
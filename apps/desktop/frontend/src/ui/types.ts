export type Note = {
  id: string;
  title: string;
  body: string;
  bodyText?: string;
  type?: string;
  language?: string;
  folder: string;
  folderId?: string;
  revision?: number;
  pinnedAt?: string | null;
  tags?: string[];
  checklistTotal?: number;
  checklistOpen?: number;
  createdAt?: string;
  updatedAt: string;
  deletedAt?: string | null;
};

export type FolderRecord = {
  id: string;
  name: string;
  parentId?: string | null;
  color?: string;
  icon?: string;
  noteCount: number;
};

export type TagRecord = {
  id: string;
  name: string;
  icon?: string;
  noteCount: number;
};

export type SmartFolderRecord = {
  id: string;
  name: string;
  ruleKind: "tag" | "date" | "checklist";
  tagId?: string;
  dateField?: "created_at" | "updated_at";
  dateRange?: "today" | "last_7_days" | "last_30_days";
  checklistState?: "any" | "open" | "completed";
};

export type StickerBoardRecord = {
  id: string;
  name: string;
  color: string;
  stickerCount: number;
};

export type StickerRecord = {
  id: string;
  boardId: string;
  title: string;
  body: string;
  color: string;
  position: number;
  pinnedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
};

export type TaskListRecord = {
  id: string;
  name: string;
  color: string;
  icon: string;
  position: number;
  taskCount: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt: string;
};

export type SubtaskRecord = {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  completedAt?: string | null;
  position: number;
  createdAt?: string;
  updatedAt: string;
};

export type TaskNoteRecord = {
  id: string;
  title?: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type TaskRecord = {
  id: string;
  listId: string;
  title: string;
  notes: string;
  completed: boolean;
  completedAt?: string | null;
  dueDate?: string | null;
  priority: number;
  position: number;
  subtasks?: SubtaskRecord[];
  subtaskTotal?: number;
  subtaskDone?: number;
  createdAt?: string;
  updatedAt: string;
};

export type IdeaFlowRecord = {
  id: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  position: number;
  nodeCount: number;
  edgeCount: number;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdeaNodeRecord = {
  id: string;
  flowId: string;
  nodeType: string;
  label: string;
  content: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  linkedKind: string;
  linkedId: string;
  linkedLabel: string;
  styleJson: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdeaEdgeRecord = {
  id: string;
  flowId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string;
  targetHandle: string;
  label: string;
  edgeType: string;
  color: string;
  animated: boolean;
  styleJson: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type IdeaFlowGraphRecord = {
  flow: IdeaFlowRecord;
  nodes: IdeaNodeRecord[];
  edges: IdeaEdgeRecord[];
};

export type SaveIdeaFlowInput = {
  id?: string;
  title: string;
  description: string;
  color: string;
  icon: string;
  position?: number;
};

export type SaveIdeaFlowGraphInput = {
  flowId: string;
  viewportX: number;
  viewportY: number;
  viewportZoom: number;
  nodes: IdeaNodeRecord[];
  edges: IdeaEdgeRecord[];
};

export type NavigationRecord = {
  folders: FolderRecord[];
  tags: TagRecord[];
  smartFolders: SmartFolderRecord[];
  stickerBoards: StickerBoardRecord[];
  taskLists?: TaskListRecord[];
  archivedTaskLists?: TaskListRecord[];
  ideaFlows?: IdeaFlowRecord[];
};

export type NoteQuery = {
  kind: "all" | "deleted" | "pinned" | "tag" | "folder" | "smart" | "stickerBoard" | "taskList" | "ideaFlows" | "ideaFlow";
  id?: string;
};

export type SyncConflict = {
  noteId: string;
  localTitle: string;
  localBodyText: string;
  remoteTitle: string;
  remoteBodyText: string;
  remoteRevision: number;
  remoteUpdatedAt: string;
  detectedAt: string;
};

export type SyncResult = {
  uploaded: number;
  downloaded: number;
  conflicts: number;
  conflictNotes?: string[];
  message?: string;
  syncedAt?: string;
};

export type SyncConfiguration = {
  tursoDatabaseUrl: string;
  autoSyncIntervalMinutes: number;
  configured: boolean;
};

export type SyncProfileInfo = {
  profileId: string;
  source: "explicit" | "remote" | "legacy" | "derived" | "local";
  storedProfileId: string;
  canonicalUrl: string;
  engine: "direct" | "api";
  apiUrl: string;
  pendingConfirmation: boolean;
};

export type RemoteSyncProfile = {
  profileId: string;
  notes: number;
  folders: number;
  tags: number;
  stickerBoards: number;
  stickers: number;
  lastUpdatedAt?: string | null;
  current: boolean;
  primary: boolean;
};

export type ComplianceReport = {
  passed: boolean;
  repairedNotes: number;
  repairedFolders: number;
  orphanNotesFixed: number;
  checklistsCorrected: number;
  orphanTagsCleaned: number;
  orphanStickersFixed?: number;
  details: string[];
  auditedAt: string;
};

export type DatabaseMigrationMode = "copy" | "use_existing" | "fresh";

export type DatabaseTargetInfoRecord = {
  currentPath: string;
  resolvedPath: string;
  defaultPath: string;
  sameLocation: boolean;
  targetExists: boolean;
  targetNotes: number;
  currentNotes: number;
  isCustom: boolean;
  isPortable: boolean;
};

export type AppInfoRecord = {
  appName: string;
  version: string;
  buildDate: string;
  description: string;
  author: string;
  authorUrl: string;
  repository: string;
  website: string;
  license: string;
};

export type UpdateCheckResultRecord = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseName: string;
  releaseNotes: string;
  publishedAt: string;
  downloadUrl: string;
  websiteUrl: string;
};

export type DesktopBridge = {
  ListNotes?: () => Promise<Note[]>;
  ListDeletedNotes?: () => Promise<Note[]>;
  ListNoteConflicts?: () => Promise<SyncConflict[]>;
  ResolveNoteConflict?: (noteID: string, resolution: "local" | "remote" | "merge") => Promise<void>;
  SaveNote?: (note: Note) => Promise<Note>;
  DeleteNote?: (id: string) => Promise<void>;
  PermanentlyDeleteNote?: (id: string) => Promise<void>;
  EmptyDeletedNotes?: () => Promise<void>;
  RestoreNote?: (id: string) => Promise<void>;
  ListNavigation?: () => Promise<NavigationRecord>;
  SaveFolder?: (folder: FolderRecord) => Promise<FolderRecord>;
  SaveTag?: (tag: TagRecord) => Promise<TagRecord>;
  DeleteTag?: (id: string) => Promise<void>;
  DeleteFolder?: (id: string) => Promise<void>;
  MoveNote?: (noteId: string, folderId: string) => Promise<void>;
  SetNotePinned?: (id: string, pinned: boolean) => Promise<Note>;
  SetNoteTags?: (id: string, tags: string[]) => Promise<Note>;
  QueryNotes?: (query: NoteQuery) => Promise<Note[]>;
  SaveSmartFolder?: (smart: SmartFolderRecord) => Promise<SmartFolderRecord>;
  DeleteSmartFolder?: (id: string) => Promise<void>;
  SaveStickerBoard?: (board: StickerBoardRecord) => Promise<StickerBoardRecord>;
  DeleteStickerBoard?: (id: string) => Promise<void>;
  ListStickers?: (boardId: string) => Promise<StickerRecord[]>;
  SaveSticker?: (sticker: StickerRecord) => Promise<StickerRecord>;
  DeleteSticker?: (id: string) => Promise<void>;
  RestoreSticker?: (id: string) => Promise<StickerRecord>;
  SetStickerPinned?: (id: string, pinned: boolean) => Promise<StickerRecord>;
  MoveSticker?: (id: string, boardId: string, beforeId: string) => Promise<StickerRecord>;
  ListTaskLists?: () => Promise<TaskListRecord[]>;
  ListArchivedTaskLists?: () => Promise<TaskListRecord[]>;
  SaveTaskList?: (list: TaskListRecord) => Promise<TaskListRecord>;
  ArchiveTaskList?: (id: string) => Promise<TaskListRecord>;
  UnarchiveTaskList?: (id: string) => Promise<TaskListRecord>;
  DeleteTaskList?: (id: string) => Promise<void>;
  ListTasks?: (listId: string, includeCompleted?: boolean) => Promise<TaskRecord[]>;
  GetTaskWithSubtasks?: (id: string) => Promise<TaskRecord>;
  SaveTask?: (task: TaskRecord) => Promise<TaskRecord>;
  ToggleTaskCompleted?: (id: string, completed: boolean) => Promise<void>;
  DeleteTask?: (id: string) => Promise<void>;
  SaveSubtask?: (subtask: SubtaskRecord) => Promise<SubtaskRecord>;
  ToggleSubtaskCompleted?: (id: string, completed: boolean) => Promise<void>;
  DeleteSubtask?: (id: string) => Promise<void>;
  GetDatabasePath?: () => Promise<string>;
  SetCustomDatabasePath?: (newPath: string) => Promise<string>;
  BrowseDatabaseDirectory?: () => Promise<string>;
  InspectDatabasePathTarget?: (targetPath: string) => Promise<DatabaseTargetInfoRecord>;
  MigrateDatabasePath?: (newPath: string, mode: DatabaseMigrationMode) => Promise<string>;
  ResetDatabasePathToDefault?: (mode: DatabaseMigrationMode) => Promise<string>;
  SyncNow?: (apiURL: string) => Promise<SyncResult>;
  RunComplianceAudit?: () => Promise<ComplianceReport>;
  TestTursoConnection?: (databaseURL: string, authToken: string) => Promise<string>;
  GetSyncProfileID?: () => Promise<string>;
  SetSyncProfileID?: (profileID: string) => Promise<void>;
  GetSyncProfileInfo?: () => Promise<SyncProfileInfo>;
  ListRemoteSyncProfiles?: () => Promise<RemoteSyncProfile[]>;
  PurgeRemoteSyncProfile?: (sourceProfileID: string) => Promise<string>;
  SetPrimarySyncProfile?: (profileID: string) => Promise<string>;
  GetSyncConfiguration?: () => Promise<SyncConfiguration>;
  SaveSyncConfiguration?: (databaseURL: string, authToken: string) => Promise<SyncConfiguration>;
  SaveAutoSyncInterval?: (minutes: number) => Promise<SyncConfiguration>;
  MinimizeWindow?: () => Promise<void>;
  ToggleMaximizeWindow?: () => Promise<boolean>;
  IsWindowMaximized?: () => Promise<boolean>;
  CloseWindow?: () => Promise<void>;
  GetFocusNoteID?: () => Promise<string>;
  GetNote?: (id: string) => Promise<Note>;
  SetAlwaysOnTop?: (onTop: boolean) => Promise<void>;
  LaunchFocusWindow?: (noteID: string) => Promise<void>;
  CloseFocusWindow?: (noteID: string) => Promise<void>;
  ExportNoteFile?: (defaultFilename: string, content: string) => Promise<string>;
  CreateDatabaseBackup?: () => Promise<string>;
  RestoreDatabaseBackup?: () => Promise<string>;
  RestoreFromCloud?: () => Promise<SyncResult>;
  ListIdeaFlows?: () => Promise<IdeaFlowRecord[]>;
  SaveIdeaFlow?: (input: SaveIdeaFlowInput) => Promise<IdeaFlowRecord>;
  DeleteIdeaFlow?: (flowId: string) => Promise<void>;
  DuplicateIdeaFlow?: (flowId: string) => Promise<IdeaFlowRecord>;
  GetIdeaFlowGraph?: (flowId: string) => Promise<IdeaFlowGraphRecord>;
  SaveIdeaFlowGraph?: (input: SaveIdeaFlowGraphInput) => Promise<IdeaFlowGraphRecord>;
  ExportIdeaFlowPNG?: (suggestedName: string, base64PNG: string) => Promise<string>;
  GetAppInfo?: () => Promise<AppInfoRecord>;
  CheckForUpdates?: () => Promise<UpdateCheckResultRecord>;
  OpenExternalURL?: (url: string) => Promise<void>;
};

declare global {
  interface Window {
    go?: {
      main?: {
        App?: DesktopBridge;
      };
    };
    runtime?: {
      EventsOn?: (eventName: string, callback: (...data: any[]) => void) => () => void;
      EventsOff?: (eventName: string, ...additionalEventNames: string[]) => void;
      EventsEmit?: (eventName: string, ...data: any[]) => void;
    };
  }
}

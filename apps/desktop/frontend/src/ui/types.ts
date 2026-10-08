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

export type NavigationRecord = {
  folders: FolderRecord[];
  tags: TagRecord[];
  smartFolders: SmartFolderRecord[];
  stickerBoards: StickerBoardRecord[];
};

export type NoteQuery = {
  kind: "all" | "deleted" | "pinned" | "tag" | "folder" | "smart" | "stickerBoard";
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
  GetDatabasePath?: () => Promise<string>;
  SetCustomDatabasePath?: (newPath: string) => Promise<string>;
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
  ExportNoteFile?: (defaultFilename: string, content: string) => Promise<string>;
  CreateDatabaseBackup?: () => Promise<string>;
  RestoreDatabaseBackup?: () => Promise<string>;
  RestoreFromCloud?: () => Promise<SyncResult>;
};

declare global {
  interface Window {
    go?: {
      main?: {
        App?: DesktopBridge;
      };
    };
  }
}

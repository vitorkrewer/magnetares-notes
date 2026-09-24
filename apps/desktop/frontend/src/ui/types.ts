export type Note = {
  id: string;
  title: string;
  body: string;
  bodyText?: string;
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
  noteCount: number;
};

export type TagRecord = {
  id: string;
  name: string;
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

export type NavigationRecord = {
  folders: FolderRecord[];
  tags: TagRecord[];
  smartFolders: SmartFolderRecord[];
};

export type NoteQuery = {
  kind: "all" | "deleted" | "pinned" | "tag" | "folder" | "smart";
  id?: string;
};

export type SyncResult = {
  uploaded: number;
  downloaded: number;
  conflicts: number;
};

export type SyncConfiguration = {
  tursoDatabaseUrl: string;
  configured: boolean;
};

export type DesktopBridge = {
  ListNotes?: () => Promise<Note[]>;
  ListDeletedNotes?: () => Promise<Note[]>;
  SaveNote?: (note: Note) => Promise<Note>;
  DeleteNote?: (id: string) => Promise<void>;
  RestoreNote?: (id: string) => Promise<void>;
  ListNavigation?: () => Promise<NavigationRecord>;
  SaveFolder?: (folder: FolderRecord) => Promise<FolderRecord>;
  DeleteFolder?: (id: string) => Promise<void>;
  MoveNote?: (noteId: string, folderId: string) => Promise<void>;
  SetNotePinned?: (id: string, pinned: boolean) => Promise<Note>;
  SetNoteTags?: (id: string, tags: string[]) => Promise<Note>;
  QueryNotes?: (query: NoteQuery) => Promise<Note[]>;
  SaveSmartFolder?: (smart: SmartFolderRecord) => Promise<SmartFolderRecord>;
  DeleteSmartFolder?: (id: string) => Promise<void>;
  GetDatabasePath?: () => Promise<string>;
  SetCustomDatabasePath?: (newPath: string) => Promise<string>;
  SyncNow?: (apiURL: string) => Promise<SyncResult>;
  GetSyncProfileID?: () => Promise<string>;
  SetSyncProfileID?: (profileID: string) => Promise<void>;
  GetSyncConfiguration?: () => Promise<SyncConfiguration>;
  SaveSyncConfiguration?: (databaseURL: string, authToken: string) => Promise<SyncConfiguration>;
  MinimizeWindow?: () => Promise<void>;
  ToggleMaximizeWindow?: () => Promise<boolean>;
  IsWindowMaximized?: () => Promise<boolean>;
  CloseWindow?: () => Promise<void>;
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

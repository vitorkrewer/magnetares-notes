ALTER TABLE sync_notes ADD COLUMN folder_id TEXT DEFAULT 'folder-default';
ALTER TABLE sync_notes ADD COLUMN folder TEXT DEFAULT 'Notas';
ALTER TABLE sync_notes ADD COLUMN pinned_at INTEGER;
ALTER TABLE sync_notes ADD COLUMN checklist_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_notes ADD COLUMN checklist_open INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS sync_folders (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS sync_folders_by_user_updated
  ON sync_folders(user_id, updated_at DESC);

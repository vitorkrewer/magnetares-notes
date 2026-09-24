CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  parent_id TEXT REFERENCES folders(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX folders_unique_sibling
  ON folders(COALESCE(parent_id, ''), name COLLATE NOCASE);

INSERT INTO folders(id, name, parent_id, created_at, updated_at)
VALUES (
  'folder-default',
  'Notas',
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT OR IGNORE INTO folders(id, name, parent_id, created_at, updated_at)
SELECT
  'folder-legacy-' || lower(hex(trim(folder))),
  trim(folder),
  NULL,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM notes
WHERE trim(folder) <> '' AND lower(trim(folder)) <> 'notas'
GROUP BY trim(folder);

ALTER TABLE notes ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE RESTRICT;
ALTER TABLE notes ADD COLUMN pinned_at INTEGER;
ALTER TABLE notes ADD COLUMN checklist_total INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN checklist_open INTEGER NOT NULL DEFAULT 0;

UPDATE notes
SET folder_id = CASE
  WHEN trim(folder) = '' OR lower(trim(folder)) = 'notas' THEN 'folder-default'
  ELSE 'folder-legacy-' || lower(hex(trim(folder)))
END;

CREATE INDEX notes_by_folder
  ON notes(folder_id, deleted_at, pinned_at DESC, updated_at DESC);

CREATE TRIGGER notes_require_folder_insert
BEFORE INSERT ON notes
WHEN NEW.folder_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'folder_id is required');
END;

CREATE TRIGGER notes_require_folder_update
BEFORE UPDATE OF folder_id ON notes
WHEN NEW.folder_id IS NULL
BEGIN
  SELECT RAISE(ABORT, 'folder_id is required');
END;

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  normalized_name TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX note_tags_by_tag ON note_tags(tag_id, note_id);

CREATE TABLE smart_folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('tag', 'date', 'checklist')),
  tag_id TEXT REFERENCES tags(id) ON DELETE RESTRICT,
  date_field TEXT CHECK (date_field IN ('created_at', 'updated_at')),
  date_range TEXT CHECK (date_range IN ('today', 'last_7_days', 'last_30_days')),
  checklist_state TEXT CHECK (checklist_state IN ('any', 'open', 'completed')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    (rule_kind = 'tag' AND tag_id IS NOT NULL AND date_field IS NULL AND date_range IS NULL AND checklist_state IS NULL)
    OR (rule_kind = 'date' AND tag_id IS NULL AND date_field IS NOT NULL AND date_range IS NOT NULL AND checklist_state IS NULL)
    OR (rule_kind = 'checklist' AND tag_id IS NULL AND date_field IS NULL AND date_range IS NULL AND checklist_state IS NOT NULL)
  )
);
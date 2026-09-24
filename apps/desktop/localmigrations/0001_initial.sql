CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  folder TEXT NOT NULL DEFAULT 'Notas',
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX notes_by_deleted_updated
  ON notes(deleted_at, updated_at DESC);
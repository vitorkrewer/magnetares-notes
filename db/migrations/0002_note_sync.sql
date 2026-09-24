CREATE TABLE sync_notes (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX sync_notes_by_user_updated ON sync_notes(user_id, updated_at DESC);

CREATE TABLE sync_note_changes (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  changed_at INTEGER NOT NULL
);

CREATE INDEX sync_note_changes_by_user_cursor
  ON sync_note_changes(user_id, cursor);

CREATE TABLE sync_mutations (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  cursor INTEGER NOT NULL,
  PRIMARY KEY (user_id, mutation_id)
);
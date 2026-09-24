ALTER TABLE notes ADD COLUMN server_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE notes ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (sync_state IN ('clean', 'pending', 'conflict'));
ALTER TABLE notes ADD COLUMN pending_mutation_id TEXT;

CREATE TABLE sync_metadata (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  pull_cursor TEXT NOT NULL DEFAULT '0',
  sync_profile_id TEXT NOT NULL DEFAULT ''
);

INSERT INTO sync_metadata(singleton) VALUES (1);

CREATE TABLE note_conflicts (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  server_note_json TEXT NOT NULL,
  server_revision INTEGER NOT NULL,
  detected_at INTEGER NOT NULL
);

CREATE INDEX notes_by_sync_state ON notes(sync_state, updated_at ASC);
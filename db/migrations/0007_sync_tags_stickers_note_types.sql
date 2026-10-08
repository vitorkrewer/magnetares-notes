-- Alinha o esquema de referência ao que desktop e API criam em InitSchema().
-- Fonte única de verdade documental do banco remoto (Turso/libSQL).
-- InitSchema() em apps/desktop/turso.go e apps/api/turso.go deve permanecer
-- equivalente a db/migrations/0001..0007.

ALTER TABLE sync_notes ADD COLUMN note_type TEXT NOT NULL DEFAULT 'rtf';
ALTER TABLE sync_notes ADD COLUMN language TEXT NOT NULL DEFAULT 'plaintext';

-- Linhas antigas receberam 'richtext'/'' ao ganhar as colunas; o padrão
-- canônico, igual ao SQLite local, é 'rtf'/'plaintext'.
UPDATE sync_notes SET note_type = 'rtf' WHERE note_type IS NULL OR note_type IN ('', 'richtext');
UPDATE sync_notes SET language = 'plaintext' WHERE language IS NULL OR language = '';

CREATE TABLE IF NOT EXISTS sync_tags (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  normalized_name TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'tag',
  managed INTEGER NOT NULL DEFAULT 1,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS sync_sticker_boards (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  position REAL NOT NULL DEFAULT 0.0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS sync_stickers (
  user_id TEXT NOT NULL,
  id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  position REAL NOT NULL DEFAULT 0.0,
  pinned_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

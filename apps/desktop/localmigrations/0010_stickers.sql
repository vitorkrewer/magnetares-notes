-- Stickers: quadros (views) e notas adesivas de texto simples (título + texto).
-- As colunas deleted_at, updated_at e sync_state já nascem prontas para a futura
-- sincronização na nuvem (mesmo padrão de pastas e etiquetas).

CREATE TABLE sticker_boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (trim(name) <> ''),
  color TEXT NOT NULL DEFAULT 'yellow',
  position REAL NOT NULL DEFAULT 0,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('clean', 'pending'))
);

-- Nome único (sem diferenciar maiúsculas) apenas entre quadros ativos.
CREATE UNIQUE INDEX sticker_boards_unique_name
  ON sticker_boards(name COLLATE NOCASE)
  WHERE deleted_at IS NULL;

CREATE INDEX sticker_boards_by_position ON sticker_boards(deleted_at, position);

CREATE TABLE stickers (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES sticker_boards(id) ON DELETE RESTRICT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT 'yellow',
  position REAL NOT NULL DEFAULT 0,
  pinned_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sync_state TEXT NOT NULL DEFAULT 'pending' CHECK (sync_state IN ('clean', 'pending'))
);

CREATE INDEX stickers_by_board
  ON stickers(board_id, deleted_at, pinned_at DESC, position);
CREATE INDEX stickers_by_updated_at ON stickers(updated_at DESC);
CREATE INDEX stickers_by_sync_state ON stickers(sync_state);

-- Quadro padrão: sempre existe e não pode ser excluído.
INSERT INTO sticker_boards(id, name, color, position, created_at, updated_at)
VALUES (
  'board-default',
  'Geral',
  'yellow',
  0,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

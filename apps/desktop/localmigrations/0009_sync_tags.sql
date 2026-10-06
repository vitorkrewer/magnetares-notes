-- Adiciona colunas para sincronização de etiquetas (tags e ícones)
ALTER TABLE tags ADD COLUMN deleted_at INTEGER;
ALTER TABLE tags ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (sync_state IN ('clean', 'pending'));

CREATE INDEX IF NOT EXISTS tags_by_updated_at ON tags(updated_at DESC);
CREATE INDEX IF NOT EXISTS tags_by_sync_state ON tags(sync_state);

UPDATE tags SET updated_at = created_at WHERE updated_at = 0;
UPDATE tags SET sync_state = 'pending';

-- Atualiza sync_outbox para suportar entity_type 'tag'
CREATE TABLE IF NOT EXISTS sync_outbox_v2 (
  op_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'folder', 'tag')),
  entity_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('create', 'update', 'delete', 'move', 'pin')),
  payload TEXT NOT NULL DEFAULT '{}',
  causal_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'applied', 'conflict')),
  created_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO sync_outbox_v2 SELECT * FROM sync_outbox;
DROP TABLE sync_outbox;
ALTER TABLE sync_outbox_v2 RENAME TO sync_outbox;
CREATE INDEX IF NOT EXISTS sync_outbox_by_status ON sync_outbox(status, created_at ASC);

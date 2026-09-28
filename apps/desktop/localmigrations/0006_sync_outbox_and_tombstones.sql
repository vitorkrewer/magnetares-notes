ALTER TABLE folders ADD COLUMN deleted_at INTEGER;

CREATE TABLE IF NOT EXISTS sync_outbox (
  op_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('note', 'folder')),
  entity_id TEXT NOT NULL,
  op_type TEXT NOT NULL CHECK (op_type IN ('create', 'update', 'delete', 'move', 'pin')),
  payload TEXT NOT NULL DEFAULT '{}',
  causal_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'applied', 'conflict')),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sync_outbox_by_status ON sync_outbox(status, created_at ASC);

ALTER TABLE sync_metadata ADD COLUMN device_id TEXT NOT NULL DEFAULT '';
ALTER TABLE sync_metadata ADD COLUMN device_seq INTEGER NOT NULL DEFAULT 0;

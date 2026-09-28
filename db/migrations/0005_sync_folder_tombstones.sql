ALTER TABLE sync_folders ADD COLUMN deleted_at INTEGER;
CREATE INDEX IF NOT EXISTS sync_folders_deleted ON sync_folders(user_id, deleted_at);

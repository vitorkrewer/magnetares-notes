-- 0014_task_lists_archive.sql: Suporte a arquivamento de listas de tarefas.

ALTER TABLE task_lists ADD COLUMN archived_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_task_lists_archived
    ON task_lists(archived_at, deleted_at);

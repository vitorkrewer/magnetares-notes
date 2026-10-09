-- 0013_task_lists.sql: Suporte a Listas de Tarefas, Tarefas, Subtarefas e Notas anexas.

CREATE TABLE IF NOT EXISTS task_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'blue',
    icon TEXT NOT NULL DEFAULT 'list',
    position REAL NOT NULL DEFAULT 0.0,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_lists_sync_state
    ON task_lists(sync_state);

CREATE INDEX IF NOT EXISTS idx_task_lists_position
    ON task_lists(position, created_at);

-- Inserir Lista padrão "Entrada" (Inbox) caso não exista
INSERT INTO task_lists(id, name, color, icon, position, sync_state, deleted_at, created_at, updated_at)
VALUES ('list-inbox', 'Entrada', 'blue', 'inbox', 0.0, 'pending', NULL, unixepoch('subsec') * 1000, unixepoch('subsec') * 1000)
ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    list_id TEXT NOT NULL REFERENCES task_lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER,
    due_date TEXT,
    priority INTEGER NOT NULL DEFAULT 0,
    position REAL NOT NULL DEFAULT 0.0,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_list_id
    ON tasks(list_id, deleted_at, completed, position);

CREATE INDEX IF NOT EXISTS idx_tasks_sync_state
    ON tasks(sync_state);

CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at INTEGER,
    position REAL NOT NULL DEFAULT 0.0,
    sync_state TEXT NOT NULL DEFAULT 'pending',
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_id
    ON subtasks(task_id, deleted_at, position);

CREATE INDEX IF NOT EXISTS idx_subtasks_sync_state
    ON subtasks(sync_state);

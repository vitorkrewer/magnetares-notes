-- Índices compostos de desempenho para listagem de notas, junção de etiquetas, tarefas e fila de sync
CREATE INDEX IF NOT EXISTS idx_notes_active_sort
  ON notes(deleted_at, folder_id, pinned_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_sync_pending
  ON notes(sync_state) WHERE sync_state = 'pending';

CREATE INDEX IF NOT EXISTS idx_note_tags_note_tag
  ON note_tags(note_id, tag_id);

CREATE INDEX IF NOT EXISTS idx_note_tags_tag_id
  ON note_tags(tag_id);

CREATE INDEX IF NOT EXISTS idx_tasks_list_filter_pos
  ON tasks(list_id, deleted_at, completed, position);

CREATE INDEX IF NOT EXISTS idx_subtasks_task_pos
  ON subtasks(task_id, deleted_at, position);

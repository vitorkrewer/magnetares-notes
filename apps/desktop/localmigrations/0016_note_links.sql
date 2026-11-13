-- 0016_note_links.sql: Vínculos bidirecionais entre notas para o módulo Conexões.

CREATE TABLE IF NOT EXISTS note_links (
    source_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    PRIMARY KEY (source_note_id, target_note_id)
);

CREATE INDEX IF NOT EXISTS idx_note_links_source
    ON note_links(source_note_id);

CREATE INDEX IF NOT EXISTS idx_note_links_target
    ON note_links(target_note_id);


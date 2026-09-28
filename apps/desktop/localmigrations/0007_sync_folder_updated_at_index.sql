-- Índice para otimizar o pull de pastas por updated_at (usado na lógica de LWW)
CREATE INDEX IF NOT EXISTS folders_by_updated_at ON folders(updated_at DESC);

-- Adiciona coluna sync_state nas pastas para rastrear estado de sincronização
ALTER TABLE folders ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'pending'
  CHECK (sync_state IN ('clean', 'pending'));

-- Marca todas as pastas existentes como pending para forçar push inicial
UPDATE folders SET sync_state = 'pending' WHERE id != 'folder-default';
UPDATE folders SET sync_state = 'clean' WHERE id = 'folder-default';

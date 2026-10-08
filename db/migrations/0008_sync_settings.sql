-- Configurações compartilhadas por todas as máquinas que usam este banco.
-- primary_profile_id: perfil (user_id) principal, eleito na primeira
--   sincronização de uma versão nova (preferindo a partição que já tem dados).
-- absorbed:<perfil>: assinatura da última incorporação de uma partição antiga.
CREATE TABLE IF NOT EXISTS sync_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

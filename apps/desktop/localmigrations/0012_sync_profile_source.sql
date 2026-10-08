-- Origem do perfil de sincronização gravado: 'remote' (perfil principal
-- registrado no banco Turso), 'explicit' (fixado pelo usuário), 'local'
-- (sem nuvem) ou '' (gravado por versões anteriores, ainda não confirmado).
ALTER TABLE sync_metadata ADD COLUMN profile_source TEXT NOT NULL DEFAULT '';

# Dados locais e banco SQLite

## Finalidade

O banco SQLite local e a fonte de verdade do Magnetares Notes durante o uso cotidiano. Ele armazena notas, corpos estruturados, texto para busca, lixeira, pastas, tags e Pastas Inteligentes.

## Localização

Por padrão, o aplicativo usa um diretório de configuração do usuário e cria `magnetares.db`:

| Sistema | Diretório base | Arquivo |
| --- | --- | --- |
| Windows | `%LOCALAPPDATA%` | `Magnetares Notes\magnetares.db` |
| Linux | resultado de `os.UserConfigDir()` | `Magnetares Notes/magnetares.db` |
| macOS | resultado de `os.UserConfigDir()` | `Magnetares Notes/magnetares.db` |

Na interface, o caminho aparece em **Preferências > Armazenamento**. O usuário pode informar um caminho customizado; o app persiste essa escolha em `config.json` no diretório da aplicação.

Chaves de `config.json`: `customDatabasePath`, `tursoDatabaseUrl`, `autoSyncIntervalMinutes`, `syncProfileId` (perfil de sync fixado; ausente = automático) e `syncApiUrl` (API HTTP; ausente = conexão direta). Veja [API e sincronização](api-and-sync.md).

### Migração de nome antigo

Se o novo banco ainda não existe e o banco legado de `Aster Notes` existe, a inicialização tenta copiar o arquivo legado para o caminho Magnetares. Esse mecanismo existe para a transição do nome do produto.

## Configuração do SQLite

Ao abrir o store, o desktop aplica:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
```

- **WAL:** melhora a convivência entre leituras e escrita e é mais resistente a interrupções durante autosave.
- **Foreign keys:** garante integridade entre notas, pastas, tags e relações.
- **Busy timeout:** reduz falhas transitórias quando há bloqueio curto do banco.

O store limita conexões a uma (`SetMaxOpenConns(1)`), compatível com a configuração de PRAGMAs e com o perfil de acesso local do aplicativo.

## Migrações locais

Migrações estão em `apps/desktop/localmigrations` e são embutidas no binário pelo Go. Na abertura:

1. O aplicativo cria `schema_migrations` se necessário.
2. Lê os arquivos `*.sql` em ordem lexicográfica.
3. Executa somente migrações ainda não registradas.
4. Executa SQL e registro da migração na mesma transação.

Nunca altere uma migração já lançada. Crie uma nova migração com prefixo crescente, por exemplo `0004_novo_recurso.sql`.

### Migrações existentes

| Arquivo | Alteração |
| --- | --- |
| `0001_initial.sql` | Tabela de notas, revisão, lixeira e timestamps. |
| `0002_structured_body.sql` | Coluna `body_text` e backfill do texto legado. |
| `0003_organization.sql` | Pastas, `folder_id`, pin, projeção de checklist, tags, relação nota-tag e Pastas Inteligentes. |
| `0004_sync_state.sql` | Estado local de sincronização, revisão remota e conflitos. |
| `0005_folder_color_icon.sql` | Cor e ícone das pastas. |
| `0006_sync_outbox_and_tombstones.sql` | Outbox local, dispositivo e lápides de exclusão. |
| `0007_sync_folder_updated_at_index.sql` | Índice para sincronização de pastas. |
| `0007_tag_icon.sql` | Ícone persistido no catálogo de etiquetas. |
| `0008_managed_tags.sql` | Marca etiquetas criadas pelo usuário para preservar etiquetas vazias. |
| `0009_sync_tags.sql` | Colunas de sincronização e soft-delete em etiquetas para nuvem. |
| `0010_stickers.sql` | Tabelas `sticker_boards` e `stickers`, quadro padrão "Geral" e índices. |
| `0011_code_notes.sql` | Colunas `note_type` (`rtf`) e `language` (`plaintext`) em notas. |
| `0012_sync_profile_source.sql` | Origem do perfil de sincronização gravado (`remote`, `explicit`, `local`). |

> **Prefixo `0007` duplicado:** `0007_sync_folder_updated_at_index.sql` e `0007_tag_icon.sql` já foram aplicados em bancos existentes e são registrados pelo nome completo. Não os renomeie: um nome novo seria tratado como migração pendente e falharia ao recriar a coluna `icon`. Novas migrações continuam a partir de `0013_`.

As migrações em `db/migrations` descrevem o esquema remoto de referência; o esquema efetivo é criado por `InitSchema` em `apps/desktop/turso.go` e `apps/api/turso.go`, que devem ser mantidos em paridade.

## Modelo de dados local

### `notes`

| Coluna | Descrição |
| --- | --- |
| `id` | Identificador da nota. |
| `title` | Título editável. |
| `body` | Documento Tiptap JSON ou texto legado. |
| `body_text` | Texto extraído para prévia e busca local. |
| `folder` | Nome legado da pasta; mantido por compatibilidade. |
| `folder_id` | Pasta local atual. |
| `revision` | Revisão crescente para evolução futura de sync. |
| `pinned_at` | Data de fixação, ou `NULL`. |
| `checklist_total` / `checklist_open` | Projeção de nós `taskItem` do documento JSON. |
| `deleted_at` | Exclusão lógica/lixeira. |
| `created_at` / `updated_at` | Epoch em milissegundos. |

### `sticker_boards` (Quadros de Stickers)

| Coluna | Descrição |
| --- | --- |
| `id` | Identificador do quadro (ex.: `board-default` para Geral). |
| `name` | Nome único do quadro (até 64 caracteres). |
| `color` | Cor temática do quadro (paleta pastel). |
| `position` | Posição inteira para ordenação na barra lateral. |
| `is_default` | Booleano que impede a exclusão do quadro padrão. |
| `created_at` / `updated_at` | Epoch em milissegundos. |
| `deleted_at` | Exclusão lógica para sincronização. |
| `sync_state` | Estado de sincronização (`clean` / `pending`). |

### `stickers` (Notas Autoadesivas)

| Coluna | Descrição |
| --- | --- |
| `id` | Identificador único do sticker. |
| `board_id` | Quadro ao qual o sticker pertence. |
| `title` | Título (até 120 caracteres). |
| `body` | Corpo em texto simples (até 5.000 caracteres). |
| `color` | Cor de fundo pastel do card (8 opções). |
| `position` | Posição fracionária (`REAL`) para ordenação contínua. |
| `pinned_at` | Data de fixação no topo, ou `NULL`. |
| `created_at` / `updated_at` | Epoch em milissegundos. |
| `deleted_at` | Exclusão lógica para sincronização. |
| `sync_state` | Estado de sincronização (`clean` / `pending`). |

### Organização

- `folders`: árvore por `parent_id`; não permite ciclos nem exclusão de pasta usada.
- `tags`: nome normalizado, único, ícone e marca de etiqueta gerenciada.
- `note_tags`: associação N:N entre nota e tag.
- `smart_folders`: regra única por pasta inteligente (`tag`, `date` ou `checklist`).

## Backup e restauração

### Backup manual recomendado

1. Feche o aplicativo ou confirme que o banco não está sendo escrito.
2. Copie `magnetares.db` para outro disco/local seguro.
3. Se existirem arquivos `magnetares.db-wal` e `magnetares.db-shm`, copie-os junto quando o app estiver aberto.

Para máxima consistência, use o app fechado ou um mecanismo de backup que compreenda SQLite/WAL.

### Restaurar

1. Feche o aplicativo.
2. Guarde uma cópia do banco atual.
3. Substitua o arquivo configurado pelo arquivo de backup.
4. Abra o app; as migrações pendentes serão aplicadas automaticamente.

### Recuperação de nota sincronizada

Quando uma nota for danificada por uma versão remota, não edite nem sincronize repetidamente antes de preservar o estado. O procedimento seguro é:

1. Fechar o desktop.
2. Copiar o banco local e os arquivos WAL para um local de backup.
3. Identificar o último snapshot correto por cursor/revisão no Turso.
4. Restaurar localmente usando a revisão remota atual como base.
5. Publicar a restauração como uma nova revisão, sem apagar o histórico anterior.

O laboratório de sincronização em `tests/` cobre cursores e snapshots. Backups de recuperação gerados pelo aplicativo ficam em `%LOCALAPPDATA%\Magnetares Notes\recovery` e devem ser mantidos até a validação do novo sync.

## Troca de local do banco

Em **Preferências > Armazenamento**, informe um arquivo `.db` gravável. No desktop nativo, o aplicativo fecha o store atual, abre o banco informado e atualiza a configuração local.

> **Atenção:** escolher um caminho novo cria ou abre outro banco. O aplicativo atual não possui assistente visual de cópia/mesclagem entre bancos. Faça backup manual antes da troca.
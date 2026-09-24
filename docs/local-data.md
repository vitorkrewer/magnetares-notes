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

### Organização

- `folders`: árvore por `parent_id`; não permite ciclos nem exclusão de pasta usada.
- `tags`: nome normalizado e único.
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

## Troca de local do banco

Em **Preferências > Armazenamento**, informe um arquivo `.db` gravável. No desktop nativo, o aplicativo fecha o store atual, abre o banco informado e atualiza a configuração local.

> **Atenção:** escolher um caminho novo cria ou abre outro banco. O aplicativo atual não possui assistente visual de cópia/mesclagem entre bancos. Faça backup manual antes da troca.
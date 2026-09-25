# API e sincronização

## Estado atual

O Magnetares implementa sincronização incremental de notas, pastas, metadados e lápides de exclusão. Cada desktop mantém SQLite local e uma outbox; quando o usuário solicita sync (ou salva uma alteração), o aplicativo envia alterações pendentes e busca mudanças posteriores por cursor, garantindo a paridade entre o banco de dados local e o banco de dados na nuvem (Turso).

## Endpoints implementados

### `GET /healthz`

Retorna `204 No Content` se a API estiver acessível.

### `GET /v1/changes`

Recebe `cursor`, `limit` e o header `X-Magnetares-Profile`. Retorna alterações ordenadas por cursor, incluindo lápides de exclusão e metadados organizacionais completos.

### `PUT /v1/notes/{id}`

Cria, atualiza ou restaura uma nota. Exige `baseRevision` e `mutationId`; o servidor devolve `409 Conflict` quando a revisão não corresponde ao estado canônico. Preserva pastas, fixação (`pinnedAt`), etiquetas (`tags`) e contagem de checklists.

### `DELETE /v1/notes/{id}`

Registra uma exclusão lógica remota e devolve uma lápide versionada.

### `GET /v1/folders`

Lista todas as pastas salvas na nuvem para o perfil ativo.

### `PUT /v1/folders/{id}`

Cria ou atualiza uma pasta na nuvem (suportando hierarquia `parentId`).

### `DELETE /v1/folders/{id}`

Registra a exclusão lógica de uma pasta na nuvem.

Exemplo de corpo de mutação de nota:

```json
{
  "baseRevision": 1,
  "mutationId": "550e8400-e29b-41d4-a716-446655440000",
  "note": {
    "title": "Plano de Projeto",
    "body": "{\"type\":\"doc\"}",
    "bodyText": "Plano de projeto",
    "folder": "Trabalho",
    "folderId": "folder-123",
    "pinnedAt": "2026-09-25T14:00:00Z",
    "tags": ["importante", "projeto"],
    "checklistTotal": 5,
    "checklistOpen": 2
  }
}
```

## O que é sincronizado hoje

- ID, título, documento estruturado, texto extraído, revisão remota, cursor e datas canônicas do servidor.
- **Estrutura de Pastas:** `folderId`, `folder` (nome), e tabela remota `sync_folders` preservando a hierarquia.
- **Etiquetas (Tags):** associação N:N entre notas e tags sincronizada via array e processada localmente.
- **Metadados de Organização:** nota fixada (`pinnedAt`), estado e contagem de checklists (`checklistTotal`, `checklistOpen`).
- Exclusão e restauração por lápide (`deletedAt`).
- Outbox local com mutações idempotentes por `mutationId`.
- Conflitos preservados localmente em `note_conflicts`, sem sobrescrever a edição do usuário.

## O que ainda não é sincronizado

- Pastas Inteligentes personalizadas (sincronização de regras dinâmicas).
- Configurações locais de tema e caminho do banco.
- Merge automático de conflitos no corpo da nota.
- Autenticação de usuário de produção.

## Contrato OpenAPI

`packages/contracts/openapi.yaml` descreve `GET /v1/changes`, `PUT /v1/notes/{id}`, `DELETE /v1/notes/{id}`, `GET /v1/folders`, `PUT /v1/folders/{id}` e `DELETE /v1/folders/{id}`.

## Turso/libSQL

A API converte `libsql://...` para o endpoint HTTPS de pipeline `.../v2/pipeline`, envia SQL parametrizado e usa `Authorization: Bearer <token>`.

Na inicialização, a API e o aplicativo Desktop aplicam a migração automática para a tabela remota `sync_notes` (com colunas de pastas e metadados) e a tabela `sync_folders`.

## Configuração da API

```dotenv
PORT=8080
TURSO_DATABASE_URL=libsql://<database>.turso.io
TURSO_AUTH_TOKEN=<token>
```

## CORS e autenticação

O servidor atual responde com CORS aberto para facilitar desenvolvimento. Não há contas de usuário, sessão ou autorização de chamadas. Isso é uma limitação de segurança importante; veja [Segurança](security.md).

## Uso no desktop

Em **Preferências > Nuvem**, o usuário pode manter o modo offline ou informar a URL e o token do próprio Turso. O token é armazenado no cofre de credenciais do sistema, e o desktop o envia ao serviço de sync pelo bridge Wails.

> O aplicativo continua utilizável offline mesmo sem uma API configurada.
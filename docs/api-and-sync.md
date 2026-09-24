# API e sincronização

## Estado atual

O Magnetares implementa sincronização incremental de notas e lápides de exclusão. Cada desktop mantém SQLite local e uma outbox; quando o usuário solicita sync, o aplicativo envia alterações pendentes e busca mudanças posteriores por cursor. Pastas, tags, pin e Pastas Inteligentes continuam locais neste primeiro corte.

## Endpoints implementados

### `GET /healthz`

Retorna `204 No Content` se a API estiver acessível.

### `GET /v1/changes`

Recebe `cursor`, `limit` e o header `X-Magnetares-Profile`. Retorna alterações ordenadas por cursor, incluindo lápides de exclusão.

### `PUT /v1/notes/{id}`

Cria, atualiza ou restaura uma nota. Exige `baseRevision` e `mutationId`; o servidor devolve `409 Conflict` quando a revisão não corresponde ao estado canônico.

### `DELETE /v1/notes/{id}`

Registra uma exclusão lógica remota e devolve uma lápide versionada.

Exemplo de corpo:

```json
{
  "notes": [
    {
      "id": "nota-123",
      "title": "Plano",
      "body": "{\"type\":\"doc\"}",
      "bodyText": "Plano de lançamento",
      "folder": "Notas",
      "folderId": "folder-default",
      "revision": 4,
      "updatedAt": "2026-09-24T12:00:00Z"
    }
  ]
}
```

Resposta atual:

```json
{
  "syncedAt": "2026-09-24T12:01:00Z",
  "count": 1,
  "message": "Sincronização com a nuvem concluída com sucesso."
}
```

## O que é sincronizado hoje

- ID, título, documento estruturado, texto extraído, revisão remota, cursor e datas canônicas do servidor.
- Exclusão e restauração por lápide (`deletedAt`).
- Outbox local com mutações idempotentes por `mutationId`.
- Conflitos preservados localmente em `note_conflicts`, sem sobrescrever a edição do usuário.

## O que ainda não é sincronizado

- Tags, relações de tags, Pastas Inteligentes e hierarquia de pastas.
- Configurações de tema e caminho do banco.
- Merge automático do corpo de uma nota em conflito.
- Autenticação de usuário de produção.

## Contrato OpenAPI

`packages/contracts/openapi.yaml` descreve `GET /v1/changes`, `PUT /v1/notes/{id}` e `DELETE /v1/notes/{id}` com cursor, revisão e `409 Conflict`.

Antes de publicar uma API estável, a próxima evolução deve:

1. Substituir o perfil beta por autenticação de usuário validada na API.
2. Sincronizar metadados de organização e regras inteligentes.
3. Criar UI de resolução de conflitos e cópia de conflito de nota.
4. Adicionar merge estruturado de documentos ou CRDT para colaboração.

## Turso/libSQL

A API converte `libsql://...` para o endpoint HTTPS de pipeline `.../v2/pipeline`, envia SQL parametrizado e usa `Authorization: Bearer <token>`.

Na inicialização, quando as credenciais existem no ambiente, a API tenta criar a tabela remota mínima `notes`.

## Configuração da API

```dotenv
PORT=8080
TURSO_DATABASE_URL=libsql://<database>.turso.io
TURSO_AUTH_TOKEN=<token>
```

O arquivo `.env` é apropriado para desenvolvimento local. Em produção, injete variáveis pelo ambiente do provedor. Nunca envie o arquivo `.env` ao repositório.

## CORS e autenticação

O servidor atual responde com CORS aberto para facilitar desenvolvimento. Não há contas de usuário, sessão ou autorização de chamadas. Isso é uma limitação de segurança importante; veja [Segurança](security.md).

## Uso no desktop

Em **Preferências > Nuvem**, o usuário pode manter o modo offline ou informar a URL e o token do próprio Turso. O token é armazenado no cofre de credenciais do sistema, e o desktop o envia ao serviço de sync pelo bridge Wails, nunca por `localStorage` ou bundle.

O perfil de sync é derivado internamente da URL Turso; computadores configurados com a mesma URL e token sincronizam a mesma coleção beta/self-hosted sem exigir que o usuário conheça API ou cursor.

> O aplicativo continua utilizável offline mesmo sem uma API configurada.
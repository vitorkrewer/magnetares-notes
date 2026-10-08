# API e sincronização

## Estado atual

O Magnetares implementa sincronização incremental de notas, pastas, metadados e lápides de exclusão. Cada desktop mantém SQLite local e uma outbox; quando o usuário solicita sync ou o intervalo automático dispara, o aplicativo primeiro finaliza os autosaves locais, envia alterações pendentes e busca mudanças posteriores por cursor.

As mutações remotas são protegidas por revisão-base e `mutationId`. A gravação da nota, snapshot do evento, cursor e registro de idempotência ocorre em uma transação Turso. Latência pode atrasar uma rodada, mas não deve permitir que uma revisão antiga substitua uma nova.

## Motor de sincronização

O motor é escolhido de forma determinística, sem sondagem de rede:

| Condição | Motor |
| --- | --- |
| `syncApiUrl` configurado (ou URL passada pelo frontend) | **API HTTP** (`apps/api`) para notas e pastas; etiquetas e stickers seguem pela conexão direta. |
| Sem URL de API (padrão) | **Conexão direta** do desktop com o Turso (pipeline Hrana). |

Antes, o desktop tentava `http://localhost:8080` e caía para o modo direto quando a API não respondia; duas máquinas podiam usar motores diferentes sem perceber. Esse comportamento foi removido.

## Perfil de sincronização

Todas as tabelas remotas são particionadas por `user_id` (o **perfil**). Dispositivos só compartilham dados quando usam o mesmo perfil no mesmo banco.

O perfil é uma propriedade do **banco remoto**: a tabela `sync_settings` guarda a chave `primary_profile_id`. Resolução, em ordem de prioridade:

1. **Explícito:** `syncProfileId` em `config.json` (uso avançado; ignora o principal).
2. **Principal remoto:** `sync_settings.primary_profile_id`.
3. **Sem acesso à nuvem:** o perfil já gravado em `sync_metadata` continua em uso. O perfil **nunca** é trocado sem consultar a nuvem.

### Eleição do perfil principal

Na primeira sincronização de uma versão nova contra um banco sem `primary_profile_id`, o desktop elege o principal nesta ordem:

1. o perfil canônico derivado da URL (SHA-1 de `libsql://<host>` normalizado), se tiver dados;
2. o perfil atual da máquina, se tiver dados;
3. a partição com mais notas;
4. o perfil canônico.

A gravação usa `INSERT OR IGNORE` seguido de releitura: duas máquinas elegendo ao mesmo tempo convergem para o mesmo valor. URLs `libsql://host` derivam o mesmo perfil da v1.6.0.

### Incorporação de partições antigas

A cada sincronização, partições de outros perfis no mesmo banco (máquinas ainda na v1.6.0, URLs digitadas de outra forma) são **copiadas** para o principal: itens com o mesmo ID ficam com a versão de `updated_at` mais recente, notas alteradas recebem nova revisão e um evento em `sync_note_changes`. A origem **não é apagada**, para que máquinas antigas continuem funcionando. A chave `absorbed:<perfil>` guarda uma assinatura da partição e evita reprocessá-la sem mudanças.

> [!WARNING]
> Durante a transição, máquinas na v1.6.0 não recebem as edições feitas nas máquinas novas, e uma edição posterior da mesma nota numa máquina antiga vence por ser mais recente (a versão anterior permanece nos snapshots de `sync_note_changes`). Atualize todas as máquinas o quanto antes.

### Troca de perfil e rebase local

Quando o perfil efetivo da máquina muda, o desktop:

1. grava um backup do SQLite em `<pasta do banco>\recovery\magnetares-<data>-perfil-<de>-para-<para>.db`;
2. zera `server_revision`, marca notas, pastas, etiquetas, quadros e stickers como `pending` com novos mutation ids, descarta conflitos antigos e reinicia o cursor. Notas que estavam limpas (sem edição local) recebem mutation id com prefixo `rebase-`.

Na rodada seguinte, conteúdo equivalente converge sem conflito. Notas `rebase-` cuja versão na nuvem difere recebem a versão da nuvem (eram cópias desatualizadas, já que partições antigas são incorporadas antes); só notas com edição local real viram conflito. Pastas, etiquetas e stickers usam a escrita mais recente. A mensagem da sincronização informa a troca e o caminho do backup.

### Painel

Em **Preferências > Nuvem > Perfil de sincronização**:

- **Verificar perfis na nuvem** lista as partições do banco, com contagens e selos *Principal*, *Este dispositivo* e *Antigo · incorporado*.
- **Tornar principal** troca `primary_profile_id` para todas as máquinas atualizadas; o principal anterior passa a ser incorporado ao novo.
- **Remover** incorpora uma partição antiga ao principal e a apaga da nuvem. Use somente depois de atualizar todas as máquinas.
- **Voltar ao perfil automático** aparece quando há um perfil explícito fixado.

### Roteiro de atualização (bancos já em uso)

1. Atualize uma máquina e sincronize: o principal é eleito (a partição com dados) e as partições antigas são incorporadas.
2. Atualize as demais: cada uma faz backup, adota o principal e reenvia suas notas locais.
3. Quando todas estiverem atualizadas, remova as partições antigas pelo painel (opcional).

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
- **Estrutura de Pastas:** `folderId`, `folder` (nome), metadados de personalização (`color` HSL, `icon` visual) e tabela remota `sync_folders` preservando a hierarquia.
- **Etiquetas (Tags):** associação N:N entre notas e tags sincronizada via array, mais o catálogo (nome, ícone, exclusão lógica) em `sync_tags`.
- **Stickers:** quadros (`sync_sticker_boards`) e cards (`sync_stickers`), por última escrita.
- **Tipo de nota:** `note_type` (`rtf`, `code`, …) e `language` (`plaintext`, …); valores remotos legados (`richtext`, vazio) são normalizados para evitar falsos conflitos.
- **Metadados de Organização:** nota fixada (`pinnedAt`), estado e contagem de checklists (`checklistTotal`, `checklistOpen`).
- Exclusão e restauração por lápide (`deletedAt`).
- Resolução robusta de conflitos: Inserção direta sem falsos conflitos quando a nota não existe no servidor (`found = false`).
- Outbox local com mutações idempotentes por `mutationId`.
- Snapshots históricos em `sync_note_changes.snapshot_json`, evitando que um cursor antigo leia o estado atual da nota.
- Conflitos reais preservados localmente em `note_conflicts`, com escolha de versão local, remota ou mesclagem manual.
- Conteúdo semanticamente igual em revisões diferentes converge sem abrir conflito.

## O que ainda não é sincronizado

- Pastas Inteligentes personalizadas (sincronização de regras dinâmicas).
- Configurações locais de tema, caminho do banco, intervalo automático e perfil fixado.
- Autenticação de usuário de produção.

## Contrato OpenAPI

`packages/contracts/openapi.yaml` descreve `GET /v1/changes`, `PUT /v1/notes/{id}`, `DELETE /v1/notes/{id}`, `GET /v1/folders`, `PUT /v1/folders/{id}` e `DELETE /v1/folders/{id}`.

## Turso/libSQL

A API converte `libsql://...` para o endpoint HTTPS de pipeline `.../v2/pipeline`, envia SQL parametrizado e usa `Authorization: Bearer <token>`.

Na inicialização, a API e o aplicativo Desktop aplicam a migração automática para a tabela remota `sync_notes` (com colunas de pastas e metadados) e a tabela `sync_folders`.

Cada evento de nota também guarda um snapshot JSON. Isso permite reconstruir o conteúdo de uma revisão específica e é usado para diagnóstico/recuperação.

## Configuração da API

```dotenv
PORT=8080
TURSO_DATABASE_URL=libsql://<database>.turso.io
TURSO_AUTH_TOKEN=<token>
```

## CORS e autenticação

O servidor atual responde com CORS aberto para facilitar desenvolvimento. Não há contas de usuário, sessão ou autorização de chamadas. Isso é uma limitação de segurança importante; veja [Segurança](security.md).

## Uso no desktop

Em **Preferências > Nuvem**, o usuário pode manter o modo offline ou informar a URL e o token do próprio Turso. O token é armazenado no cofre de credenciais do sistema, e o desktop o envia ao serviço de sync pelo bridge Wails. A URL e as opções ficam em `config.json`:

| Chave | Uso |
| --- | --- |
| `tursoDatabaseUrl` | URL do banco Turso. |
| `autoSyncIntervalMinutes` | Intervalo da sincronização automática. |
| `syncProfileId` | Perfil fixado manualmente; ausente = automático. |
| `syncApiUrl` | URL da API HTTP; ausente = conexão direta. |

Na mesma tela, **Sincronização automática** pode ser desativada ou configurada para 5, 15, 30 ou 60 minutos. O intervalo é local e não altera o banco remoto. O automatic sync não roda em paralelo com um sync manual e não inicia antes dos autosaves pendentes terminarem.

> O aplicativo continua utilizável offline mesmo sem uma API configurada.
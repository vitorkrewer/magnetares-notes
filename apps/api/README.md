# Magnetares Notes — Servidor da API (Sync)

Servidor HTTP em Go para coordenação de sincronização remota e persistência no Turso (libSQL).

---

## 🚀 Como executar localmente

1. Copie o arquivo de exemplo de ambiente:
   ```bash
   cp .env.example .env
   ```

2. Configure suas variáveis no arquivo `.env` (ou passe via variáveis de ambiente do sistema):
   - `PORT`: Porta onde o servidor escutará (padrão `8080`).
   - `TURSO_DATABASE_URL`: URL do banco de dados Turso (`libsql://...`).
   - `TURSO_AUTH_TOKEN`: Token de autenticação emitido pelo Turso.

3. Execute a API:
   ```bash
   go run .
   ```

4. Executar os testes:
   ```bash
   go test ./...
   ```

---

## 🔒 Segurança

Consulte o documento completo em [`docs/security.md`](../../docs/security.md).

- **NUNCA** commite arquivos `.env` com tokens reais. O `.env` já está no `.gitignore`.
- O arquivo `.env.example` deve conter **apenas valores de exemplo/placeholders**.
- A API suporta receber credenciais do Turso centralizadas via variáveis de ambiente do servidor, ou por requisição através dos headers `X-Magnetares-Turso-URL` e `X-Magnetares-Turso-Token`.

---

## 📡 Endpoints principais

- `GET /healthz`: Health check (retorna `204 No Content`).
- `GET /v1/changes`: Lista mudanças remotas a partir de um cursor de revisão.
- `PUT /v1/notes/{id}`: Cria ou atualiza uma nota com detecção de conflitos.
- `DELETE /v1/notes/{id}`: Soft-delete de uma nota (tombstone).
- `PUT /v1/folders/{id}`: Criação ou atualização de pastas.
- `DELETE /v1/folders/{id}`: Soft-delete de pastas.
- `PUT /v1/tasks/{id}`: Criação ou atualização de tarefas.
- `PUT /v1/task-lists/{id}`: Criação ou atualização de listas de tarefas.

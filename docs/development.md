# Desenvolvimento local

## Pré-requisitos

| Ferramenta | Versão/uso |
| --- | --- |
| Go | 1.25 ou superior para os módulos atuais. |
| Node.js | 22.x recomendado para reproduzir CI e release. |
| npm | Instalação e build do frontend. |
| Wails v2 | Execução e build desktop. |
| Windows | WebView2 para executar Wails; `wails doctor` confirma pré-requisitos. |

## Instalação

```powershell
git clone <URL_DO_REPOSITORIO>
Set-Location <REPOSITORIO>

Set-Location apps/desktop/frontend
npm ci

go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0
```

## Comandos

### Frontend

```powershell
Set-Location apps/desktop/frontend
npm run dev
npm run build
npm run lint
```

`npm run build` executa `tsc --noEmit` e `vite build`.

### Desktop

```powershell
Set-Location apps/desktop
go test .
wails dev -skipbindings
wails build -skipbindings -clean -trimpath
```

O banco padrão é criado no diretório de dados do usuário, nunca no repositório.

### API

```powershell
Set-Location apps/api
go test ./...
go run .
```

Por padrão, a API escuta em `http://localhost:8080`.

### Site estático

`site/index.html` é estático e pode ser aberto diretamente no navegador. Para validar uma experiência próxima ao Pages, use qualquer servidor estático local; não há dependência Node obrigatória para o site.

## Tarefas VS Code

O workspace fornece:

- `Magnetares: executar desktop`: executa `wails dev -skipbindings` em `apps/desktop`.
- `Magnetares: executar API`: executa `go run .` em `apps/api`.

## Variáveis de ambiente

### API

Crie `apps/api/.env` localmente:

```dotenv
PORT=8080
TURSO_DATABASE_URL=libsql://<seu-banco>.turso.io
TURSO_AUTH_TOKEN=<token-secreto>
```

O arquivo `.env` não deve ser versionado. Não coloque token no frontend, em logs ou em documentação pública.

### Desktop

`VITE_API_BASE_URL` pode ser injetado no build como endereço público da API. Ele não é segredo. O aplicativo também permite configurar o endereço da API em Preferências para desenvolvimento/operadores.

## Convenções do repositório

- Frontend -> bridge Wails -> API; o frontend não usa Turso diretamente.
- Migrações são incrementais; nunca reescreva uma aplicada.
- O desktop não contém credenciais de servidor em releases de produção.
- Antes de alterar contrato HTTP, atualize `packages/contracts/openapi.yaml` e implemente os dois lados juntos.
- Preserve foco visível, atalhos de teclado e contraste na experiência desktop.

## Diagnóstico

| Problema | Comando ou ação |
| --- | --- |
| Wails não abre | `wails doctor` no ambiente de desenvolvimento. |
| Erro TypeScript | `npm run build` em `apps/desktop/frontend`. |
| Falha de persistência | `go test .` em `apps/desktop`. |
| API não responde | `go run .` em `apps/api`, depois `GET /healthz`. |
| Dependências inconsistentes | Remova somente `node_modules` local e rode `npm ci`; não altere `package-lock.json` manualmente. |

## Estrutura de código relevante

```text
apps/
  desktop/
    app.go                 bridge Wails
    storage.go             SQLite, migrações e notas
    organization.go        pastas, tags, regras
    localmigrations/       esquema local incremental
    frontend/src/ui/       React
  api/
    main.go                HTTP e sync
    turso.go               cliente Turso pipeline
```
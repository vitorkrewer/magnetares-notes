# Testes e validação

## Estratégia atual

O projeto tem cobertura automatizada principalmente no pacote Go do desktop. A validação do frontend é feita por typecheck/build; não há runner de testes React dedicado no momento.

## Testes do desktop

Execute:

```powershell
Set-Location apps/desktop
go test -v -count=1 .
```

### Cenários cobertos

| Teste | Comportamento coberto |
| --- | --- |
| `TestNotesPersistAcrossReopen` | Criação, alteração, reabertura do banco, lixeira e restauração. |
| `TestStructuredBodyMigrationPreservesPlainText` | Migração de texto legado para `body_text`. |
| `TestFolderHierarchyAndRestrictedDeletion` | Pastas, subpastas, ciclo e exclusão restrita. |
| `TestPinTagsAndChecklistProjectionSurviveAutosave` | Pin, tags, checklist e isolamento de metadados contra autosave atrasado. |
| `TestSmartFolderRules` | Regras por tag, data/checklist, exclusão lógica e consulta inteligente. |

## Testes da API

```powershell
Set-Location apps/api
go test ./...
```

Além dos testes do pacote, há um laboratório de integração em `tests/` que inicia a API real e um Turso fake baseado em SQLite:

```powershell
Set-Location tests
go test -v -count=1 -timeout=2m .
```

Ou, no Windows:

```powershell
./run-five-computers.ps1
```

No Linux/macOS:

```bash
sh ./run-five-computers.sh
```

O cenário `TestFiveComputersConcurrentEdits` simula cinco computadores usando o mesmo perfil remoto. Todos fazem pull da revisão 1 e enviam edições diferentes ao mesmo tempo. O teste exige uma única aceitação na revisão 2, quatro conflitos HTTP 409, retry idempotente, snapshots distintos nos cursores e uma resolução posterior na revisão 3. Nenhum token ou banco Turso real é necessário.

## Frontend

```powershell
Set-Location apps/desktop/frontend
npm run build
npm run lint
```

O build valida TypeScript e Vite. A interface deve ser conferida manualmente ou com automação de navegador nos fluxos abaixo.

## Checklist manual de regressão

### Notas e editor

- Criar uma nota e confirmar **Salvo** após autosave.
- Alternar título, negrito, itálico, destaque, listas, checklist, tabela e cálculo.
- Alternar nota selecionada e retornar, verificando conteúdo e toolbar.
- Mover para lixeira e restaurar.

### Organização

- Criar pasta e subpasta.
- Tentar criar ciclo de pasta e confirmar rejeição.
- Fixar e desafixar nota.
- Adicionar/remover etiqueta.
- Criar uma Pasta Inteligente e confirmar a lista filtrada.

### Preferências

- Alternar claro/escuro e reiniciar a página/app.
- Conferir o caminho do banco local.
- Validar que token não aparece em screenshots ou logs.

### Importação/exportação

- Importar `.md` com primeira linha `# Título`.
- Exportar Markdown, HTML e texto.
- Abrir impressão e conferir que barras de navegação não aparecem.

## Lacunas de teste

- Não há testes E2E versionados para frontend.
- Não há teste de build de release em todos os sistemas fora do GitHub Actions.

Essas lacunas devem ser reduzidas antes de classificar o produto como sincronização de produção.
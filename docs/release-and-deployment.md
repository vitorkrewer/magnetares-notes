# Release e deploy

## Versionamento

As releases usam tags Git:

```text
vMAJOR.MINOR.PATCH
```

Exemplo:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

Mantenha `CHANGELOG.md` atualizado antes de criar a tag. O changelog humano complementa as release notes geradas automaticamente pelo GitHub.

## CI

O workflow `.github/workflows/ci.yml` é executado em Windows e deve validar:

1. `go test ./...` na API.
2. `npm ci` no frontend.
3. `npm run build` no frontend.
4. `go test .` no desktop, depois dos assets do frontend existirem para o `go:embed`.

## Release desktop

O workflow `.github/workflows/release.yml` dispara em tags `v*`.

### Matriz atual

| Runner | Plataforma Wails | Artefato esperado |
| --- | --- | --- |
| `windows-latest` | `windows/amd64` | executável `.exe` |
| `ubuntu-latest` | `linux/amd64` | pacote `.tar.gz` |
| `macos-latest` | `darwin/universal` | aplicativo compactado `.zip` |

O workflow instala dependências do Linux, Wails, dependências npm e chama:

```text
wails build -clean -trimpath -platform <plataforma>
```

### Configuração de release

- `VITE_API_BASE_URL` pode ser definida como variável do repositório (`vars.VITE_API_BASE_URL`).
- Não injete token Turso no build do desktop.
- O ícone principal do Wails está em `apps/desktop/build/appicon.png`.
- O nome de saída vem de `apps/desktop/wails.json`.

## Checklist antes de publicar

- [ ] Todos os testes Go passam localmente.
- [ ] `npm run build` passa sem erros.
- [ ] `CHANGELOG.md` descreve a versão.
- [ ] A tag segue SemVer e corresponde à versão desejada.
- [ ] Links de download em `site/script.js` apontam para os artefatos da release.
- [ ] Nenhum `.env`, token, banco `.db` ou arquivo de usuário está no commit.
- [ ] A API de produção está em HTTPS e os segredos estão no ambiente do servidor.

## Assinatura e notarização

Os workflows atuais compilam artefatos, mas não os assinam.

### Windows

Antes de distribuir amplamente, configure um certificado de code signing em GitHub Environments ou secret manager. Documente origem, expiração, proteção do ambiente e validação do hash do instalador.

### macOS

Para evitar alertas do Gatekeeper, é necessário assinar com Apple Developer ID e notarizar o `.app`. Essas credenciais devem ficar em ambiente protegido, nunca no repositório.

## GitHub Pages

`.github/workflows/pages.yml` publica `site/` no GitHub Pages em pushes para `main` que alterem a página. Ative **Settings > Pages > Source: GitHub Actions** no repositório.

## Deploy da API

O repositório não contém deploy automático da API. Escolha um provedor compatível com Go/containers e configure:

- `PORT`;
- `TURSO_DATABASE_URL`;
- `TURSO_AUTH_TOKEN`;
- HTTPS;
- domínio público para a URL configurada no desktop.

Antes do deploy público, siga o checklist de [Segurança](security.md).
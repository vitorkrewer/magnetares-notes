# Segurança

## Status de segurança

O Magnetares é funcional como aplicativo local, mas o modo de sincronização atual deve ser tratado como **beta de desenvolvimento**, não como serviço multiusuário de produção.

## Regra de ouro

`TURSO_AUTH_TOKEN` nunca deve aparecer em:

- código-fonte frontend;
- `localStorage` de navegador;
- arquivos de release desktop ou código-fonte;
- GitHub Actions de build desktop;
- logs, issues, screenshots, documentação ou mensagens de chat.

## Modo Turso pessoal e autenticação

No modo self-managed, o usuário informa URL e token Turso uma vez. O token é enviado ao bridge Wails e armazenado no cofre do sistema operacional; ele não fica em `localStorage` ou nos assets do frontend. A API recebe o token em headers apenas para executar aquela sync.

Esse modo ainda é beta: o perfil UUID é derivado da URL do banco para associar dispositivos, mas não substitui autenticação de usuário. Sem autenticação de usuários, qualquer cliente que alcance a API pode tentar chamar endpoints; CORS também está aberto (`*`).

### Antes de distribuir para usuários finais

1. Rotacione imediatamente qualquer token que tenha sido exposto em chat, commit, captura ou arquivo público.
2. Para uma oferta SaaS/produção, faça a API guardar o token Turso exclusivamente no ambiente do servidor.
3. Troque o perfil beta por autenticação do usuário contra sua API.
5. Restrinja CORS às origens necessárias.
6. Adicione autorização, auditoria e limites de taxa à API.

## Dados locais

O banco SQLite contém o conteúdo de notas em claro no disco local. O aplicativo atual não cifra o banco, nem bloqueia notas individuais.

Boas práticas para o usuário:

- use conta do sistema operacional protegida por senha;
- mantenha o disco cifrado (BitLocker, FileVault ou LUKS);
- faça backup em local seguro;
- não compartilhe o arquivo `.db` sem entender que ele contém notas completas.

## Roadmap mínimo para produção

| Área | Necessidade |
| --- | --- |
| Autenticação | Usuário/sessão entre desktop e API. |
| Segredo Turso | Apenas API, configurado no ambiente de deploy. |
| Sync | Cursor, revisões, `409 Conflict`, exclusões e merge. |
| Transporte | HTTPS obrigatório em produção. |
| CORS | Lista explícita de origens. |
| Banco local | Opção de cifra e/ou chave protegida por sistema operacional. |
| Releases | Assinatura Windows e notarização macOS. |

## Relato de vulnerabilidade

Não abra uma issue pública com token, banco, conteúdo de nota ou detalhes exploráveis. Use um canal privado definido pelos mantenedores do projeto e inclua apenas informações suficientes para reproduzir sem expor dados de usuários.
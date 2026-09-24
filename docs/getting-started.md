# Guia inicial

## O que é o Magnetares Notes

Magnetares Notes é um aplicativo desktop de notas para Windows, macOS e Linux. A proposta é **local-first**: a primeira abertura cria um banco SQLite local, e o aplicativo continua utilizável sem rede. A nuvem Turso é opcional e deve ser tratada como backup/sincronização avançada.

## Requisitos para uso do aplicativo

Para quem baixa um release, não há instalação de Go, Node.js ou Wails. Basta baixar o artefato da plataforma e executá-lo:

| Plataforma | Artefato esperado | Observação |
| --- | --- | --- |
| Windows | `Magnetares-Notes-Windows.exe` | Windows 10 ou superior e WebView2. |
| Linux | `Magnetares-Notes-Linux-x64.tar.gz` | Extraia e execute o binário incluído. |
| macOS | `Magnetares-Notes-macOS-universal.zip` | Extraia o `.app`; requisitos de assinatura/notarização dependem do release. |

Os links publicados na landing page do projeto são configurados no arquivo `site/script.js` depois que os artefatos estiverem disponíveis no GitHub Release.

## Primeira execução

1. Abra o Magnetares Notes.
2. O aplicativo cria ou abre seu banco local automaticamente.
3. Crie uma nota ou importe arquivos Markdown/texto.
4. Abra **Preferências** pelo ícone de engrenagem no rodapé da barra lateral para escolher o tema, consultar o banco local ou configurar a sincronização opcional.

### Local padrão do banco

O caminho é escolhido por plataforma e pode ser alterado em **Preferências > Armazenamento**:

| Plataforma | Caminho padrão |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Magnetares Notes\magnetares.db` |
| Linux | `~/.config/Magnetares Notes/magnetares.db` |
| macOS | `~/Library/Application Support/Magnetares Notes/magnetares.db` |

Ao abrir uma instalação migrada de versões antigas, o aplicativo tenta copiar o banco legado de `Aster Notes` para o novo local quando o banco Magnetares ainda não existe.

> **Atenção:** escolher um caminho novo cria/abre outro banco. Faça backup do arquivo atual antes de trocar o local se precisar preservar notas existentes.

## Preferências

### Geral e aparência

- **Claro:** papel claro e alto contraste.
- **Escuro:** interface de baixo brilho para ambientes escuros.
- A escolha fica no armazenamento local do aplicativo e volta a ser aplicada na próxima abertura.

### Armazenamento

Mostra o caminho do SQLite atual e permite definir outro arquivo `.db`. No desktop nativo, o bridge Wails fecha o store atual, abre o novo banco, aplica migrações e recarrega notas/navegação.

### Nuvem e Turso

Esta área é opcional. Para usar a mesma coleção de notas em outro computador, informe:

- URL do seu banco Turso/libSQL;
- token de acesso do seu Turso;
- clique em **Conectar Turso** e depois em **Sincronizar agora com a Nuvem**.

O token é armazenado no cofre de credenciais do sistema operacional, não no bundle do aplicativo. Em um computador novo, informe a mesma URL e token e execute a primeira sincronização para baixar as notas no SQLite local.

Leia [API e sincronização](api-and-sync.md) e, principalmente, [Segurança](security.md) antes de ativar este fluxo.

## Solução rápida de problemas

| Sintoma | Ação inicial |
| --- | --- |
| O app não abre no Windows | Execute `wails doctor` para desenvolvimento; para release, confirme WebView2. |
| As notas parecem ter sumido | Consulte o caminho do banco em Preferências > Armazenamento antes de criar um novo banco. |
| Sincronização falha | Verifique o endereço da API, a conectividade e o log do servidor; o uso offline não é afetado. |
| Exportação não inicia download no navegador | Em prévia local, confirme que o navegador permite downloads para arquivos locais. |
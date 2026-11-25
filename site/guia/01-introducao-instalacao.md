# Primeiros Passos & Instalação

Bem-vindo ao **Magnetares Notes**! Este guia foi elaborado para acompanhar você desde o download inicial até o domínio dos recursos mais avançados de anotações, estudo ativo e pesquisa acadêmica.

---

## 1. O que é o Magnetares Notes?

O **Magnetares Notes** é um aplicativo desktop projetado sob o paradigma **Local-First**. Diferente da maioria dos aplicativos contemporâneos que dependem de conexão constante à internet ou servidores proprietários para abrir suas notas, o Magnetares prioriza a **soberania e velocidade dos seus dados**:

- **100% Offline por padrão:** Tudo o que você escreve é gravado instantaneamente no seu computador em um banco de dados **SQLite** com *Write-Ahead Logging* (WAL).
- **Sem login obrigatório:** Você baixa, abre e começa a redigir na mesma hora.
- **Nuvem Opcional e Segura:** Se desejar sincronizar suas anotações com outros computadores, pode conectar seu próprio banco remoto via **Turso (libSQL)** sem abrir mão da cópia local.
- **Suíte Técnica & Corporativa Completa:** Editor de texto rico com **Galeria de 26 Templates prontos em 10 áreas** (+ *Meus Templates*), tabelas, equações matemáticas (LaTeX/KaTeX), reações químicas (`mhchem`), diagramas (Mermaid.js), **Minhas Conexões** com grafo interativo e links `[[Nota]]`, **Fluxo de Ideias**, notas de código com motor do VS Code (Monaco Editor), listas de tarefas e mural de post-its visuais.

---

## 2. Requisitos de Sistema

O Magnetares Notes é extremamente leve e consome uma fração da memória de suítes de escritório convencionais:

| Plataforma | Requisitos Mínimos | Formatos Disponíveis |
| :--- | :--- | :--- |
| **Windows** | Windows 10 (64-bit) ou superior, com runtime WebView2 (nativo no Windows 10/11) | Instalador (`Setup .exe`), Corporativo (`.msi`), Executável Direto (`.exe`) e Portátil (`.zip`) |
| **Linux** | Distribuições modernas de 64-bit (Ubuntu, Fedora, Debian, Arch, Mint com glibc 2.31+) | AppImage universal, Pacote Debian (`.deb`) e Tarball (`.tar.gz`) |
| **macOS** | macOS 12 Monterey ou superior (Apple Silicon M1/M2/M3/M4 e Intel) | Binário Universal (`.zip`) |

---

## 3. Como Instalar no seu Computador

### Windows
1. Acesse a seção de downloads no site ou as [Releases no GitHub](https://github.com/vitorkrewer/magnetares-notes/releases).
2. Escolha entre o **Instalador Windows (`Setup .exe`)**, o **Instalador Corporativo (`.msi`)**, o **Executável Direto (`.exe`)** ou a **Versão Portátil (`.zip`)**.
3. Com o instalador `Setup .exe` ou `.msi`, atalhos no Menu Iniciar e desinstalador padrão do Windows são configurados automaticamente. No executável direto, basta dar duplo clique para iniciar. O banco de dados e preferências ficam isolados na pasta do seu usuário em `%LOCALAPPDATA%\Magnetares Notes\`.

> [!NOTE]
> Se o Windows Defender exibir a mensagem de tela azul *"O Windows protegeu o seu computador"*, clique em **Mais informações** e em seguida em **Executar assim mesmo**. Isso ocorre porque o executável é open-source e compilado diretamente via GitHub Actions.

### Linux
O Magnetares oferece três opções convenientes para Linux:
- **AppImage (Recomendado):** Baixe o arquivo `Magnetares-Notes-Linux-x64.AppImage`, conceda permissão de execução com `chmod +x Magnetares-Notes-Linux-x64.AppImage` e execute-o com duplo clique.
- **Pacote Debian (.deb):** No Ubuntu/Debian/Mint, instale com `sudo dpkg -i Magnetares-Notes-Linux-x64.deb` ou pelo instalador gráfico da sua distribuição.
- **Tarball (.tar.gz):** Extraia o arquivo em qualquer diretório desejado (`/opt` ou na sua `home`) e execute o binário nativo.

### macOS
1. Baixe o pacote `Magnetares-Notes-macOS-universal.zip`.
2. Dê duplo clique no arquivo compactado para extrair o aplicativo `Magnetares Notes.app`.
3. Arraste o aplicativo para a pasta **Aplicativos** (`/Applications`).
4. Na primeira abertura, caso o macOS alerte sobre desenvolvedor não verificado, abra **Preferências do Sistema > Privacidade e Segurança** e clique em **Abrir Mesmo Assim**.

---

## 4. A Versão Portable Multiverse (Universal para Pendrive)

Uma das maiores inovações da **versão 1.9.0** é o pacote **Portable Multiverse**:

![Configurações e armazenamento local no Magnetares Notes](assets/screenshots/settings.png)

Frequentemente estudantes e pesquisadores precisam circular entre máquinas com sistemas operacionais distintos — por exemplo, usar Windows no notebook pessoal, Linux nos computadores do laboratório da faculdade e macOS no trabalho.

O **Magnetares Multiverse** é um único pacote portátil compactado que reúne os executáveis de Windows, Linux e macOS compartilhando **uma única pasta `./data/magnetares.db`**:

1. Descompacte o pacote na raiz de um **pendrive ou unidade USB externa**.
2. Ao plugar o pendrive em qualquer máquina Windows, execute o `.exe`.
3. Ao plugar em uma máquina Linux, execute o `.AppImage`.
4. Ao plugar em um Mac, abra o `.app`.
5. Todas as alterações, notas, checklists e stickers são gravados **diretamente no mesmo arquivo de banco no pendrive**.
6. No Windows, o cache do motor web é redirecionado para `./data/webview`, garantindo **zero rastros ou resíduos deixados no computador hospedeiro**.

---

## 5. Estrutura de Armazenamento Local

O banco de dados SQLite local é salvo nos seguintes diretórios padrão de acordo com o sistema operacional:

- **Windows:** `%LOCALAPPDATA%\Magnetares Notes\magnetares.db`
- **Linux:** `~/.config/Magnetares Notes/magnetares.db`
- **macOS:** `~/Library/Application Support/Magnetares Notes/magnetares.db`
- **Versão Portátil:** `<pasta_do_aplicativo>/data/magnetares.db`

Você pode verificar ou alterar o caminho do seu banco a qualquer momento clicando no ícone de engrenagem no rodapé da barra lateral (**Preferências > Armazenamento**).

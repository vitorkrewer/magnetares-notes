# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

## [v1.7.0] - 2026-10-08

### Added

- **Live Preview & Modo Apresentação de Protótipos:** Novo visualizador pop-up interativo para Notas de Código de tecnologias web (`HTML`, `XML`/`SVG`) e documentos formatados (`Markdown`). Permite testar, interagir e apresentar protótipos de interfaces ao vivo durante reuniões de equipe.
- **Simulador de Resoluções Responsivas (Viewport Switcher):** O modal de apresentação conta com alternância rápida entre três modos de tela:
  - 🖥️ **Desktop:** Largura integral (100%).
  - 📱 **Tablet:** Largura simulada de 768px com moldura e profundidade visual.
  - 📱 **Mobile:** Largura de 375px para validação de layouts verticais e responsividade para dispositivos móveis.
- **Modo Tela Cheia Imersivo (Presentation Mode):** Botão para expandir o protótipo para 100% da tela (100vw x 100vh) sem barras de ferramentas ou menus da biblioteca, ideal para compartilhamento de tela e demonstrações.
- **Ambiente de Execução Seguro (Sandboxed):** Protótipos HTML rodam de forma segura dentro de um `iframe` com atributo `sandbox` rigoroso, permitindo scripts de interação e botões sem expor o sistema local ou os dados internos do aplicativo.
- **Renderizador de Markdown Rico:** Notas de código em Markdown agora contam com pré-visualização completa estilizada de acordo com o design system do Magnetares (tabelas, citações, blocos de código com destaque, checklists e tipografia proporcional).
- **Controles Rápidos no Preview:** Botão de recarregamento rápido (*hot reload*), botão para abrir em nova janela do navegador e atalho rápido no teclado (`Esc`) para fechar.
- **Ícone Nativo para Texto Simples:** A linguagem *Texto simples* (`plaintext`) agora possui o ícone `FileText` dedicado no seletor de linguagem e na lista de sugestões.

## [v1.6.0] - 2026-10-08

### Added

- **Formatação Avançada de Texto:** O editor *Rich Text* (Tiptap) ganhou suporte para Alinhamento de texto (Esquerda, Centro, Direita e Justificado).
- **Cores Customizadas:** Inserida ferramenta de coloração de texto com um menu flutuante elegante que inclui 20 cores predefinidas e modo de limpeza (Automático), removendo o antigo seletor nativo.
- **Espaçamento entre Linhas:** Inserido menu *dropdown* flutuante para alterar o espaçamento entre as linhas do texto (Simples, 1.15, 1.5 e Duplo).
- **Controle de Janela Dinâmico:** Botões de controle de janela no Windows (Minimizar, Maximizar e Fechar) foram movidos e reorganizados para a extremidade direita da `TitleBar`, alinhando-se ao comportamento padrão do sistema operacional.
- **Interface Otimizada:** O ícone de configurações foi transferido do rodapé (footer) para a barra superior de ferramentas na biblioteca (Sidebar).
- **Seção Colapsável:** A seção de Etiquetas da barra lateral agora permite contrair e expandir (com animação fluida) para economizar espaço de visualização quando existem muitas tags.
- **Sugestões de Etiquetas Inteligentes:** Ao adicionar uma etiqueta na nota, um elegante menu suspenso surge com sugestões enquanto você digita, baseando-se nas etiquetas que você já possui. Exibe os ícones coloridos, filtra as tags que a nota já contém, permite a navegação e a criação instantânea de novas caso não existam.
- **Modo Portátil Nativo (Pendrive Ready):** Suporte automático à execução portátil. Quando o aplicativo detecta a pasta `data/` ou o marcador `portable.dat` junto do seu executável, todas as configurações e o banco SQLite passam a ser salvos de maneira 100% isolada e autocontida no próprio dispositivo móvel/pendrive.
- **Licenciamento Source-Available (Não-Comercial):** Atualização formal da licença do projeto para uso pessoal e código de fonte disponível, assegurando a privacidade e transparência do código sem permitir uso comercial ou modificações sem aviso prévio.

### Changed

- Reorganização na barra de formatação (Toolbar): Os botões de Desfazer e Refazer foram reposicionados à esquerda do editor para facilitar o alcance e evitar grandes espaçamentos na versão contraída da janela.
- Resolução visual no dropdown de Linguagens das Notas de Código para evitar corte (clipping) do conteúdo pelo z-index conflitante do editor Monaco.

### Fixed

- **Exclusão Definitiva Segura (Tombstones):** Aprimorada a integridade de exclusões durante a sincronização em nuvem. Notas e etiquetas apagadas de vez ou movidas para a lixeira agora persistem seu status "apagado" de forma robusta e não renascem mais indevidamente de outras máquinas por sincronizações ativas. Além disso, as notas deletadas só são fisicamente apagadas após a nuvem confirmar o soft-delete, ocultando-se imediatamente da lixeira de forma transparente.
- **Legibilidade na Lixeira (Tema Escuro):** Resolvido o problema onde o conteúdo do editor se tornava invisível no tema escuro ao visualizar uma nota que estava na lixeira (somente-leitura). A estilização agora usa opacidade adaptativa ao invés de cor fixa, restaurando a leitura.

## [v1.5.0] - 2026-10-07

- **Nova funcionalidade Code Snippets:** Suporte nativo e de primeira classe para notas de código, transformando o Magnetares Notes em um poderoso repositório para desenvolvedores (Gist-like).
- **Tipos de Notas Integrados:** Qualquer pasta agora pode conter anotações ricas (texto/Tiptap) ou snippets de código, garantindo que documentações de projeto e scripts convivam de forma harmônica na mesma árvore de pastas.
- **Integração com Monaco Editor:** O motor que alimenta o VS Code foi incorporado para Notas de Código, oferecendo numeração de linhas nativa, *code folding*, auto-fechamento de chaves, *syntax highlighting* perfeito e suporte avançado.
- **Seletor de Linguagens & Color Badges:** O cabeçalho das notas agora exibe um dropdown para a escolha entre dezenas de linguagens (Python, JS, Go, HTML, CSS, Bash, SQL, C++, etc). Na barra lateral da biblioteca, uma mini-etiqueta colorida (Color Badge) exibe o logotipo real da linguagem (graças à injeção da biblioteca Devicons), facilitando a localização visual dos arquivos.
- **Botão Inteligente "Copiar Código":** Inserido diretamente no novo *toolbar* do editor, permitindo copiar o script completo para a área de transferência em um clique com feedback visual animado.
- **Criação Rápida de Código:** A interface de navegação recebeu um ícone dedicado (<>) para criar Notas de Código diretamente na pasta ativa com um clique, sem precisar criar uma nota de texto primeiro e convertê-la.
- **Exportação Nativa:** O mecanismo de exportação entende a linguagem do seu snippet e exporta automaticamente com a extensão técnica correta (ex: salvar em arquivo `.py`, `.js`, `.sh`, `.go`).

### Changed

- A estrutura do banco SQLite (através da migração `0011_code_notes.sql`) foi expandida sem impacto de performance, acrescentando colunas dedicadas `note_type` e `language` nas anotações já existentes.

## [v1.4.0] - 2026-10-06

### Added

- **Nova funcionalidade Stickers:** mural de notas autoadesivas (post-its) organizado por quadros (*views*), posicionado na barra lateral logo acima de Etiquetas e abaixo de Pastas.
- **Quadros de Stickers (Boards):** CRUD completo para gerenciar múltiplos quadros (criar, editar nome e tema, excluir quadros customizados), com quadro padrão "Geral" protegido contra exclusão e contador dinâmico de stickers.
- **Mural Full-Width:** layout responsivo que aproveita 100% da área útil da janela (em vez de ficar restrito a uma coluna de lista estreita), distribuindo as notas adesivas em múltiplas colunas automáticas (`minmax(280px, 1fr)`).
- **CRUD e Edição Inline de Stickers:** notas de texto simples com título (até 120 caracteres) e corpo (até 5.000 caracteres), criação rápida por botão ou atalho e salvamento automático contínuo com debounce de 400ms e flush imediato no blur.
- **Fixação no topo (Pin):** destaque visual dourado e prioridade de ordenação no banco SQLite para notas adesivas fixadas.
- **Paleta de 8 cores pastel:** amarelo, laranja, rosa, roxo, azul, turquesa, verde e cinza neutro, com contraste calibrado e suporte automático a temas claro e escuro.
- **Movimentação fluida (Drag & Drop):** reordenação de cards no mural com posicionamento fracionário no SQLite, capacidade de soltar na área livre do canvas para enviar ao fim do quadro, e arraste de notas diretamente sobre outros quadros na barra lateral para transferência imediata entre quadros.
- **Ícones delicados na barra lateral:** componente `DelicateStickerIcon` desenhado com proporção elegante de 14px e traço fino de 1.6px, perfeitamente integrado à hierarquia visual de pastas e etiquetas.
- **Auditoria de Compliance de Stickers:** rotina `ensureStickerCompliance` que garante integridade do quadro padrão, normalização de cores e reparenting automático de stickers órfãos.
- **Migração de banco `0010_stickers.sql`:** tabelas `sticker_boards` e `stickers` criadas com suporte nativo a soft-delete e colunas preparadas para futura sincronização na nuvem (`updated_at`, `deleted_at`, `sync_state`).

### Tests

- `TestStickerBoardsAndStickersCRUD` cobrindo o ciclo de vida completo de quadros (criação, edição, unicidade de nomes, proteção do quadro padrão) e stickers (criação, reordenação por ponto médio, fixação, soft-delete em cascata e reparenting).

## [v1.3.0] - 2026-10-06

### Added

- **Página de Recursos:** página separada com roteamento no site, baseada na documentação do produto.
- **Exportação com diálogo nativo:** ao exportar notas (Markdown, HTML, TXT), o sistema abre a caixa de diálogo para escolher o local de salvamento, em vez de gravar direto em Downloads.
- **Pacotes Linux (.AppImage e .deb):** workflow de release atualizado para empacotar e publicar `Magnetares-Notes-Linux-x64.AppImage` (universal) e `Magnetares-Notes-Linux-x64.deb` (Debian/Ubuntu/Mint/Pop!_OS), além do `.tar.gz` portátil.
- **Seletor de formatos de download no site:** landing page e páginas institucionais com seletor interativo de pacotes Linux e deploy automatizado no GitHub Pages ao concluir releases.
- **Indicador de Nuvem animado:** ícone de nuvem na barra lateral exibe o estado da nuvem ativa, anima durante a sincronização e informa o tempo até a próxima sincronização automática. A interface passa a usar apenas "Nuvem", sem citar o provedor. Hoje a sincronização é suportada via Turso; em breve, mais opções de nuvem.
- **Botão "voltar ao topo":** atalho exibido ao rolar listas e conteúdo para baixo.
- **Sincronização de etiquetas e ícones:** catálogo de etiquetas (nome e ícone) sincronizado entre computadores, com pull LWW.

### Improved

- **Árvore de pastas:** recuo excessivo removido; pastas raiz alinhadas como as etiquetas e subpastas com indentação progressiva correta.
- **Salvamento antes do sync:** a sincronização agora aguarda também as gravações em andamento (`saveQueues`), não apenas timers e pendências.
- **Renomear/excluir etiqueta:** notas vinculadas são marcadas como pendentes para que a nova lista de etiquetas seja enviada à nuvem; a lista de notas é recarregada na interface.
- **Last-Write-Wins em etiquetas e pastas:** o pull remoto não sobrescreve mais registros locais com `updated_at` igual ou mais recente, mesmo já marcados como `clean` após o push.

### Fixed

- Sincronização automática (ex.: a cada 5 minutos) baixava a versão antiga da nuvem após renomear etiqueta, renomear nota e alterar conteúdo, exigindo sincronização manual prévia.
- Reversão do nome de etiqueta pelo estado desatualizado do editor ao editar a nota logo após renomear a etiqueta.
- Sobrescrita de notas locais limpas por snapshots remotos mais antigos em `applyRemoteNote`.

### Tests

- `TestTagRenameAndNoteEditPropagateDuringSync` cobrindo renomear etiqueta, renomear nota, editar conteúdo e sincronizar.

## [v1.2.0] - 2026-09-28

### Added

- **Editor Tiptap ampliado:** hyperlinks, blocos de código com syntax highlighting e seletor de linguagem para texto simples, JavaScript, TypeScript, Go, Python, JSON, HTML, CSS e Markdown.
- **Tabelas:** exclusão de linhas e colunas, além da exclusão da tabela inteira.
- **CRUD de etiquetas:** criação, edição, exclusão, contagem por nota e seis ícones personalizáveis.
- **Sincronização automática:** frequência configurável de 5, 15, 30 ou 60 minutos, com opção de desativar.
- **Resolução visual de conflitos:** versão local, versão da nuvem ou mesclagem das duas versões em uma única nota.
- **Laboratório de integração:** simulação documentada de cinco computadores em `tests/`, usando a API real e um Turso fake local.

### Improved

- **Integridade de sincronização:** transações remotas, precondição de revisão, `mutationId` idempotente e snapshots históricos por cursor.
- **Convergência por conteúdo:** revisões diferentes com conteúdo semanticamente igual não abrem conflito nem duplicam a nota.
- **Autosave:** sincronização aguarda filas e timers locais; o editor é remontado ao trocar de nota para impedir vazamento de conteúdo.
- **Pastas via API:** tombstones e ordenação por `updated_at` respeitam Last-Write-Wins.
- **Recuperação:** snapshots remotos permitem restaurar uma nota corrompida com backup local antes da nova revisão.

### Fixed

- Sobrescrita silenciosa de notas locais em conflito.
- Aplicação de revisões remotas antigas.
- Perda de conteúdo causada pela reutilização do editor entre notas.
- Remoção indevida de etiquetas criadas manualmente sem notas associadas.

### Tests

- Suíte Go cobrindo conflitos, snapshots, mesclagem, revisões antigas e CRUD de etiquetas.
- `tests/TestFiveComputersConcurrentEdits` cobrindo uma aceitação, quatro conflitos, retry idempotente e resolução posterior.

## [v1.1.0] - 2026-09-25

### Added

- **Personalização de Pastas (Cores e Ícones):**
  - Modal de criação de pasta com seletor interativo de 8 cores (paletas Tailwind/HSL) e 8 ícones (Pasta, Projeto, Estudo, Código, Trabalho, Pessoal, Estrela, Arquivo).
  - Modal de edição de pasta para alterar nome, cor e ícone de qualquer pasta existente (incluindo pastas legadas).
  - Suporte completo no backend SQLite e sincronização com Turso para os metadados de cor e ícone.

- **Motor de Compliance e Integridade Local (`compliance.go`):**
  - Ferramenta de auditoria e autorreparo de banco de dados no menu de Preferências.
  - Limpeza automática de registros falsos em `note_conflicts` provenientes de migrações ou revisões inconsistentes (`server_revision = 0`).
  - Recálculo de contagem de checklists e reparo de timestamps inválidos.
  - Relatório visual de integridade com detalhes de todas as correções aplicadas.

### Improved

- **UX na Barra Lateral & Etiquetas Longas:**
  - Correção de layout CSS na lista de etiquetas da barra lateral, evitando que hashtags `#` sejam ocultadas ou cortadas em nomes de etiquetas extensos.

- **Exclusão Segura de Notas:**
  - Alerta de confirmação ao excluir notas com aviso transparente de que as notas serão movidas para a pasta padrão (*Default*) e enviadas para a Lixeira local.

### Fixed

- **Sincronização na Nuvem Turso/libSQL:**
  - Correção da regra de resolução de conflitos na sincronização incremental quando a nota não existe no servidor remoto (`found = false`). Notas locais com `server_revision > 0` são enviadas diretamente em vez de gerar conflito falso com payload vazio.
  - Inserções diretas de notas sem histórico no Turso agora mantêm o banco local 100% em sincronia (`sync_state = 'clean'`).

- **Qualidade de Código Go:**
  - Adicionadas verificações rigorosas de `rows.Err()` e liberação explícita de recursos (`defer rows.Close()`) em todas as iterações de banco em `compliance.go` e `sync.go`.

## [v1.0.0] - 2026-09-24

### Added

- **Interface macOS & Responsividade:**
  - Barra de título nativa com botões "Traffic Lights" estilo macOS (Fechar, Minimizar, Maximizar/Restaurar).
  - Suporte a arrastar janela (`--wails-draggable: drag`).
  - Layout de 3 painéis com editor responsivo sem margens excessivas ao ocultar a barra lateral.
  - Barra de rolagem discreta e fina à direita extrema no estilo macOS.
  - Tema Claro, Tema Escuro (Dark Mode) e detecção de tema do Sistema com atalho nas Preferências.

- **Armazenamento Local & Primeira Execução:**
  - Banco de dados SQLite local de alta performance com journal WAL ativado em `%LOCALAPPDATA%\Magnetares Notes\magnetares.db` (Windows) e `~/.config/Magnetares Notes/magnetares.db` (Linux/macOS).
  - Migrações de esquema incrementais e automáticas no diretório de dados locais.
  - Suporte a escolha/visualização do caminho do banco de dados local nas Preferências na primeira execução.

- **Editor Rich Text & Ferramentas:**
  - Editor estruturado com Tiptap (Títulos, Subtítulos, Corpo, Negrito, Itálico, Destaque Amarelo, Citações).
  - Checklists interativas com progresso/contagem de itens concluídos.
  - Tabelas redimensionáveis N×M com controles contextuais para adicionar/remover linhas e colunas.
  - Avaliador matemático inline (`mathjs`) seguro para cálculo de expressões diretamente na nota.

- **Organização & Pastas Inteligentes:**
  - Pastas e subpastas hierárquicas com proteção contra ciclos e exclusão restrita de pastas com conteúdo.
  - Fixação de notas (`pinnedAt`) no topo da lista.
  - Etiquetas (`#trabalho`, `#ideias`) com chips no editor e busca dedicada.
  - Pastas Inteligentes por regras automáticas: etiqueta, período de data (hoje, 7 dias, 30 dias) e estado do checklist.
  - Lixeira de notas apagadas recentemente com restauração e visualização em modo somente leitura.

- **Importação, Exportação e Impressão:**
  - Exportação de notas para Markdown (`.md`), HTML (`.html`) e Texto Puro (`.txt`).
  - Importação de arquivos `.md` e `.txt` do computador diretamente para o banco SQLite.
  - Impressão nativa (`window.print()`) com estilos `@media print` otimizados (sem barras de ferramentas/painéis).

- **Sincronização na Nuvem (Turso / libSQL):**
  - Integração com API Go (`apps/api`) conectada à nuvem Turso/libSQL via HTTP pipeline.
  - Sincronização incremental beta de notas e exclusões com outbox local, cursor remoto, revisão e detecção de conflito.
  - Preferências offline-first: URL e token do Turso opcionais, token salvo no cofre do sistema e primeiro sync para popular novos computadores.

- **Automação de CI & Release:**
  - Workflow do GitHub Actions (`release.yml`) para compilação multiplataforma automatizada (Windows `.exe`, Linux `AppImage/binary`, macOS `.app.zip`).

# Changelog

Todas as mudanças relevantes deste projeto serão documentadas aqui.

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

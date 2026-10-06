# Matriz de funcionalidades e roadmap

Este documento é a referência de status do produto. Ele evita que a documentação ou a landing page tratem recursos planejados como entregues.

## Recursos inspirados no Notes

| Recurso | Status | Observação |
| --- | --- | --- |
| Criar notas normais | Implementado | Criação, edição, autosave e persistência SQLite local. |
| Notas rápidas globais | Planejado | Falta atalho global, tray e janela flutuante. |
| Títulos e subtítulos | Implementado | Nós estruturados Tiptap. |
| Negrito, itálico, destaque e hyperlinks | Implementado | Toolbar do editor com inserção, edição e remoção de links. |
| Blocos de código | Implementado | Lowlight com seleção de linguagem e syntax highlighting. |
| Listas e citações | Implementado | Listas com marcador/numeradas e blockquote. |
| Checklists | Implementado | Estado visual, contagem de itens e regras inteligentes. |
| Tabelas | Implementado | Inserção, redimensionamento, exclusão de linhas/colunas e tabela inteira. |
| Cálculos | Implementado | Nó inline com expressão e resultado; parser restringe identificadores. |
| Pastas e subpastas | Implementado | Criação e edição completa de pastas e subpastas com cores HSL e 8 ícones personalizáveis, suporte a pastas legadas. |
| Notas fixadas | Implementado | Pin e ordenação no topo. |
| Etiquetas | Implementado | CRUD, ícones, chips, associação persistida e layout responsivo para tags extensas. |
| Pastas Inteligentes | Implementado | Tag, período e checklist com atualização automática. |
| Busca por texto local | Implementado | Título e `body_text`; não usa FTS/OCR. |
| Lixeira e restauração | Implementado | Exclusão lógica com confirmação e redirecionamento seguro para a pasta padrão. |
| Importar Markdown/texto | Implementado | `.md`, `.markdown` e `.txt`. |
| Exportar Markdown/HTML/texto | Implementado | Exportação pelo editor com diálogo nativo de salvamento (v1.3.0). |
| Impressão/PDF | Implementado | `window.print()` e CSS de impressão. |
| Compliance & Autocura | Implementado | Diagnóstico `EnsureDataCompliance`, reparo de checklists, limpeza de conflitos orfãos e normalização no SQLite. |
| Backup Turso e Sync | Implementado | Sync bidirecional de notas/pastas, snapshots, transações, sync automático, conflitos local/remoto/merge e convergência por conteúdo. |
| Anexos e PDFs | Planejado | Sem modelo de blob, visualizador ou armazenamento de arquivo. |
| Desenho/anotação | Planejado | Depende de canvas e anexos. |
| OCR e busca em imagens/PDF | Planejado | Depende de pipeline de extração e indexação. |
| Bloqueio de notas | Planejado | Sem criptografia de banco ou bloqueio individual. |
| Colaboração e menções | Planejado | Depende de autenticação e sync bidirecional/CRDT. |
| Widgets | Planejado | Requer integração específica de plataforma. |

## Roadmap técnico sugerido

### Fase 1: robustez local

- Assistente de mover/copy de banco em Preferências.
- UI completa de pastas: mover nota, renomear, remover e criar subpastas a partir da árvore.
- Busca local FTS5 sobre `body_text`.
- Testes E2E de interface e importação/exportação.

### Fase 2: sincronização correta

- **Entregue na v1.2.0:** revisão-base, `409 Conflict`, cursor, snapshots por evento, exclusões, transações remotas, idempotência e resolução local/remota/merge.
- **Entregue na v1.2.0:** laboratório de cinco computadores para concorrência e retry.
- **Entregue na v1.3.0:** sync de etiquetas e ícones, LWW em etiquetas/pastas, flush completo de gravações antes do sync e propagação de renomeação de etiquetas às notas.
- Contrato OpenAPI ainda precisa ser alinhado a todos os campos atuais de metadata e snapshots.
- Autenticação de usuário contra API própria.
- Tokens Turso exclusivos do ambiente da API.

### Fase 3: segurança e distribuição

- Cifra opcional do banco local.
- Assinatura de Windows e notarização de macOS.
- Política de backup e recuperação testada.
- Telemetria somente se houver consentimento explícito e documentação de privacidade.

### Fase 4: mídia e colaboração

- Anexos locais e sincronizados.
- PDF, desenhos e OCR.
- Compartilhamento, presença e colaboração.
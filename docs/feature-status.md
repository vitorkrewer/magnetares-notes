# Matriz de funcionalidades e roadmap

Este documento é a referência de status do produto. Ele evita que a documentação ou a landing page tratem recursos planejados como entregues.

## Recursos inspirados no Notes

| Recurso | Status | Observação |
| --- | --- | --- |
| Criar notas normais | Implementado | Criação, edição, autosave e persistência SQLite local. |
| Notas rápidas globais | Planejado | Falta atalho global, tray e janela flutuante. |
| Títulos e subtítulos | Implementado | Nós estruturados Tiptap. |
| Negrito, itálico e destaque | Implementado | Toolbar do editor. |
| Listas e citações | Implementado | Listas com marcador/numeradas e blockquote. |
| Checklists | Implementado | Estado visual, contagem de itens e regras inteligentes. |
| Tabelas | Implementado | Inserção, redimensionamento e controles contextuais. |
| Cálculos | Implementado | Nó inline com expressão e resultado; parser restringe identificadores. |
| Pastas e subpastas | Implementado no backend | Bridge e banco suportam hierarquia; a interface ainda é incremental para ações de mover, renomear e excluir. |
| Notas fixadas | Implementado | Pin e ordenação no topo. |
| Etiquetas | Implementado | Chips e associação persistida. |
| Pastas Inteligentes | Implementado no backend | Tag, período e checklist; a interface ainda evolui para todos os fluxos de gerenciamento. |
| Busca por texto local | Implementado | Título e `body_text`; não usa FTS/OCR. |
| Lixeira e restauração | Implementado | Exclusão lógica e modo somente leitura. |
| Importar Markdown/texto | Implementado | `.md`, `.markdown` e `.txt`. |
| Exportar Markdown/HTML/texto | Implementado | Exportação local pelo editor. |
| Impressão/PDF | Implementado | `window.print()` e CSS de impressão. |
| Backup Turso | Parcial/beta | Envio de notas para API; não há pull, cursor ou conflitos. |
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

- Contrato OpenAPI alinhado à implementação.
- Autenticação de usuário contra API própria.
- Tokens Turso exclusivos do ambiente da API.
- Cursor, pull de alterações, exclusões e metadata organizacional.
- Controle de revisão e `409 Conflict`.

### Fase 3: segurança e distribuição

- Cifra opcional do banco local.
- Assinatura de Windows e notarização de macOS.
- Política de backup e recuperação testada.
- Telemetria somente se houver consentimento explícito e documentação de privacidade.

### Fase 4: mídia e colaboração

- Anexos locais e sincronizados.
- PDF, desenhos e OCR.
- Compartilhamento, presença e colaboração.
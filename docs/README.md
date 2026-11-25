# Documentação do Magnetares Notes

Este diretório descreve o Magnetares Notes como produto, aplicativo desktop e código-fonte. A documentação separa funcionalidades **implementadas** de recursos planejados, para que instalação, operação e contribuições sejam previsíveis.

## Comece por aqui

| Documento | Quando ler |
| --- | --- |
| [Guia inicial](getting-started.md) | Instalação, primeira execução e requisitos por plataforma. |
| [Guia do usuário](user-guide.md) | Criar, editar, organizar, importar, exportar e imprimir notas. |
| [Arquitetura](architecture.md) | Como React, Wails, SQLite, API e Turso se relacionam. |
| [Dados locais](local-data.md) | Caminho do banco, migrações, backup, restauração e troca de local. |
| [Desenvolvimento](development.md) | Ambiente local, comandos, tarefas e convenções do repositório. |
| [API e sincronização](api-and-sync.md) | Endpoints atuais, protocolo de sync, contrato e limitações. |
| [Segurança](security.md) | Modelo de ameaças, segredos, Turso, CORS e ações obrigatórias antes de produção. |
| [Testes](testing.md) | O que é validado hoje e lacunas de cobertura. |
| [Release e deploy](release-and-deployment.md) | Tags, GitHub Actions, artefatos, Pages e checklist de publicação. |
| [Site](site.md) | Landing page estática e configuração dos links de download. |
| [Matriz de funcionalidades](feature-status.md) | Status real de recursos e roadmap técnico. |

## Estado do produto

### Implementado no desktop local

- Notas locais persistentes em SQLite com autosave, lixeira, restauração e **Modo Foco** em janela independente.
- Editor rico TipTap: títulos, fórmulas matemáticas e químicas (LaTeX com KaTeX + `mhchem` offline), destaques acadêmicos (*Callouts*), blocos expansíveis (*Toggles*), diagramas **Mermaid.js**, negrito, itálico, destaque, alinhamento, cores, listas, citações, checklists, tabelas, cálculos e **vínculos inline `[[Nota]]`**.
- **Galeria de Templates de Notas (v2.1.0):** 26 modelos prontos em 10 áreas do conhecimento (corporativo, produto/PO, briefings, saúde/SOAP, engenharia/laboratório, jurídico/negócios, educação, criativo/UX, acadêmico ABNT e diário pessoal) exclusivos para notas estruturadas, em modal de 3 colunas com pré-visualização ao vivo, aplicação segura e criação de **Meus Templates** persistidos em SQLite (`note_templates`).
- **Conexões (v2.1.0):** mapa de grafos interativo (**CONEXÕES → Minhas Conexões**), vínculos bidirecionais `[[Nota]]`, painel lateral de vínculos & etiquetas, backlinks automáticos e abertura em modal de editor completo em janela separada.
- **Fluxo de Ideias (v2.0.0):** canvas vetorial interativo de mapas mentais e fluxogramas, hub Cards/Lista, zoom de precisão (15%–350%), referências cruzadas com hyperlink direto e exportação PNG 2.5x.
- **Stickers (v1.4.0):** mural full-width de notas autoadesivas por quadros, 8 cores pastel, fixação no topo e drag & drop.
- **Listas & Tarefas (v1.8.0):** módulo completo de produtividade pessoal com 4 níveis hierárquicos (Listas ➔ Tarefas ➔ Subtarefas ➔ Múltiplas Notas), prioridades visuais semânticas (🔥, ⚠️, ⬇️, ➖), arquivamento de listas com modo consulta e sincronização em nuvem Turso com LWW.
- Pastas, subpastas, fixadas, etiquetas e Pastas Inteligentes.
- Importação de Markdown/texto, exportação Markdown/HTML/texto/PDF nativo e **Artigo ABNT (`.docx`)** com diálogo nativo e impressão `@media print`.
- Tema claro/escuro, barra de título sem moldura, assistente seguro de troca de local do banco de dados, notificação de atualizações e aba **Sobre**.
- Sincronização em nuvem opcional com detecção de conflitos, resolução local/remoto/merge e sync de notas, pastas, etiquetas, stickers, tarefas e fluxos de ideias.

### Implementado com limitações

- Sincronização: bidirecional (notas, pastas, etiquetas, stickers e lápides) e particionada por perfil; ainda é beta, sem autenticação de usuário, e Pastas Inteligentes continuam locais.
- Releases: há workflows multiplataforma; eles precisam ser exercitados em tags reais antes de serem considerados pipeline de produção.

### Ainda não implementado

- Notas rápidas globais, anexos, desenho, anotação de PDF, OCR e busca em imagens/PDF.
- Bloqueio de notas, autenticação de usuários, colaboração, menções e widgets nativos.
- Sincronização bidirecional confiável e contas de usuário.

## Regras importantes

1. O banco local é a fonte de verdade durante o uso normal.
2. O frontend não deve acessar Turso diretamente.
3. Tokens, bancos locais e arquivos `.env` nunca devem entrar em commits, logs, screenshots ou releases.
4. Toda alteração de esquema precisa ser uma nova migração incremental.
5. Consulte [Segurança](security.md) antes de configurar backup em nuvem.
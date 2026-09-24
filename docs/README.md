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

- Notas locais persistentes em SQLite com autosave, lixeira e restauração.
- Editor rico: títulos, negrito, itálico, destaque, listas, citações, checklists, tabelas e cálculos.
- Pastas, subpastas, fixadas, etiquetas e Pastas Inteligentes.
- Importação de Markdown/texto, exportação Markdown/HTML/texto e impressão.
- Tema claro/escuro, barra de título sem moldura e configuração do local do banco.

### Implementado com limitações

- Sincronização: existe um envio de notas para uma API Go/Turso; ainda não há download remoto, cursor, resolução de conflitos, propagação de exclusões ou sincronização de pastas/tags.
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
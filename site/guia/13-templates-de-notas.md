# Galeria de Templates de Notas

A partir da **versão 2.1.0**, o Magnetares Notes conta com uma **Galeria de Templates** completa para notas de texto rico: são **26 modelos profissionais prontos em 10 áreas do conhecimento**, além da biblioteca pessoal **Meus Templates** salva localmente no seu banco SQLite.

> [!IMPORTANT]
> O sistema de Templates é exclusivo para **Notas Estruturadas (Texto Rico)**. Notas do tipo **Código** (`Monaco Editor`) permanecem dedicadas a scripts e protótipos técnicos, sem exibir o botão de templates.

---

## 1. Como Abrir a Galeria de Templates

Você pode acessar os modelos de duas maneiras rápidas ao trabalhar em qualquer nota rica:

1. **Pelo cabeçalho superior da nota:** clique no ícone de **Galeria de Templates** (grade de 4 blocos ao lado do indicador *Salvo*).
2. **Pela Barra Rápida em notas vazias:** sempre que você cria uma nova nota em branco, o editor exibe automaticamente sugestões de modelos frequentes (*Ata de Reunião*, *Briefing*, *PRD*, *Prontuário SOAP*, *Diário*) e o botão **Ver galeria (26)**.

![Galeria de Templates em 3 colunas com 26 modelos prontos e pré-visualização ao vivo](assets/screenshots/galeria-templates.jpg)

---

## 2. As 10 Áreas do Conhecimento (26 Modelos Nativos)

Todos os templates nativos utilizam recursos estruturados reais do motor Tiptap — incluindo **tabelas formatadas**, **callouts semânticos**, **checklists interativas**, **toggles de estudo ativo**, **fórmulas KaTeX** e **diagramas Mermaid.js**:

| Área | Modelos Disponíveis |
| :--- | :--- |
| **Corporativo & Reuniões** | *Pauta & Ata de Reunião Executiva*, *Reunião 1:1 (Liderança & Feedback)* e *Registro de Decisão (Decision Log / ADR)* |
| **Produto & PO** | *PRD — Requisitos de Produto*, *Product Discovery & Hipótese* e *Planning & Refinamento de Sprint* |
| **Briefings & Projetos** | *Briefing de Projeto / Campanha*, *Kickoff & Plano de Projeto* e *Retrospectiva & Post-Mortem* |
| **Saúde & Clínica** | *Evolução Clínica / Prontuário SOAP*, *Estudo de Caso Clínico & Diagnóstico Diferencial* e *Protocolo / Plano Terapêutico* |
| **Exatas & Engenharia** | *Memorial de Cálculo de Engenharia*, *Relatório de Experimento / Laboratório* e *Especificação Técnica & Arquitetura (RFC)* |
| **Jurídico & Negócios** | *Parecer / Análise Jurídica*, *Análise Estratégica SWOT & Plano de Ação* e *Proposta Comercial Executiva* |
| **Educação & Ensino** | *Plano de Aula & Sequência Didática* e *Resumo pelo Método Cornell & Active Recall* |
| **Criativo & Mídia** | *Roteiro Audiovisual (Duas Colunas A/V)* e *Pauta Editorial & Calendário de Conteúdo* |
| **Acadêmico & Pesquisa** | *Artigo Científico / Paper (Estrutura ABNT)* e *Fichamento de Leitura & Revisão Bibliográfica* |
| **Pessoal & Diário** | *Diário Pessoal & Reflexão do Dia* e *Planejamento Semanal & Metas* |

---

## 3. Navegação em 3 Colunas e Variáveis Dinâmicas

O modal amplo da Galeria organiza tudo em **três colunas** para facilitar a escolha:

- **Coluna esquerda:** filtro imediato por Área do Conhecimento (com contadores) e acesso à seção pessoal **Meus Templates**.
- **Coluna central:** busca instantânea por título, descrição ou etiqueta (ex.: `SOAP`, `PRD`, `laboratório`, `parecer`, `roteiro`) e cartões com selos dos recursos contidos no modelo (*Tabela*, *Callout*, *Checklist*, *Mermaid*, *KaTeX*, *Toggle*).
- **Coluna direita:** pré-visualização real e completa de como a nota ficará estruturada antes de confirmar.

> [!TIP]
> Variáveis temporais como `{{hoje}}` (ex.: `25/11/2026`) e `{{mes_ano}}` são preenchidas automaticamente com a data do seu computador no instante da aplicação.

---

## 4. Modos Seguros de Aplicação

Para proteger o que você já escreveu, a Galeria nunca sobrescreve conteúdo sem sua escolha explícita:

- **Se a nota atual estiver vazia:** clique em **Aplicar nesta nota** para preencher título sugerido, estrutura completa e (opcionalmente) as **etiquetas sugeridas** do modelo.
- **Se a nota atual já possuir conteúdo:** escolha com segurança entre:
  - **+ Inserir ao final:** preserva todo o texto atual e acrescenta a estrutura do template logo abaixo.
  - **Substituir nota:** substitui o corpo atual pelo modelo selecionado.
- **Criar Nova Nota:** disponível a qualquer momento para gerar uma nota independente na pasta atual já iniciada com o template.

![Nota de Briefing gerada a partir de template com tabela rica e indicadores de conexão](assets/screenshots/nota-template-vinculos.jpg)

---

## 5. Biblioteca Pessoal: Meus Templates

Criou uma estrutura perfeita de ata, checklist de auditoria, anamnese ou relatório que deseja reutilizar toda semana?

1. Abra a nota estruturada desejada no editor.
2. Clique no ícone da **Galeria de Templates** e, no canto superior direito do modal, clique em **+ Salvar nota como template**.
3. Defina o **nome do template**, uma breve **descrição**, o **ícone**, o **título padrão** para futuras notas e as **etiquetas sugeridas**.
4. Clique em **Salvar Template**.

Seu modelo ficará disponível permanentemente na aba **Meus Templates** (gravado localmente na tabela `note_templates` do seu SQLite, 100% offline), onde você também pode **editar metadados** ou **excluir** modelos personalizados quando quiser.

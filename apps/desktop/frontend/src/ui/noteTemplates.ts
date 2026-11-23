import type { JSONContent } from "@tiptap/react";
import type { NoteTemplateCategory, NoteTemplateRecord } from "./types";

export type TemplateCategoryMeta = {
  id: "all" | NoteTemplateCategory;
  label: string;
  shortLabel: string;
};

export const TEMPLATE_CATEGORIES: TemplateCategoryMeta[] = [
  { id: "all", label: "Todos os Templates", shortLabel: "Todos" },
  { id: "corporate", label: "Corporativo & Reuniões", shortLabel: "Reuniões" },
  { id: "product", label: "Produto & PO", shortLabel: "Produto & PO" },
  { id: "briefings", label: "Briefings & Projetos", shortLabel: "Briefings" },
  { id: "academic", label: "Acadêmico & Pesquisa", shortLabel: "Acadêmico" },
  { id: "personal", label: "Pessoal & Diário", shortLabel: "Pessoal" },
  { id: "custom", label: "Meus Templates", shortLabel: "Meus Templates" },
];

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  corporate: "Corporativo & Reuniões",
  product: "Produto & PO",
  briefings: "Briefings & Projetos",
  academic: "Acadêmico & Pesquisa",
  personal: "Pessoal & Diário",
  custom: "Meus Templates",
};

export function formatTodayBR(date = new Date()): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatMonthYearBR(date = new Date()): string {
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function interpolateTemplatePlaceholders(text: string, date = new Date()): string {
  if (!text) return "";
  return text
    .replace(/\{\{hoje\}\}/gi, formatTodayBR(date))
    .replace(/\{\{mes_ano\}\}/gi, formatMonthYearBR(date));
}

function interpolateJSONContent(node: JSONContent, date: Date): JSONContent {
  const next: JSONContent = { ...node };
  if (typeof next.text === "string") {
    next.text = interpolateTemplatePlaceholders(next.text, date);
  }
  if (next.attrs) {
    const updatedAttrs: Record<string, unknown> = { ...next.attrs };
    for (const [k, v] of Object.entries(updatedAttrs)) {
      if (typeof v === "string") {
        updatedAttrs[k] = interpolateTemplatePlaceholders(v, date);
      }
    }
    next.attrs = updatedAttrs;
  }
  if (Array.isArray(next.content)) {
    next.content = next.content.map((child) => interpolateJSONContent(child, date));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Builders TipTap JSONContent (100% compatíveis com editorExtensions.ts)
// ---------------------------------------------------------------------------

const txt = (text: string): JSONContent => ({ type: "text", text });
const bold = (text: string): JSONContent => ({ type: "text", text, marks: [{ type: "bold" }] });
const italic = (text: string): JSONContent => ({ type: "text", text, marks: [{ type: "italic" }] });
const highlight = (text: string): JSONContent => ({ type: "text", text, marks: [{ type: "highlight" }] });

const p = (...inline: (string | JSONContent)[]): JSONContent => ({
  type: "paragraph",
  content:
    inline.length === 0
      ? undefined
      : inline.map((item) => (typeof item === "string" ? txt(item) : item)),
});

const h1 = (text: string): JSONContent => ({
  type: "heading",
  attrs: { level: 1 },
  content: [txt(text)],
});

const h2 = (text: string): JSONContent => ({
  type: "heading",
  attrs: { level: 2 },
  content: [txt(text)],
});

const bulletList = (items: (string | JSONContent[])[]): JSONContent => ({
  type: "bulletList",
  content: items.map((item) => ({
    type: "listItem",
    content: [Array.isArray(item) ? p(...item) : p(item)],
  })),
});

const orderedList = (items: (string | JSONContent[])[]): JSONContent => ({
  type: "orderedList",
  content: items.map((item) => ({
    type: "listItem",
    content: [Array.isArray(item) ? p(...item) : p(item)],
  })),
});

const taskList = (items: { text: string; checked?: boolean }[]): JSONContent => ({
  type: "taskList",
  content: items.map((item) => ({
    type: "taskItem",
    attrs: { checked: Boolean(item.checked) },
    content: [p(item.text)],
  })),
});

const table = (headers: string[], rows: string[][]): JSONContent => ({
  type: "table",
  content: [
    {
      type: "tableRow",
      content: headers.map((header) => ({
        type: "tableHeader",
        content: [p(bold(header))],
      })),
    },
    ...rows.map((row) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: "tableCell",
        content: [p(cell)],
      })),
    })),
  ],
});

const callout = (
  type: "info" | "theorem" | "experiment" | "warning" | "example",
  ...content: JSONContent[]
): JSONContent => ({
  type: "callout",
  attrs: { type },
  content,
});

const toggle = (title: string, open: boolean, ...content: JSONContent[]): JSONContent => ({
  type: "toggle",
  attrs: { title, open },
  content,
});

const mermaid = (code: string, caption = ""): JSONContent => ({
  type: "mermaid",
  attrs: { code, caption },
});

const mathBlock = (latex: string): JSONContent => ({
  type: "mathBlock",
  attrs: { latex },
});

const blockquote = (...content: JSONContent[]): JSONContent => ({
  type: "blockquote",
  content,
});

const doc = (...content: JSONContent[]): string =>
  JSON.stringify({ type: "doc", content });

// ---------------------------------------------------------------------------
// Extrator de texto simples (bodyText) a partir de JSONContent TipTap
// ---------------------------------------------------------------------------

function collectPlainText(node: JSONContent, lines: string[]): void {
  if (!node) return;
  if (typeof node.text === "string") {
    lines.push(node.text);
    return;
  }
  if (node.type === "toggle" && typeof node.attrs?.title === "string" && node.attrs.title.trim()) {
    lines.push(node.attrs.title.trim());
  }
  if (node.type === "mathBlock" || node.type === "mathInline") {
    if (typeof node.attrs?.latex === "string") lines.push(node.attrs.latex);
    return;
  }
  if (node.type === "mermaid") {
    if (typeof node.attrs?.caption === "string" && node.attrs.caption) {
      lines.push(node.attrs.caption);
    }
    return;
  }
  if (Array.isArray(node.content)) {
    const isBlock = [
      "paragraph",
      "heading",
      "listItem",
      "taskItem",
      "tableRow",
      "blockquote",
      "callout",
      "toggle",
    ].includes(node.type || "");
    const before = lines.length;
    for (const child of node.content) {
      collectPlainText(child, lines);
    }
    if (isBlock && lines.length > before) {
      lines.push("\n");
    }
  }
}

export function extractPlainTextFromTipTap(content: JSONContent | string): string {
  try {
    const parsed: JSONContent =
      typeof content === "string" ? (JSON.parse(content) as JSONContent) : content;
    const chunks: string[] = [];
    collectPlainText(parsed, chunks);
    return chunks
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return typeof content === "string" ? content.trim() : "";
  }
}

export function parseTipTapDoc(body: string): JSONContent {
  if (!body.trim()) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  try {
    const parsed = JSON.parse(body) as JSONContent;
    if (parsed && parsed.type === "doc") return parsed;
  } catch {
    // Plain text fallback
  }
  return {
    type: "doc",
    content: body.split("\n").map((line) => ({
      type: "paragraph",
      content: line ? [{ type: "text", text: line }] : undefined,
    })),
  };
}

export function buildTemplateApplication(
  template: NoteTemplateRecord,
  date = new Date()
): { title: string; body: string; bodyText: string; tags: string[] } {
  const title = interpolateTemplatePlaceholders(template.defaultTitle || template.name, date);
  const parsed = parseTipTapDoc(template.body);
  const interpolated = interpolateJSONContent(parsed, date);
  const body = JSON.stringify(interpolated);
  const bodyText = extractPlainTextFromTipTap(interpolated);
  return {
    title,
    body,
    bodyText,
    tags: template.tags ?? [],
  };
}

export function appendTemplateToNoteBody(
  existingBody: string,
  templateBody: string,
  date = new Date()
): { body: string; bodyText: string } {
  const currentDoc = parseTipTapDoc(existingBody);
  const templateDoc = interpolateJSONContent(parseTipTapDoc(templateBody), date);

  const currentNodes = Array.isArray(currentDoc.content) ? currentDoc.content : [];
  const templateNodes = Array.isArray(templateDoc.content) ? templateDoc.content : [];

  const merged: JSONContent = {
    type: "doc",
    content: [...currentNodes, { type: "horizontalRule" }, ...templateNodes],
  };

  return {
    body: JSON.stringify(merged),
    bodyText: extractPlainTextFromTipTap(merged),
  };
}

// ---------------------------------------------------------------------------
// Catálogo Oficial Built-in (13 Templates Prontos)
// ---------------------------------------------------------------------------

export const BUILTIN_NOTE_TEMPLATES: NoteTemplateRecord[] = [
  // ======================== CORPORATIVO & REUNIÕES ========================
  {
    id: "builtin-meeting-minutes",
    name: "Pauta & Ata de Reunião Executiva",
    description:
      "Estruture reuniões com metadados, pauta objetiva, decisões registradas e plano de ação com responsáveis e prazos.",
    category: "corporate",
    icon: "users",
    defaultTitle: "Ata de Reunião — {{hoje}}",
    tags: ["reuniao", "ata", "corporativo"],
    features: ["Tabela", "Callout", "Checklist"],
    builtIn: true,
    body: doc(
      callout(
        "info",
        p(bold("Objetivo da Reunião: "), txt("Descreva em uma frase qual decisão ou alinhamento precisa sair deste encontro."))
      ),
      table(
        ["Campo", "Detalhes"],
        [
          ["Data", "{{hoje}}"],
          ["Facilitador(a)", "Nome do responsável"],
          ["Participantes", "Nome 1, Nome 2, Nome 3"],
          ["Projeto / Área", "Ex.: Operações / Produto"],
        ]
      ),
      h1("1. Pauta do Encontro"),
      orderedList([
        [bold("Abertura e status geral: "), txt("Atualização rápida dos indicadores e marcos da semana.")],
        [bold("Tópico principal: "), txt("Discussão técnica ou estratégica prioritária.")],
        [bold("Impedimentos e riscos: "), txt("Pontos que precisam de apoio ou escalonamento.")],
      ]),
      h1("2. Notas e Discussões"),
      bulletList([
        "Resumo dos principais argumentos e dados apresentados.",
        "Pontos de atenção levantados pelas áreas envolvidas.",
      ]),
      h1("3. Decisões Tomadas"),
      blockquote(
        p(bold("Decisão #1: "), txt("Descreva o que foi aprovado e o critério adotado.")),
        p(bold("Decisão #2: "), txt("Descreva a próxima diretriz acordada."))
      ),
      h1("4. Plano de Ação (Action Items)"),
      taskList([
        { text: "[Responsável] Consolidar escopo revisado — Prazo: DD/MM" },
        { text: "[Responsável] Validar orçamento com financeiro — Prazo: DD/MM" },
        { text: "[Responsável] Enviar resumo executivo aos stakeholders — Prazo: {{hoje}}" },
      ])
    ),
  },
  {
    id: "builtin-one-on-one",
    name: "Reunião 1:1 (Liderança & Feedback)",
    description:
      "Roteiro para conversas individuais periódicas com foco em acompanhamento, feedback contínuo e desenvolvimento de carreira.",
    category: "corporate",
    icon: "message-square",
    defaultTitle: "1:1 — [Nome] ({{hoje}})",
    tags: ["1on1", "lideranca", "feedback"],
    features: ["Tabela", "Toggle", "Checklist"],
    builtIn: true,
    body: doc(
      table(
        ["Data", "Liderado(a)", "Clima / Energia (1-5)", "Próximo 1:1"],
        [["{{hoje}}", "Nome", "4 / 5", "DD/MM/AAAA"]]
      ),
      h1("1. Check-in & Bem-estar"),
      p("Como foi a semana? Como está a carga de trabalho e o equilíbrio das prioridades?"),
      h1("2. Conquistas & Destaques"),
      bulletList([
        "Entrega ou avanço de maior orgulho desde o último encontro.",
        "Reconhecimentos recebidos do time ou de clientes.",
      ]),
      h1("3. Desafios, Bloqueios & Apoio Necessário"),
      bulletList([
        "Onde estou travado(a) ou precisando de destravamento da liderança?",
        "Qual processo ou dependência externa tem gerado atrito?",
      ]),
      h1("4. Feedbacks & Desenvolvimento"),
      toggle(
        "Espaço de Feedback Estruturado (Situação → Comportamento → Impacto)",
        true,
        p(bold("Situação: "), txt("Contexto específico observado.")),
        p(bold("Comportamento: "), txt("Ação concreta realizada.")),
        p(bold("Impacto / Próximo passo: "), txt("Efeito gerado e sugestão de evolução."))
      ),
      h1("5. Compromissos até o próximo 1:1"),
      taskList([
        { text: "[Liderado] Definir meta de estudo/habilidade do trimestre" },
        { text: "[Liderança] Alinhar expectativa com área parceira" },
      ])
    ),
  },
  {
    id: "builtin-decision-log",
    name: "Registro de Decisão (Decision Log / ADR)",
    description:
      "Documente decisões estratégicas ou arquiteturais com contexto, tabela comparativa de opções, trade-offs e impacto.",
    category: "corporate",
    icon: "scale",
    defaultTitle: "Decisão #001 — [Título da Decisão]",
    tags: ["decisao", "adr", "governanca"],
    features: ["Tabela", "Callout", "Checklist"],
    builtIn: true,
    body: doc(
      table(
        ["Atributo", "Valor"],
        [
          ["Data", "{{hoje}}"],
          ["Status", "Em análise / Aprovada / Substituída"],
          ["Decisor(es)", "Nomes dos responsáveis"],
          ["Impacto", "Alto / Médio / Baixo"],
        ]
      ),
      h1("1. Contexto e Problema"),
      p("Descreva o cenário atual, as restrições técnicas ou de negócio e por que uma decisão precisa ser tomada agora."),
      h1("2. Opções Avaliadas"),
      table(
        ["Opção", "Benefícios (Prós)", "Riscos / Custos (Contras)", "Esforço"],
        [
          ["Opção A (Recomendada)", "Menor tempo de entrega, baixo risco operacional", "Dependência de fornecedor", "Médio"],
          ["Opção B", "Controle total e customização", "Alto custo de manutenção", "Alto"],
          ["Opção C (Manter atual)", "Custo zero imediato", "Não resolve gargalo de escala", "Baixo"],
        ]
      ),
      h1("3. Decisão Final"),
      callout(
        "theorem",
        p(bold("Decisão Aprovada: "), txt("Adotaremos a Opção A em razão do melhor equilíbrio entre prazo, risco e retorno esperado."))
      ),
      h1("4. Consequências & Plano de Execução"),
      taskList([
        { text: "Comunicar a decisão para todas as equipes impactadas" },
        { text: "Criar plano de mitigação para os riscos mapeados" },
        { text: "Revisar indicadores após 30 dias da implementação" },
      ])
    ),
  },

  // ======================== PRODUTO & PO ========================
  {
    id: "builtin-prd",
    name: "PRD — Requisitos de Produto",
    description:
      "Especificação completa para Product Owners: visão, personas, requisitos MoSCoW, fluxograma Mermaid, critérios de aceite e KPIs.",
    category: "product",
    icon: "layers",
    defaultTitle: "PRD — [Nome da Funcionalidade ou Produto]",
    tags: ["prd", "produto", "po"],
    features: ["Tabela", "Mermaid", "Checklist", "Callout"],
    builtIn: true,
    body: doc(
      callout(
        "info",
        p(bold("Resumo Executivo: "), txt("Qual problema real do usuário este produto/funcionalidade resolve e qual o impacto esperado no negócio?"))
      ),
      table(
        ["Campo", "Informação"],
        [
          ["Product Owner", "Nome do PO"],
          ["Data / Versão", "{{hoje}} · v1.0"],
          ["Squad / Time", "Design, Engenharia, QA, Dados"],
          ["Status", "Rascunho / Em Discovery / Pronto para Dev"],
        ]
      ),
      h1("1. Problema & Oportunidade"),
      p("Descreva a dor observada em entrevistas, dados de uso ou suporte. Quantifique a oportunidade sempre que possível."),
      h1("2. Público-Alvo & Personas"),
      bulletList([
        [bold("Persona Primária: "), txt("Perfil, rotina, objetivo principal e maior frustração atual.")],
        [bold("Persona Secundária: "), txt("Stakeholder ou usuário complementar impactado.")],
      ]),
      h1("3. Requisitos Funcionais (Priorização MoSCoW)"),
      table(
        ["ID", "Requisito / História de Usuário", "Prioridade", "Observações"],
        [
          ["RF-01", "Como usuário, quero... para que...", "Must Have", "Escopo MVP"],
          ["RF-02", "Como administrador, quero... para que...", "Should Have", "Fase 1"],
          ["RF-03", "Exportação avançada em lote", "Could Have", "Fase 2"],
        ]
      ),
      h1("4. Fluxo Principal do Usuário"),
      mermaid(
        `flowchart LR
  A[Início / Acesso] --> B{Usuário autenticado?}
  B -- Sim --> C[Tela Principal]
  B -- Não --> D[Login / Cadastro] --> C
  C --> E[Ação Principal] --> F[Confirmação & Métrica]`,
        "Fluxo macro da jornada do usuário"
      ),
      h1("5. Critérios de Aceite"),
      taskList([
        { text: "Fluxo feliz validado em desktop e mobile sem erros de console" },
        { text: "Estados vazios, de carregamento e de erro tratados com mensagens claras" },
        { text: "Eventos de telemetria e funil configurados" },
        { text: "Documentação de suporte e release notes preparados" },
      ]),
      h1("6. Métricas de Sucesso (KPIs)"),
      table(
        ["Indicador", "Linha de Base (Atual)", "Meta (30/60 dias)", "Fonte de Dados"],
        [
          ["Taxa de Adoção", "0%", "35% da base ativa", "Analytics"],
          ["Conversão / Conclusão", "—", "> 60%", "Funil de produto"],
          ["NPS / Satisfação", "—", "> 70", "Pesquisa in-app"],
        ]
      )
    ),
  },
  {
    id: "builtin-discovery",
    name: "Product Discovery & Hipótese",
    description:
      "Estruture descobertas de produto com declaração de hipótese, evidências, matriz de riscos e desenho de experimento.",
    category: "product",
    icon: "compass",
    defaultTitle: "Discovery — [Tema / Oportunidade]",
    tags: ["discovery", "produto", "experimento"],
    features: ["Callout", "Tabela", "Checklist"],
    builtIn: true,
    body: doc(
      callout(
        "experiment",
        p(bold("Declaração de Hipótese: "), txt("Acreditamos que "), highlight("[construir / mudar X]"), txt(" para "), highlight("[segmento Y]"), txt(" resultará em "), highlight("[resultado mensurável Z]"), txt(". Saberemos que acertamos quando observarmos [métrica]."))
      ),
      h1("1. Evidências & Sinais Coletados"),
      bulletList([
        [bold("Dados quantitativos: "), txt("Queda de conversão, taxa de abandono ou volume de chamados.")],
        [bold("Dados qualitativos: "), txt("Trechos de entrevistas, gravações de sessão ou feedbacks diretos.")],
      ]),
      h1("2. Matriz de Riscos de Produto"),
      table(
        ["Dimensão", "Pergunta-Chave", "Nível de Risco", "Como Validar"],
        [
          ["Valor", "O usuário realmente quer e usará isso?", "Alto", "Protótipo clicável + 5 entrevistas"],
          ["Usabilidade", "O usuário consegue usar sem ajuda?", "Médio", "Teste de usabilidade moderado"],
          ["Viabilidade", "Conseguimos construir no prazo/arquitetura?", "Médio", "Spike técnico com engenharia"],
          ["Negócio", "Funciona para jurídico, vendas e margem?", "Baixo", "Alinhamento com stakeholders"],
        ]
      ),
      h1("3. Plano de Experimento"),
      taskList([
        { text: "Recrutar 5 a 8 usuários representativos do perfil alvo" },
        { text: "Criar protótipo de baixa/média fidelidade para validação" },
        { text: "Executar sessões e consolidar padrões observados" },
        { text: "Decidir: Seguir para Delivery, Pivotar ou Descartar" },
      ])
    ),
  },
  {
    id: "builtin-sprint-planning",
    name: "Planning & Refinamento de Sprint",
    description:
      "Organize a meta da sprint, capacidade do time, backlog priorizado, Definition of Done e riscos mapeados.",
    category: "product",
    icon: "kanban",
    defaultTitle: "Sprint #[N] — Planning ({{hoje}})",
    tags: ["sprint", "agil", "po"],
    features: ["Tabela", "Callout", "Checklist"],
    builtIn: true,
    body: doc(
      table(
        ["Sprint", "Período", "Capacidade (pts)", "Meta Principal"],
        [["Sprint #", "{{hoje}} a DD/MM", "30 pts", "Entregar fluxo completo de..."]]
      ),
      h1("1. Backlog Comprometido"),
      table(
        ["ID", "História / Tarefa", "Responsável", "Pontos", "Status"],
        [
          ["US-101", "Implementar funcionalidade principal", "Dev 1", "5", "A fazer"],
          ["US-102", "Integrar API e testes automatizados", "Dev 2", "3", "A fazer"],
          ["BUG-42", "Corrigir validação de formulário", "Dev 1", "2", "A fazer"],
        ]
      ),
      h1("2. Dependências & Riscos"),
      callout(
        "warning",
        p(bold("Atenção: "), txt("Liste dependências de outros times, aprovações pendentes, férias ou feriados que impactam a capacidade da sprint."))
      ),
      h1("3. Definition of Done (DoD)"),
      taskList([
        { text: "Código revisado (Code Review / PR aprovado)" },
        { text: "Testes unitários e de integração passando" },
        { text: "Critérios de aceite validados pelo PO / QA em homologação" },
        { text: "Documentação e changelog atualizados" },
      ])
    ),
  },

  // ======================== BRIEFINGS & PROJETOS ========================
  {
    id: "builtin-briefing",
    name: "Briefing de Projeto / Campanha",
    description:
      "Alinhe escopo, público-alvo, mensagem-chave, entregáveis, prazos e restrições antes de iniciar qualquer iniciativa.",
    category: "briefings",
    icon: "clipboard-list",
    defaultTitle: "Briefing — [Nome do Projeto ou Campanha]",
    tags: ["briefing", "projetos", "marketing"],
    features: ["Tabela", "Callout", "Checklist"],
    builtIn: true,
    body: doc(
      table(
        ["Campo", "Informação"],
        [
          ["Solicitante / Cliente", "Área ou nome do cliente"],
          ["Responsável", "Gestor do projeto"],
          ["Data do Briefing", "{{hoje}}"],
          ["Prazo Desejado", "DD/MM/AAAA"],
          ["Orçamento Estimado", "R$ 0,00 / Interno"],
        ]
      ),
      h1("1. Contexto & Objetivo Principal"),
      p("Qual é o cenário atual e o que esta iniciativa precisa alcançar de forma concreta?"),
      h1("2. Público-Alvo & Mensagem-Chave"),
      bulletList([
        [bold("Quem queremos atingir: "), txt("Perfil demográfico, cargo, dores e canais.")],
        [bold("Proposta de valor / Tom de voz: "), txt("Como queremos ser percebidos e qual chamada para ação (CTA).")],
      ]),
      h1("3. Escopo & Entregáveis"),
      table(
        ["Entregável", "Formato / Especificação", "Responsável", "Data Prevista"],
        [
          ["Peça / Documento 1", "Ex.: Landing Page / Relatório", "Equipe A", "DD/MM"],
          ["Peça / Documento 2", "Ex.: Apresentação Executiva", "Equipe B", "DD/MM"],
        ]
      ),
      h1("4. Restrições & Referências"),
      callout(
        "warning",
        p(bold("O que NÃO faz parte do escopo (Out of Scope): "), txt("Defina claramente limites de marca, compliance, prazos ou canais excluídos."))
      ),
      h1("5. Checklist de Aprovação do Briefing"),
      taskList([
        { text: "Objetivos e métricas de sucesso validados com o solicitante" },
        { text: "Referências visuais, arquivos e acessos disponibilizados" },
        { text: "Cronograma e responsáveis confirmados" },
      ])
    ),
  },
  {
    id: "builtin-project-kickoff",
    name: "Kickoff & Plano de Projeto",
    description:
      "Documento de abertura de projeto com objetivos SMART, matriz de stakeholders, cronograma em Mermaid e gestão de riscos.",
    category: "briefings",
    icon: "rocket",
    defaultTitle: "Kickoff — [Nome do Projeto]",
    tags: ["kickoff", "projetos", "planejamento"],
    features: ["Tabela", "Mermaid", "Checklist"],
    builtIn: true,
    body: doc(
      h1("1. Visão Geral & Objetivos SMART"),
      bulletList([
        [bold("Específico & Mensurável: "), txt("O que será entregue e como o sucesso será medido.")],
        [bold("Prazo-alvo: "), txt("Data de Go-Live prevista e marcos intermediários.")],
      ]),
      h1("2. Stakeholders & Papéis"),
      table(
        ["Nome", "Área", "Papel no Projeto", "Canal de Comunicação"],
        [
          ["Nome 1", "Diretoria", "Sponsor / Aprovador", "E-mail / Reunião quinzenal"],
          ["Nome 2", "Produto / PM", "Líder do Projeto", "Diário / Chat"],
          ["Nome 3", "Tecnologia", "Líder Técnico", "Diário / Chat"],
        ]
      ),
      h1("3. Fases & Cronograma Macro"),
      mermaid(
        `flowchart LR
  F1[Fase 1: Descoberta] --> F2[Fase 2: Planejamento]
  F2 --> F3[Fase 3: Execução]
  F3 --> F4[Fase 4: Homologação]
  F4 --> F5[Fase 5: Lançamento]`,
        "Linha macro de fases do projeto"
      ),
      h1("4. Riscos Iniciais & Mitigação"),
      table(
        ["Risco", "Probabilidade", "Impacto", "Plano de Mitigação"],
        [
          ["Atraso em integração externa", "Média", "Alto", "Validar credenciais e sandbox na semana 1"],
          ["Mudança de escopo tardia", "Média", "Médio", "Congelar escopo após aprovação do Kickoff"],
        ]
      ),
      h1("5. Próximos Passos Imediatos"),
      taskList([
        { text: "Criar canal e pastas compartilhadas do projeto" },
        { text: "Agendar cerimônias semanais de acompanhamento" },
        { text: "Validar acessos e ambientes de trabalho" },
      ])
    ),
  },
  {
    id: "builtin-post-mortem",
    name: "Post-Mortem & Análise de Incidente",
    description:
      "Analise incidentes sem caça às bruxas (blameless): impacto, linha do tempo, causa raiz (5 Porquês) e ações preventivas.",
    category: "briefings",
    icon: "shield-alert",
    defaultTitle: "Post-Mortem — [Incidente] ({{hoje}})",
    tags: ["postmortem", "incidente", "operacoes"],
    features: ["Callout", "Tabela", "Checklist"],
    builtIn: true,
    body: doc(
      callout(
        "warning",
        p(bold("Resumo do Incidente: "), txt("Descreva o que ocorreu, duração total, serviços/clientes afetados e como foi mitigado."))
      ),
      table(
        ["Data", "Severidade", "Duração", "Responsável pela Análise"],
        [["{{hoje}}", "SEV-2", "45 min", "Nome"]]
      ),
      h1("1. Linha do Tempo"),
      table(
        ["Horário", "Evento / Ação Executada"],
        [
          ["14:00", "Alerta disparado no monitoramento / relato inicial"],
          ["14:12", "Equipe acionada e diagnóstico iniciado"],
          ["14:35", "Correção / rollback aplicado"],
          ["14:45", "Serviço estabilizado e validado"],
        ]
      ),
      h1("2. Causa Raiz (5 Porquês)"),
      orderedList([
        "Por que o problema aconteceu?",
        "Por que essa condição não foi impedida?",
        "Por que os testes/monitoramento não detectaram antes?",
      ]),
      h1("3. Lições Aprendidas"),
      bulletList([
        [bold("O que funcionou bem: "), txt("Ex.: Alerta rápido, comunicação transparente.")],
        [bold("O que precisa melhorar: "), txt("Ex.: Cobertura de teste automatizado e runbook atualizado.")],
      ]),
      h1("4. Ações Preventivas"),
      taskList([
        { text: "[Engenharia] Adicionar teste de regressão para o cenário" },
        { text: "[Operações] Atualizar alerta e documentação de contingência" },
      ])
    ),
  },

  // ======================== ACADÊMICO & PESQUISA ========================
  {
    id: "builtin-academic-article",
    name: "Artigo Acadêmico (Pronto para ABNT)",
    description:
      "Estrutura científica completa com Resumo, Referencial Teórico, Metodologia, Fórmula KaTeX, Resultados e Referências — pronto para exportar em DOCX ABNT.",
    category: "academic",
    icon: "graduation-cap",
    defaultTitle: "Título do Artigo Científico",
    tags: ["academico", "artigo", "abnt"],
    features: ["Callout", "KaTeX", "Tabela"],
    builtIn: true,
    body: doc(
      p(italic("Autor(a): Seu Nome Completo — Instituição / Programa — {{mes_ano}}")),
      h1("Resumo"),
      p("Apresente em um único parágrafo conciso o contexto da pesquisa, o objetivo central, a metodologia aplicada, os principais resultados esperados ou obtidos e a conclusão."),
      p(bold("Palavras-chave: "), txt("Palavra 1; Palavra 2; Palavra 3; Palavra 4.")),
      h1("1. Introdução"),
      p("Contextualize o tema de pesquisa, delimite o problema investigado, apresente a justificativa da relevância acadêmica/prática e enuncie o objetivo geral e os objetivos específicos."),
      h1("2. Referencial Teórico"),
      p("Desenvolva a revisão de literatura articulando os principais autores e conceitos que fundamentam o estudo."),
      callout(
        "theorem",
        p(bold("Definição / Conceito Central: "), txt("Destaque aqui uma proposição, definição formal ou marco teórico essencial para a pesquisa (AUTOR, ano, p. XX)."))
      ),
      h1("3. Metodologia"),
      bulletList([
        [bold("Natureza e abordagem: "), txt("Ex.: Pesquisa aplicada, qualitativa/quantitativa.")],
        [bold("Instrumentos e coleta: "), txt("Ex.: Revisão bibliográfica, questionário, experimento controlado.")],
        [bold("Modelo analítico: "), txt("Equação ou critério estatístico adotado na análise:")],
      ]),
      mathBlock("\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i"),
      h1("4. Resultados e Discussão"),
      table(
        ["Variável / Grupo", "Amostra (n)", "Resultado Observado", "Observação"],
        [
          ["Grupo Controle", "30", "Valor A", "Referência basal"],
          ["Grupo Experimental", "30", "Valor B", "Variação estatisticamente relevante"],
        ]
      ),
      h1("5. Considerações Finais"),
      p("Retome os objetivos propostos, sintetize as contribuições do estudo, aponte limitações encontradas e sugira caminhos para pesquisas futuras."),
      h1("Referências"),
      p("SOBRENOME, Nome. Título da obra: subtítulo. Edição. Local: Editora, Ano.")
    ),
  },
  {
    id: "builtin-study-notes",
    name: "Fichamento & Estudo Ativo",
    description:
      "Organize leituras e aulas com conceitos-chave, blocos expansíveis (Toggle) para revisão por auto-teste e síntese crítica.",
    category: "academic",
    icon: "book-open",
    defaultTitle: "Estudo — [Disciplina ou Obra]",
    tags: ["estudo", "fichamento", "revisao"],
    features: ["Callout", "Toggle", "Checklist"],
    builtIn: true,
    body: doc(
      table(
        ["Fonte / Livro / Aula", "Autor / Professor", "Data"],
        [["Título do material", "Nome", "{{hoje}}"]]
      ),
      h1("1. Ideias & Conceitos-Chave"),
      callout(
        "info",
        p(bold("Tese Central: "), txt("Resuma com suas próprias palavras o argumento principal do material estudado."))
      ),
      bulletList([
        [bold("Conceito 1: "), txt("Explicação clara e objetiva.")],
        [bold("Conceito 2: "), txt("Relação com outros conteúdos já estudados.")],
      ]),
      h1("2. Perguntas de Auto-Teste (Revisão Ativa)"),
      p(italic("Dica: use o botão 'Modo Auto-teste' na barra de ferramentas para ocultar e revelar todas as respostas.")),
      toggle(
        "Pergunta 1: Qual é o principal conceito apresentado e como ele funciona na prática?",
        false,
        p("Escreva aqui a resposta completa com exemplos para testar sua memória ativa.")
      ),
      toggle(
        "Pergunta 2: Quais são as exceções ou limitações deste modelo?",
        false,
        p("Liste os casos de contorno ou contraexemplos importantes.")
      ),
      h1("3. Síntese & Próximas Leituras"),
      taskList([
        { text: "Revisar anotações em 24 horas e novamente em 7 dias" },
        { text: "Vincular esta nota com outros temas relacionados usando [[" },
      ])
    ),
  },

  // ======================== PESSOAL & DIÁRIO ========================
  {
    id: "builtin-daily-journal",
    name: "Diário Pessoal & Reflexão Diária",
    description:
      "Espaço tranquilo para registrar o dia, praticar gratidão, acompanhar energia/humor e definir as prioridades de amanhã.",
    category: "personal",
    icon: "sun",
    defaultTitle: "Diário — {{hoje}}",
    tags: ["diario", "pessoal", "reflexao"],
    features: ["Callout", "Checklist"],
    builtIn: true,
    body: doc(
      callout(
        "example",
        p(bold("Check-in do Dia ({{hoje}}): "), txt("Humor: [ Tranquilo / Focado / Cansado ] · Energia: [ 1-5 ] · Foco principal: ..."))
      ),
      h1("Gratidão & Pequenas Vitórias"),
      bulletList([
        "Algo bom que aconteceu hoje:",
        "Uma pessoa ou momento pelo qual sou grato(a):",
        "Uma pequena vitória pessoal:",
      ]),
      h1("Registros & Pensamentos do Dia"),
      p("Escreva livremente sobre o que marcou o seu dia, ideias que surgiram ou sentimentos que deseja organizar..."),
      h1("O que aprendi hoje"),
      blockquote(p("Qual insight, ajuste de rota ou lição vale levar adiante?")),
      h1("3 Prioridades para Amanhã"),
      taskList([
        { text: "Prioridade #1 (a mais importante do dia)" },
        { text: "Prioridade #2" },
        { text: "Prioridade #3" },
      ])
    ),
  },
  {
    id: "builtin-weekly-plan",
    name: "Planejamento Semanal Pessoal",
    description:
      "Visualize metas da semana, agenda por dia em tabela, rastreador de hábitos em checklist e revisão de fim de semana.",
    category: "personal",
    icon: "calendar",
    defaultTitle: "Semana de {{hoje}}",
    tags: ["semanal", "planejamento", "pessoal"],
    features: ["Tabela", "Checklist", "Callout"],
    builtIn: true,
    body: doc(
      callout(
        "info",
        p(bold("Intenção da Semana: "), txt("Se eu concluir apenas 3 grandes entregas nesta semana para ela ser excelente, quais serão?"))
      ),
      h1("1. Metas Principais"),
      taskList([
        { text: "Meta 1 — Trabalho / Projeto" },
        { text: "Meta 2 — Estudos / Desenvolvimento" },
        { text: "Meta 3 — Saúde / Pessoal" },
      ]),
      h1("2. Mapa da Semana"),
      table(
        ["Dia", "Foco Principal", "Compromissos / Notas"],
        [
          ["Segunda", "", ""],
          ["Terça", "", ""],
          ["Quarta", "", ""],
          ["Quinta", "", ""],
          ["Sexta", "", ""],
          ["Sábado / Domingo", "Descanso & Revisão", ""],
        ]
      ),
      h1("3. Hábitos & Rotina"),
      taskList([
        { text: "Atividade física (3x a 5x na semana)" },
        { text: "Leitura ou estudo focado" },
        { text: "Organizar finanças e caixa de entrada" },
      ]),
      h1("4. Revisão da Semana"),
      bulletList([
        [bold("O que deu muito certo: "), txt("")],
        [bold("O que ajustar na próxima semana: "), txt("")],
      ])
    ),
  },
];

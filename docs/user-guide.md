# Guia do usuário

## Navegação básica

O Magnetares opera com uma barra lateral modular e três visualizações principais:

1. **Visão de Notas (Três Painéis):** Barra lateral (árvore de pastas e etiquetas), Lista central de notas e Editor rico estruturado.
2. **Visão de Listas & Tarefas:** Painel central de tarefas com Quick-Add, filtros e busca, acompanhado do painel lateral Inspector para detalhes, subtarefas e notas anexas.
3. **Visão de Stickers:** Mural em grade expansível (*full-width*) com post-its coloridos e ordenação fluida por arrastar e soltar.

O botão de recolher a barra lateral amplia a área de trabalho. A rolagem fica na borda direita e aparece de maneira discreta quando há conteúdo extenso.

## Criar e editar

- Clique em **Nova nota** ou use `Ctrl+N` (`Cmd+N` no macOS).
- Ao lado do botão "Nova nota", clique no botão **Novo código** `< >` para criar um Code Snippet, otimizado para desenvolvedores.
- Edite título e conteúdo; o salvamento é automático com debounce e fila serial por nota.
- O estado no topo do editor alterna entre **Salvando…**, **Salvo** e **Falha ao salvar**.
- `Ctrl+F` ou `Cmd+F` move o foco para a busca.

### Code Snippets
O Magnetares agora permite criar arquivos exclusivos de código (independentes das anotações ricas).
- Motor de renderização: utiliza a mesma engine do **VS Code** (Monaco Editor).
- Suporte a syntax highlighting com identificação automática da linguagem pela seleção no *dropdown* superior.
- Cópia com 1-clique por meio do botão nativo "Copiar".
- As notas de código exibem a linguagem com **Color Badges** ou os logotipos originais na barra lateral (ao invés do botão genérico).

## Formatação

A barra do editor oferece:

- Corpo, Título e Subtítulo.
- Negrito, itálico e destaque.
- Listas com marcadores e listas numeradas.
- Checklists; marque a caixa para concluir um item.
- Citações.
- Hyperlinks: selecione um texto, use o botão de link e informe uma URL `http://` ou `https://`; o mesmo controle edita ou remove o link.
- Bloco de código com highlight: ative o bloco e escolha a linguagem na toolbar. Linguagens comuns incluem JavaScript, TypeScript, Go, Python, JSON, HTML, CSS e Markdown.
- Tabelas com cabeçalho; dentro de uma tabela surgem controles para adicionar/excluir linha, adicionar/excluir coluna ou remover a tabela inteira. **Dica:** cole dados copiados diretamente do Excel, Google Sheets ou arquivos CSV/TSV para convertê-los automaticamente em tabelas formatadas.
- Cálculos aritméticos: use o botão de calculadora, informe uma expressão matemática simples e insira o resultado; dê duplo clique no chip para editar.
- **Fórmulas matemáticas e químicas com LaTeX (KaTeX + `mhchem`):** clique no botão $\Sigma$ da barra de ferramentas ou selecione uma expressão para convertê-la. Oferece suporte a fórmulas em linha (`$latex$`) e blocos centralizados (`$$latex$$`), live preview instantâneo, teclado com atalhos de símbolos para cursos de Engenharia e Ciências Exatas (frações, raízes, integrais, derivadas, matrizes, alfabeto grego) e aba de **Química & Bio** (`\ce{...}` para reações estequiométricas, tampão sanguíneo, íons e decaimentos), 100% offline e com suporte a exportação/importação Markdown.
- **Destaques Acadêmicos (*Callouts*):** use o botão com ícone de marcador na toolbar para inserir caixas com bordas temáticas e ícones destacados para **Notas**, **Teoremas/Definições**, **Experimentos de Laboratório**, **Alertas Clínicos/Avisos** e **Exemplos Práticos**, com seletor de tipo integrado e compatibilidade com Markdown (`> [!NOTE]`, etc.).
- **Blocos Expansíveis (*Toggles* para Estudo Ativo e Auto-teste):** clique no botão de bloco expansível na barra de ferramentas para inserir uma pergunta ou tópico sanfonado. Ideal para a técnica de *Active Recall* (recuperação ativa) em vésperas de provas e revisões:
  - Oculte resoluções de exercícios, deduções de fórmulas, diagnósticos médicos ou gabaritos.
  - O cabeçalho da pergunta aceita fórmulas matemáticas LaTeX inline (ex: `$\int \sin(x)dx$`).
  - Botão rápido **Revelar / Ocultar** no cabeçalho de cada bloco para alternar visualização sem perder o foco.
  - Botão global **Ocultar/Expandir todos os toggles** na barra de ferramentas para recolher todas as respostas da nota em um clique e simular um teste prático.
  - Compatibilidade nativa com tags `<details><summary>` na importação e exportação de Markdown e HTML.
- **Diagramas Mermaid.js (Engenharia, Biologia, Computação & Saúde):** clique no botão de diagrama na barra de ferramentas para inserir fluxogramas, ciclos e modelos gráficos interativos renderizados em SVG:
  - **Modelos Rápidos (1-clique):** insira templates prontos de Fluxogramas de Controle, Ciclo de Krebs (Bioquímica), Feedback Homeostático (Fisiologia), Diagramas de Sequência, Máquinas de Estados, Mapas Mentais (Mindmaps) e Modelagem de Dados (ER).
  - **Edição & Live Preview:** alterne entre o modo de visualização e edição de código a qualquer momento ou com duplo clique no diagrama.
  - **Zoom & Legendas:** ajuste o zoom (50% a 200%), adicione legenda/título da figura e copie o código Mermaid com 1 clique.
  - **Exportação & Importação:** exporta e importa como blocos de código padrão ```` ```mermaid ```` em Markdown e como figuras semânticas `<figure><pre class="mermaid">` em HTML.

O editor persiste um documento estruturado Tiptap no banco local e gera `bodyText` para busca e prévias.

## Organização

### Pastas e subpastas

- Use o botão `+` da seção **Pastas** para criar uma pasta com cor (8 opções HSL) e ícone (8 símbolos visuais).
- Selecione uma pasta para editar ou criar subpastas.
- Clique no ícone de lápis/configurações de qualquer pasta (incluindo pastas legadas) para editar seu nome, cor e ícone a qualquer momento.
- Arraste uma nota da lista para uma pasta na barra lateral para movê-la.
- Arraste uma pasta sobre outra pasta para transformá-la em subpasta.
- Use os chevrons da árvore para expandir ou recolher subpastas; a navegação permanece rolável para grandes coleções.
- O aplicativo impede ciclos, como uma pasta ser ancestral de si mesma.
- Ao excluir uma nota, um alerta de confirmação informa que ela será movida para a pasta padrão (*Default*) e preservada na Lixeira local.

### Notas fixadas

Use o ícone de alfinete no topo do editor. Notas fixadas aparecem primeiro nas listas compatíveis.

### Etiquetas

- Clique em `+` na seção **Etiquetas** da barra lateral para criar uma etiqueta; escolha o nome e um dos seis ícones disponíveis.
- Passe o cursor sobre uma etiqueta para editar nome/ícone ou excluí-la.
- Etiquetas usadas por uma Pasta Inteligente não podem ser excluídas até que a regra seja removida.
- Clique em **Etiqueta** abaixo do título para associá-la à nota.
- Escreva uma etiqueta e pressione `Enter`.
- O caractere `#` é opcional; `trabalho` e `#trabalho` representam a mesma etiqueta.
- Clique no `×` de um chip para removê-lo.

### Listas & Tarefas (v1.8.0)

O Magnetares Notes possui um módulo completo de produtividade pessoal, acessível na seção **LISTAS** da barra lateral (posicionada entre Notas e Etiquetas/Stickers).

#### Hierarquia de quatro níveis
1. **Listas de Tarefas:** agrupamentos temáticos (ex.: *Entrada*, *Trabalho*, *Pessoal*, *Estudos*). A lista padrão **Entrada** (`list-inbox`) é provisionada automaticamente e é protegida contra arquivamento ou exclusão.
2. **Tarefas:** pendências individuais com título, data de vencimento, prioridade e status de conclusão.
3. **Subtarefas (Checklists):** itens de decomposição rápida dentro de cada tarefa com barra de progresso proporcional animada.
4. **Múltiplas Notas por Tarefa:** bloco para anexar múltiplas anotações ricas e contextuais à mesma tarefa, com registro de data/hora e edição/exclusão individual.

#### Gestão de Listas e Personalização
- Clique em `+` na seção **LISTAS** da barra lateral para abrir o diálogo `TaskListDialog`.
- Escolha o nome, cor temática (azul, verde, laranja, roxo, rosa, etc.) e ícones ilustrativos (Caixa de entrada, Trabalho, Pessoal, Compras, Estudo, Código, etc.).
- Cada lista exibe na barra lateral a contagem em tempo real de tarefas pendentes (não concluídas).

#### Arquivamento de Listas (Soft-Delete)
- Para ocultar listas concluídas ou sazonais sem perder nenhum histórico, passe o cursor sobre a lista e escolha **Arquivar lista**.
- As listas arquivadas saem da visualização ativa e são organizadas na seção recolhível **"Arquivadas (N)"** no rodapé da seção de listas.
- Abrir uma lista arquivada a exibe em **Modo Consulta**, com banner explicativo e um botão **Desarquivar Lista** para restaurá-la imediatamente com 1 clique.
- A lista protegida *Entrada* não pode ser arquivada.

#### Exclusão Definitiva com Aviso de Nuvem
- Excluir uma lista remove definitivamente ela, suas tarefas e subtarefas, propagando lápides (*tombstones*) locais e para a nuvem Turso conectada.
- O diálogo de confirmação exibe um aviso em destaque e oferece o botão alternativo *"Arquivar lista"* para prevenir a perda acidental de dados.

#### Barra de Entrada Rápida (Quick-Add)
- No topo da lista ativa, digite o título da tarefa e pressione `Enter` para adicionar de imediato.
- Selecione diretamente na barra de entrada:
  - **Prioridades Semânticas:**
    - 🔥 **Alta** (`Flame`, vermelho): urgência máxima.
    - ⚠️ **Média** (`AlertTriangle`, laranja): prioridade moderada.
    - ⬇️ **Baixa** (`ArrowDown`, azul): pendências menores.
    - ➖ **Nenhuma** (`Minus`, neutro): tarefas sem nível atribuído.
  - **Data de Vencimento:** calendário rápido com cálculo de prazos relativos (*Hoje*, *Amanhã*, *Atrasada*).

#### Painel Inspector e Detalhes da Tarefa
Ao clicar em qualquer tarefa da lista, o painel lateral Inspector se abre com ferramentas de edição aprofundada:
- **Edição de Título:** campo inline atualizado automaticamente.
- **Mudança de Lista:** dropdown para mover a tarefa entre diferentes listas.
- **Prioridade e Vencimento:** seletores rápidos com indicação semântica.
- **Checklist de Subtarefas:** adicione subtarefas, marque conclusão e acompanhe a barra de progresso dinâmica em tempo real.
- **Notas Anexadas:** adicione quantos cartões de notas forem necessários; cada cartão conta com data de registro e opção de edição ou exclusão individual.
- **Modais Nativos Centralizados:** todas as confirmações de exclusão (tarefas, notas e listas) utilizam diálogos centralizados integrados ao tema visual, sem popups técnicos do navegador.

### Stickers (Notas Autoadesivas)

A seção **STICKERS** fica posicionada na barra lateral entre Pastas e Etiquetas, permitindo gerenciar lembretes rápidos e pensamentos em formato de post-its visuais:

- **Quadros (Views):** clique no `+` da seção STICKERS para criar quadros dedicados (ex.: "Tarefas Rápidas", "Ideias", "Estudos"). Cada quadro funciona como uma pasta independente de stickers.
- **Mural Full-Width:** ao selecionar um quadro, a interface abre um mural em tela cheia que organiza as notas adesivas em uma grade fluida e responsiva.
- **Criar Sticker:** use o botão **+ Novo sticker** para adicionar um card. O salvamento é automático e contínuo.
- **Personalização de Cores:** cada nota adesiva possui um seletor com 8 tons pastel (amarelo, laranja, rosa, roxo, azul, turquesa, verde e neutro) compatíveis com os temas claro e escuro.
- **Fixação:** clique no ícone de alfinete para fixar stickers importantes no topo do mural.
- **Mover e Reordenar (Drag & Drop):** arraste qualquer sticker para reordená-lo no mural, solte no espaço vazio do canvas para enviá-lo ao fim da lista, ou arraste-o diretamente para **outro quadro na barra lateral** para transferi-lo entre quadros.

### Pastas Inteligentes

Uma Pasta Inteligente armazena uma regra simples e mostra notas dinamicamente. Regras disponíveis:

- uma etiqueta específica;
- data de criação ou atualização: hoje, últimos 7 dias ou últimos 30 dias;
- checklists: qualquer checklist, itens pendentes ou todos concluídos.

## Lixeira

Use o ícone de lixeira no editor. A nota some das listas normais e vai para **Apagadas recentemente**. Nesse contexto a nota fica somente leitura e pode ser restaurada pelo botão de restauração.

## Importar, exportar e imprimir

### Importar

O botão de upload na lista aceita `.md`, `.markdown` e `.txt`.

- A primeira linha iniciada por `# ` é usada como título.
- O restante entra no corpo da nota.
- A importação é adicionada ao banco local como nova nota.

### Exportar

No editor, abra o botão de download e escolha:

- **Markdown:** estrutura legível em `.md`.
- **HTML:** arquivo independente com estilos básicos.
- **Texto:** título e texto extraído em `.txt`.

### Imprimir & Exportar para PDF

Clique no botão de impressora na barra superior do editor (ou use `Ctrl+P`). O diálogo nativo do sistema operacional é acionado com motor de diagramação `@media print` de alta fidelidade:
- **Prevenção de Quebras Órfãs:** Fórmulas matemáticas KaTeX (`$$...$$`), diagramas Mermaid.js, caixas de destaque (callouts), tabelas e itens de checklist não são fatiados no meio de quebras de página.
- **Tabelas com Cabeçalho Contínuo:** Cabeçalhos de tabelas extensas repetem automaticamente no topo das páginas seguintes (`thead`).
- **Resumos de Estudo & Toggles:** Blocos sanfonados de estudo ativo expandem automaticamente suas respostas e deduções, ocultando botões interativos para compor apostilas de revisão completas.
- **Diagramas Vetoriais em SVG:** Diagramas Mermaid são escalados com proporção visual perfeita para o padrão A4/Letter com suas respectivas legendas.
- **Notas de Código Paginadas:** Arquivos de código extensos utilizam visualizador paginado que flui por múltiplas páginas sem cortes.
- **Sugestão Automática de Nome:** O nome do arquivo PDF sugerido no diálogo do sistema utiliza automaticamente o título real da nota.
- **Compatibilidade com Tema Escuro:** Normaliza automaticamente fundos e contrastes para impressão preto no branco, prevenindo textos ilegíveis ao imprimir no modo escuro.

## Sincronização opcional

O app funciona sem configuração de nuvem. Para usar suas notas em outro computador:

1. Abra **Preferências > Nuvem & Turso**.
2. Informe a URL do seu banco Turso e o token de acesso.
3. Clique em **Conectar Turso**.
4. Clique em **Sincronizar agora com a Nuvem**.
5. No novo computador, informe a mesma URL e o mesmo token, conecte e sincronize para popular o banco local.

Em **Preferências > Nuvem**, configure **Sincronização automática** como desativada, 5, 15, 30 minutos ou 1 hora. O aplicativo aguarda autosaves locais antes de iniciar uma rodada automática.

### Conflitos

Quando duas máquinas alteram uma nota a partir de revisões diferentes, a versão local não é apagada. O diálogo de conflitos oferece:

- **Manter minha versão:** rebaseia a edição local sobre a revisão remota.
- **Usar versão da nuvem:** substitui a cópia local pela versão remota.
- **Mesclar conteúdo:** mantém o conteúdo local primeiro e anexa a versão da nuvem na mesma nota, com separador e título remoto.

Se os conteúdos forem semanticamente iguais e apenas a revisão divergir, o aplicativo converge automaticamente sem criar conflito ou duplicar a nota.

O token é guardado pelo cofre de credenciais do sistema. Consulte [API e sincronização](api-and-sync.md) e [Segurança](security.md).

## Auditoria de Compliance e Integridade

Se você possui bancos locais legados ou deseja verificar a integridade da sincronização com a nuvem:

1. Abra **Preferências > Manutenção & Compliance**.
2. Clique em **Executar Auditoria de Compliance**.
3. O sistema verificará automaticamente:
   - Resolução de conflitos órfãos ou inconsistentes em `note_conflicts`.
   - Normalização de datas e timestamps inválidos.
   - Recálculo de pendências e totais de checklists.
   - Restauração do estado de sincronização (`pending` / `clean`) para upload direto na nuvem.
4. Um relatório resumido com o status e total de reparos efetuados será exibido.
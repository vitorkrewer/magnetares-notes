# Editor de Texto Rico

O coração do Magnetares Notes é o seu **Editor Estruturado**, construído sobre a moderna engine **TipTap** e otimizado para escrita fluida, estudo universitário e organização de ideias.

![Interface do Editor de Texto Rico no Magnetares Notes](assets/screenshots/editor.png)

---

## 1. Visão Geral da Interface

Ao abrir o Magnetares, a janela se divide em três painéis harmônicos:
1. **Barra Lateral Esquerda:** Árvore de navegação com Pastas, Subpastas, Listas de Tarefas, Mural de Stickers e Etiquetas.
2. **Lista Central de Notas:** Lista com busca instantânea (`Ctrl+F`), ordenação por data de modificação, indicador de fixação no topo e visualização de resumos.
3. **Área do Editor:** Espaço limpo e focado, com título da nota, carimbo de data da última alteração, chips de etiquetas e a barra de ferramentas de formatação.

Você pode ocultar a barra lateral e a lista central clicando no botão de menu ou usando o botão de recolher para obter uma experiência de escrita imersiva.

---

## 2. Tipografia e Formatação de Texto

A barra de formatação superior reúne todas as ferramentas necessárias para dar estrutura visual às suas anotações:

- **Títulos e Subtítulos:** Seletor de estilo com opções para *Título Principal*, *Título de Seção* e *Subtítulo*.
- **Estilos de Fonte:** Botões rápidos e atalhos de teclado universais:
  - **Negrito:** `<kbd>Ctrl+B` ou `<kbd>Cmd+B`
  - *Itálico:* `<kbd>Ctrl+I` ou `<kbd>Cmd+I`
  - <u>Sublinhado:</u> `<kbd>Ctrl+U` ou `<kbd>Cmd+U`
  - ~~Tachado:~~ Para riscar itens obsoletos.
  - ==Destaque de Texto:== Marcador visual em amarelo suave ou tom customizado.
- **Paleta de Cores de Texto:** Escolha entre tons neutros e destaques coloridos para realçar palavras-chave.
- **Alinhamento e Espaçamento:** Alinhar à esquerda, centralizado, à direita ou justificado.

---

## 3. Listas, Marcadores e Checklists

O editor suporta três formatos essenciais de listagem:

1. **Listas com Marcadores:** Digite `- ` ou `* ` seguido de espaço no início da linha para criar uma lista com marcadores de forma automática.
2. **Listas Numeradas:** Digite `1. ` seguido de espaço para iniciar uma lista numerada contínua.
3. **Checklists Interativas:** Clique no botão de checklist na barra de ferramentas ou digite `[] ` para criar caixas de seleção.
   - Ao marcar uma caixa, o texto é automaticamente tachado com visual atenuado.
   - O aplicativo calcula em tempo real o total de pendências e tarefas concluídas da nota, exibindo uma badge de progresso diretamente na lista lateral!

---

## 4. Tabelas Inteligentes com Colagem do Excel e Sheets

As tabelas do Magnetares Notes foram desenvolvidas para facilitar a compilação de dados experimentais, cronogramas e comparações:

- **Criar Tabela:** Clique no ícone de tabela na barra de ferramentas para inserir uma grade 3x3 com cabeçalho destacado.
- **Menu Contextual de Célula:** Ao posicionar o cursor dentro de qualquer célula, surgem botões rápidos para:
  - Adicionar linha acima ou abaixo;
  - Adicionar coluna à esquerda ou à direita;
  - Excluir linha ou coluna atual;
  - Alternar cabeçalho destacado.
- **Colagem Direta de Planilhas:** Selecione qualquer intervalo de células no **Microsoft Excel**, **Google Sheets** ou copie linhas de arquivos **CSV/TSV** e cole (`Ctrl+V`) dentro do editor. O Magnetares converte os dados tabulares instantaneamente em uma tabela rica formatada!

---

## 5. Citações e Hyperlinks

- **Blocos de Citação:** Clique no botão de citação ou inicie a linha com `> ` para criar blocos com borda lateral suave, perfeitos para citações bibliográficas e epígrafes.
- **Hyperlinks:** Selecione o trecho de texto desejado e clique no ícone de link (ou pressione `<kbd>Ctrl+K`). Digite a URL de destino (`https://...`). Clicar sobre um link abre a página no navegador padrão do sistema.

---

## 6. Cálculos Aritméticos Inline

Para quem faz orçamentos rápidos, medições de laboratório ou conversões de unidades, o Magnetares conta com um avaliador aritmético integrado:

1. Clique no botão de calculadora na barra de ferramentas.
2. Digite qualquer expressão aritmética simples (ex: `(120 * 1.15) / 2` ou `45.8 + 12.4`).
3. Pressione `Enter`. O aplicativo insere um chip com o resultado exato calculado.
4. Para alterar os valores, basta dar duplo clique sobre o chip e editar a expressão.

---

## 7. Temas Claro e Escuro (Alto Contraste)

O editor adapta-se instantaneamente ao seu ambiente de estudo:

![Editor no Tema Claro do Magnetares Notes](assets/screenshots/editor-tema-claro.png)

- **Tema Escuro (Deep Space):** Paleta cósmica em tons de azul-profundo (`--night-900`), reduzindo a fadiga ocular em sessões noturnas de estudo.
- **Tema Claro (Warm Paper):** Fundo suave em tom pergaminho claro com tipografia em alto contraste preto (#111), ideal para ambientes bem iluminados e leitura prolongada.
- **Como alternar:** Abra **Preferências (⚙)** no rodapé da barra lateral e escolha seu tema preferido em **Geral & Aparência**.

# Minhas Conexões & Vínculos entre Notas

A partir da **versão 2.1.0**, o Magnetares Notes transforma suas anotações isoladas em uma **rede viva de conhecimento conectado**, combinando links bidirecionais `[[Nota]]`, indicadores visuais de relacionamento e um **Mapa de Grafos Interativo** em **Minhas Conexões**.

---

## 1. Criando Vínculos Bidirecionais `[[Nota]]`

Existem duas formas práticas de conectar notas dentro do Magnetares:

### Autocompletar Inline no Editor (`[[`)
Enquanto escreve em qualquer nota de texto rico, basta digitar **`[[`** seguido de parte do título da nota desejada:
1. Um menu flutuante exibe imediatamente as notas correspondentes.
2. Pressione `Enter` ou clique na nota desejada para inserir uma **pílula clicável de vínculo**.
3. Clicar na pílula navega diretamente para a nota referenciada, e o vínculo passa a ser rastreado nos dois sentidos (*link de saída* e *backlink*).

### Painel Lateral de Vínculos & Etiquetas
No cabeçalho superior da nota aberta, clique no botão de **Vínculos** (ícone de rede com contador numérico, como `3` ou `4`) para abrir o painel dedicado à direita do editor:
- **Etiquetas da Nota:** adicione ou remova `#tags` rapidamente.
- **Links de Saída:** veja todas as notas citadas por esta nota ou vincule novas notas pesquisando pelo título.
- **Backlinks Automáticos (Citada por):** descubra instantaneamente quais outras notas do seu caderno fazem referência à nota atual.
- **Notas Relacionadas por Etiqueta:** sugestões automáticas de documentos que compartilham as mesmas tags.

---

## 2. Indicadores de Conexão em Toda a Interface

Você nunca perde o contexto das relações de um documento:

![Cabeçalho da nota exibindo o selo de etiquetas e notas conectadas](assets/screenshots/nota-template-vinculos.jpg)

- **Na lista de notas:** cartões exibem badges discretos com a contagem de etiquetas e conexões diretas.
- **Abaixo do título da nota:** uma pílula de resumo informa exatamente quantas relações ativas existem (ex.: `3 etiquetas · 1 nota conectada`) e abre o Painel Lateral em um clique.
- **No rodapé do editor:** chips rápidos permitem saltar diretamente para notas conectadas sem rolar o texto.

---

## 3. Explorando o Mapa em Minhas Conexões

Na barra lateral esquerda, acesse a seção **CONEXÕES → Minhas Conexões** para abrir a visão global em grafo da sua base de conhecimento:

![Mapa de grafos interativo Minhas Conexões com ícones de Nota, Código e Etiqueta e explorador lateral](assets/screenshots/minhas-conexoes-grafo.jpg)

### Leitura Visual dos Nós
Cada elemento do seu caderno recebe identidade geométrica, cor e ícone vetorial próprios para leitura imediata:
- **Nota de Texto Rico:** círculo com ícone de documento.
- **Nota de Código:** círculo violeta com símbolo `< />`.
- **Etiqueta (`#tag`):** losango azul com símbolo `#` conectando todas as notas que compartilham aquele tema.
- **Selo de Grau de Conexão:** o pequeno número no canto superior direito de cada nó mostra quantas conexões diretas ele possui — destacando naturalmente os tópicos centrais dos seus estudos ou projetos.

### Barra Lateral Retrátil e Filtros Avançados
- **Catálogo Lateral Retrátil:** alterne entre as abas **Notas** e **Etiquetas**, filtre por título ou pasta, localize um item no mapa com um clique ou recolha a coluna pelo botão no canto superior esquerdo para ter um canvas em tela cheia.
- **Barra de Controle Superior:**
  - **Localizar nó no mapa:** centraliza e destaca qualquer nota ou tag instantaneamente.
  - **Filtros por Pasta e Etiqueta:** isole apenas um projeto, disciplina ou cliente.
  - **Botões `# Etiquetas` e `Isoladas`:** mostre ou oculte pontes por tags e notas ainda sem conexões.
  - **Profundidade de Vizinhança:** alterne entre **Visão Global** ou foco local de **1, 2 ou 3 saltos** a partir do nó selecionado.

---

## 4. Inspeção Rápida e Editor Completo em Modal

Você não precisa sair do mapa de conexões para ler ou editar seus documentos:

- **Clique simples em um nó:** seleciona o item, ilumina todas as suas arestas diretas no grafo e exibe seus vínculos no inspetor.
- **Duplo clique em uma nota (ou botão de janela na lista lateral):** abre o **Modal de Editor Completo** flutuando sobre o grafo — com todas as ferramentas do editor rico Tiptap (incluindo Templates, Fórmulas, Tabelas e Vínculos) ou do Monaco Editor para notas de código!

> [!TIP]
> Qualquer nova etiqueta ou link `[[Nota]]` adicionado dentro do modal de edição atualiza as conexões do grafo em tempo real assim que a alteração é salva.

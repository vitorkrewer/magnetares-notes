# Guia do usuário

## Navegação básica

O Magnetares usa três painéis:

1. **Barra lateral:** todas as notas, pastas, Pastas Inteligentes, etiquetas e lixeira.
2. **Lista de notas:** busca e seleção de notas do contexto atual.
3. **Editor:** título, etiquetas, formatação e conteúdo da nota selecionada.

O botão de recolher a barra lateral amplia a área do editor. A rolagem da nota fica na borda direita do painel do editor e aparece de maneira discreta quando há conteúdo extenso.

## Criar e editar

- Clique em **Nova nota** ou use `Ctrl+N` (`Cmd+N` no macOS).
- Edite título e conteúdo; o salvamento é automático com debounce e fila serial por nota.
- O estado no topo do editor alterna entre **Salvando…**, **Salvo** e **Falha ao salvar**.
- `Ctrl+F` ou `Cmd+F` move o foco para a busca.

## Formatação

A barra do editor oferece:

- Corpo, Título e Subtítulo.
- Negrito, itálico e destaque.
- Listas com marcadores e listas numeradas.
- Checklists; marque a caixa para concluir um item.
- Citações.
- Tabelas com cabeçalho; dentro de uma tabela surgem controles para adicionar linha, coluna ou remover a tabela.
- Cálculos: use o botão de cálculo, informe uma expressão matemática e insira o resultado; dê duplo clique no chip para editar.

O editor persiste um documento estruturado Tiptap no banco local e gera `bodyText` para busca e prévias.

## Organização

### Pastas e subpastas

- Use o botão `+` da seção **Pastas** para criar uma pasta.
- Selecione uma pasta superior para criar uma subpasta.
- Arraste uma nota da lista para uma pasta na barra lateral para movê-la.
- Arraste uma pasta sobre outra pasta para transformá-la em subpasta.
- Use os chevrons da árvore para expandir ou recolher subpastas; a navegação permanece rolável para grandes coleções.
- O aplicativo impede ciclos, como uma pasta ser ancestral de si mesma.
- Não é possível excluir uma pasta que tenha notas ou subpastas.

### Notas fixadas

Use o ícone de alfinete no topo do editor. Notas fixadas aparecem primeiro nas listas compatíveis.

### Etiquetas

- Clique em **Etiqueta** abaixo do título.
- Escreva uma etiqueta e pressione `Enter`.
- O caractere `#` é opcional; `trabalho` e `#trabalho` representam a mesma etiqueta.
- Clique no `×` de um chip para removê-lo.

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

### Imprimir

Use o botão de impressora. O diálogo nativo do sistema é aberto; o CSS de impressão oculta a navegação, toolbars e controles para gerar um documento limpo ou PDF.

## Sincronização opcional

O app funciona sem configuração de nuvem. Para usar suas notas em outro computador:

1. Abra **Preferências > Nuvem & Turso**.
2. Informe a URL do seu banco Turso e o token de acesso.
3. Clique em **Conectar Turso**.
4. Clique em **Sincronizar agora com a Nuvem**.
5. No novo computador, informe a mesma URL e o mesmo token, conecte e sincronize para popular o banco local.

O token é guardado pelo cofre de credenciais do sistema. Consulte [API e sincronização](api-and-sync.md) e [Segurança](security.md).
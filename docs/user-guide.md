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
- Hyperlinks: selecione um texto, use o botão de link e informe uma URL `http://` ou `https://`; o mesmo controle edita ou remove o link.
- Bloco de código com highlight: ative o bloco e escolha a linguagem na toolbar. Linguagens comuns incluem JavaScript, TypeScript, Go, Python, JSON, HTML, CSS e Markdown.
- Tabelas com cabeçalho; dentro de uma tabela surgem controles para adicionar/excluir linha, adicionar/excluir coluna ou remover a tabela inteira.
- Cálculos: use o botão de cálculo, informe uma expressão matemática e insira o resultado; dê duplo clique no chip para editar.

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

### Imprimir

Use o botão de impressora. O diálogo nativo do sistema é aberto; o CSS de impressão oculta a navegação, toolbars e controles para gerar um documento limpo ou PDF.

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
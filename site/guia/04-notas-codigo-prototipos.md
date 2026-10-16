# Notas de Código & Protótipos

Para engenheiros de software, cientistas da computação e desenvolvedores em geral, o Magnetares Notes oferece **Notas de Código Dedicadas**, integrando a mesma engine do **Visual Studio Code (Monaco Editor)** diretamente no aplicativo.

![Editor de Código com Monaco Editor e Syntax Highlighting](assets/screenshots/code-editor.png)

---

## 1. Criando uma Nota de Código

Ao invés de embutir pequenos trechos no meio de um texto comum, você pode criar uma nota onde o documento inteiro é um arquivo de código puro:

1. Na barra superior da lista de notas, clique no botão **`< >` (Novo código)** ao lado de "Nova nota".
2. Digite o título do arquivo (ex: `backend_storage.go`, `schema.sql` ou `app.tsx`).
3. O editor carrega o motor Monaco com numeração de linhas, minimapa opcional, indentação inteligente e realce de sintaxe em tempo real.

---

## 2. Suporte a Múltiplas Linguagens e Color Badges

No topo do editor de código, um seletor visual permite escolher a linguagem de programação ativa:

![Editor de Código com TypeScript e Badges Coloridos](assets/screenshots/code-editor-typescript.png)

- **Linguagens Suportadas:** Go, TypeScript, JavaScript, Python, Rust, C, C++, Java, C#, SQL, HTML, CSS, JSON, YAML, Shell/Bash, Markdown e texto puro.
- **Color Badges na Barra Lateral:** Na lista de notas, as notas de código exibem uma insígnia colorida com o ícone e a cor oficial da linguagem (ex: azul-celeste para Go, amarelo para JS, azul-marinho para TypeScript, verde para Python), permitindo identificar seus gists e scripts rapidamente com os olhos!
- **Cópia em 1 Clique:** Um botão *"Copiar"* na barra superior copia o conteúdo do código na íntegra para a sua área de transferência com confirmação visual *"Copiado!"*.

---

## 3. Apresentação & Live Preview de Protótipos Web

Ao selecionar as linguagens **HTML**, **CSS** ou **JavaScript**, o Magnetares Notes ativa automaticamente a ferramenta **Visualizar Protótipo**:

![Código HTML com Botão de Live Preview](assets/screenshots/html-code.png)

### Como Usar o Live Preview:
1. Redija ou cole seu código de protótipo (pode ser uma página HTML completa com tags `<style>` e `<script>` integradas).
2. Na barra de ferramentas, um botão dourado **Visualizar Protótipo** surgirá em destaque.
3. Ao clicar, o aplicativo abre um modal em tela cheia renderizando o código ao vivo em um ambiente sandbox seguro:

![Visualização Interativa do Protótipo Web](assets/screenshots/html-preview.png)

4. O protótipo é interativo: você pode clicar em botões, preencher formulários e inspecionar transições CSS na hora, funcionando como um laboratório de rascunhos de frontend e prototipação rápida de UI.
5. Pressione `<kbd>Esc` para fechar o preview e retornar instantaneamente ao código.

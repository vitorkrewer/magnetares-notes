# Modo Foco (Janela Independente / Picture-in-Picture)

Destaque da versão **1.9.0**, o **Modo Foco em Janela Independente** transforma a maneira como você assiste a aulas, consome videoaulas ou estuda com livros e slides abertos na tela.

![Modo Foco com Janela Independente Lado a Lado no Magnetares Notes](assets/screenshots/focus-mode.png)

---

## 1. O Problema de Negociar Espaço na Tela

Quem estuda no computador frequentemente enfrenta uma disputa por centímetros de tela:
- De um lado, a videoaula no navegador, o reprodutor de vídeo ou o leitor de PDF do artigo acadêmico.
- Do outro, a janela inteira do aplicativo de notas, ocupando metade do monitor com barras laterais, listas de pastas e controles desnecessários naquele momento.
- Se o aplicativo usasse um modal flutuante interno, você ficava bloqueado de consultar suas tarefas ou outras notas sem fechar a janela.

---

## 2. A Solução: Foco sem Isolamento

O Magnetares Notes resolve essa fricção criando uma **janela nativa e independente do sistema operacional**:

1. No topo de qualquer nota aberta, clique no botão com ícone de Picture-in-Picture (**Modo Foco**).
2. A nota se desvincula da janela principal e surge em uma janela limpa, minimalista e dedicada.
3. Posicione-a em qualquer canto da tela, ajuste seu tamanho livremente ou mova-a para um **segundo monitor**.

---

## 3. Principais Recursos do Modo Foco

### Fixar no Topo (*Always-on-Top*)
Na barra de título da janela destacada, clique no ícone de alfinete para ativar o modo flutuante. A janela permanecerá visível sobre qualquer outro aplicativo, navegador ou reprodutor de mídia, mesmo quando você clicar no vídeo para pausar ou avançar.

### Navegação Total no Aplicativo Principal
Enquanto a nota está aberta na janela de foco, a aplicação principal **continua 100% aberta, navegável e funcional**:
- Você pode consultar tarefas pendentes na seção de Listas;
- Navegar por outras pastas e abrir outros cadernos de estudo;
- Organizar stickers e verificar referências bibliográficas.

No editor da janela principal, um card translúcido e discreto avisa que o *Modo Foco está Ativado*, com um botão direto para **Retornar edição para esta janela**.

### Sincronização em Tempo Real
A comunicação entre a janela destacada e o aplicativo principal ocorre de forma instantânea através de uma camada bidirecional (`BroadcastChannel`) e do motor SQLite WAL. Cada palavra digitada na janela de foco é persistida com total segurança.

### Controles Ágeis de Teclado
- **Fechar e Retornar:** Pressione `<kbd>Esc` a qualquer momento na janela de foco. Ela grava todas as alterações no banco e devolve a edição imediatamente à janela principal.
- **Forçar Salvamento:** Pressione `<kbd>Ctrl+S` ou `<kbd>Cmd+S`.
- **Impressão Direta:** Você pode imprimir e gerar PDFs de alta fidelidade com rodapé institucional diretamente a partir da janela de foco!

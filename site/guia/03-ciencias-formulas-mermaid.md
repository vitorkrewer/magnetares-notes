# Fórmulas, Ciências & Diagramas

A versão **1.9.0** do Magnetares Notes inaugura uma suíte de alta produtividade para estudantes e profissionais de **Engenharia, Física, Matemática, Química, Medicina e Biologia**. Todos os motores gráficos e matemáticos foram embutidos localmente no binário, permitindo criar equações e diagramas complexos **sem qualquer conexão com a internet**.

---

## 1. Fórmulas Matemáticas com LaTeX (KaTeX Local-First)

O Magnetares Notes integra a biblioteca de alta performance **KaTeX** diretamente no editor TipTap:

![Fórmulas Matemáticas com KaTeX no Magnetares Notes](assets/screenshots/formulas-katex.png)

### Dois Modos de Equação:
1. **Fórmulas em Linha (Inline):** Inseridas diretamente no fluxo do parágrafo, ideais para referenciar variáveis e expressões no meio do texto:
   ```latex
   A constante de Planck reduzida é dada por $\hbar = \frac{h}{2\pi}$.
   ```
2. **Fórmulas em Bloco Centralizado (Display Mode):** Blocos destacados em moldura dedicada com fundo suave e tipografia ampliada, perfeitos para deduções e leis fundamentais:
   ```latex
   $$\oint \mathbf{B} \cdot d\mathbf{l} = \mu_0 \left( I_{\text{enc}} + \varepsilon_0 \frac{d\Phi_E}{dt} \right)$$
   ```

### Teclado Visual de Símbolos de Engenharia
Ao clicar no botão **$\Sigma$** na barra de ferramentas ou ao pressionar duplo clique em uma fórmula existente, abre-se o modal interativo com **Live Preview em tempo real**:

![Modal com Teclado Visual de Símbolos](assets/screenshots/modal-teclado-simbolos.png)

O modal inclui um teclado com chips clicáveis categorizados:
- **Básico:** Frações `\frac{a}{b}`, raízes $\sqrt{x}$ e $\sqrt[n]{x}$, potências $x^2$, subscritos $x_i$, $\pm$, $\times$, $\approx$, $\le$, $\ge$, $\infty$.
- **Cálculo & Física:** Integrais definidas $\int_a^b$, integrais duplas $\iint$, somatórios $\sum$, derivadas parciais $\frac{\partial f}{\partial x}$, limites $\lim$, vetores $\vec{v}$, gradiente $\nabla$.
- **Letras Gregas:** Alfabeto grego completo em minúsculas e maiúsculas ($\alpha, \beta, \gamma, \Delta, \theta, \lambda, \mu, \pi, \rho, \sigma, \tau, \omega, \Omega$).
- **Modelos de Engenharia:** Templates prontos para Bhaskara, Lei de Ohm, Matrizes $2 \times 2$ e $3 \times 3$, Lei de Gauss e $E = m c^2$.

> [!TIP]
> Você pode selecionar qualquer trecho de fórmula no seu texto e clicar no botão **$\Sigma$**: o conteúdo selecionado será automaticamente encapsulado no editor de equações!

---

## 2. Notação Química e Bioquímica (`mhchem`)

Para cursos de **Farmácia, Medicina, Química e Biomedicina**, o motor do Magnetares suporta a extensão `mhchem`:

- Use a macro `\ce{...}` dentro da fórmula para formatar reações estequiométricas com setas, equilíbrios, elétrons e estados físicos:
  - **Tampão bicarbonato sanguíneo:**
    ```latex
    $$\ce{CO2 + H2O <=> H2CO3 <=> H+ + HCO3-}$$
    ```
  - **Respiração Celular / Oxidação da Glicose:**
    ```latex
    $$\ce{C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O + \text{energia (ATP)}}$$
    ```
  - **Equações Termoelétricas e Pilha de Daniell:**
    ```latex
    $$\ce{Zn(s) + Cu^2+(aq) -> Zn^2+(aq) + Cu(s)}$$
    ```

---

## 3. Destaques Acadêmicos (*Callouts*)

Os **Callouts Acadêmicos** são blocos semânticos com borda colorida acentuada, ícones dedicados e fundo suave:

- 💡 **Nota / Informação:** Apontamentos gerais, dicas e ideias de estudo.
- 📐 **Teorema / Definição:** Leis da física, definições matemáticas formais e corolários.
- 🔬 **Experimento / Laboratório:** Protocolos experimentais, reagentes, medições e ensaios clínicos.
- ⚠️ **Alerta Clínico / Aviso:** Cuidados com contraindicações, riscos elétricos ou armadilhas conceituais.
- ⚡ **Exemplo Prático:** Aplicações de engenharia, exercícios resolvidos e casos práticos.

Para inserir um Callout, clique no botão com ícone de marcador na barra de ferramentas. Use o menu suspenso dentro do bloco para alternar o tipo a qualquer momento. Na exportação para Markdown, eles são convertidos automaticamente no formato padrão `> [!NOTE]`, `> [!WARNING]`, etc.

---

## 4. Blocos Expansíveis (*Toggles* / Estudo Ativo)

O método de **Recuperação Ativa (*Active Recall*)** é comprovado pela neurociência como uma das técnicas mais eficazes de retenção de conhecimento para provas, vestibulares e concursos.

![Toggles de Estudo Ativo e Auto-teste no Magnetares Notes](assets/screenshots/active-recall.png)

O Magnetares Notes permite criar blocos sanfonados onde você esconde a resposta ou dedução:

- **Pergunta no Cabeçalho:** O título do bloco aceita texto puro e inclusive fórmulas matemáticas LaTeX inline (ex: *Qual a derivada de $\int \sin(x)dx$?*).
- **Conteúdo Oculto:** O corpo interno pode conter qualquer tipo de mídia do editor: parágrafos, equações completas, imagens, tabelas e checklists.
- **Botão Rápido Revelar / Ocultar:** Clique no olho mágico no cabeçalho do bloco para espiar a resposta sem desorganizar a leitura.
- **Modo Auto-teste Global:** Clique no botão de alternância global na barra de ferramentas para **recolher todos os toggles da nota simultaneamente**, transformando suas anotações em um simulado interativo!

---

## 5. Diagramas Mermaid.js

Desenhar diagramas estruturais nunca foi tão simples. O Magnetares Notes embutiu o motor **Mermaid.js**, gerando diagramas vetoriais SVG de altíssima nitidez:

![Diagramas Mermaid.js de Bioquímica e Engenharia](assets/screenshots/diagramas-mermaid.png)

### Modelos Rápidos de 1 Clique:
Ao clicar no ícone de diagrama na barra de ferramentas, você tem acesso a modelos prontos para:
1. **Ciclos Bioquímicos e Rotas Metabólicas:** Ciclo do Ácido Cítrico (Krebs), Glicólise e Cadeia Respiratória.
2. **Feedback Fisiológico & Homeostase:** Regulação neuroendócrina da glicemia por insulina e glucagon.
3. **Fluxogramas de Engenharia & Processos:** Nós de decisão condicional, sensores industriais e atuadores.
4. **Diagramas de Sequência:** Comunicação entre microsserviços, clientes e banco de dados.
5. **Máquinas de Estados:** Autômatos finitos, lógica de firmware e protocolos de comunicação.
6. **Mapas Mentais (Mindmaps):** Estruturas radiais hierárquicas para memorização.
7. **Modelagem de Dados (ER):** Entidades, chaves primárias e relacionamentos com cardinalidade.

### Recursos Interativos:
- **Duplo Clique para Editar:** Dê duplo clique em qualquer diagrama renderizado para abrir o painel de código.
- **Controle de Zoom (50% a 200%):** Aproxime para inspecionar nós densos ou clique no botão de reset para visualização panorâmica.
- **Legenda da Figura:** Campo dedicado para nomear a figura acadêmica (ex: *Figura 1 — Cascata de Sinalização da Insulina*).

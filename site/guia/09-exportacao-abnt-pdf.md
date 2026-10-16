# Exportação ABNT (.docx), PDF & Markdown

O Magnetares Notes foi projetado para que seus pensamentos não fiquem presos dentro do aplicativo. Você pode exportar suas anotações para formatos abertos, relatórios normatizados ou documentos impressos profissionais com fidelidade tipográfica.

![Exportação de Artigos Acadêmicos no Padrão ABNT e Formatos do Editor](assets/screenshots/export-abnt.png)

---

## 1. Exportação de Artigos Acadêmicos no Padrão ABNT (.docx)

Uma das maiores inovações da **versão 1.9.0** é a geração nativa de documentos Microsoft Word (`.docx`) em conformidade com as normas da **ABNT (Associação Brasileira de Normas Técnicas)**:

- **Geração 100% Offline e em Memória:** O arquivo `.docx` é compilado diretamente no seu computador pelo motor interno do Magnetares, sem depender de internet, servidores de nuvem ou assinaturas do Microsoft 365.
- **Margens Oficiais da ABNT (NBR 14724):**
  - Superior: **3,0 cm**
  - Esquerda: **3,0 cm**
  - Inferior: **2,0 cm**
  - Direita: **2,0 cm**
- **Tipografia e Espaçamento Normatizados:**
  - Corpo do texto em fonte **Arial tamanho 12 pt** com cor preto puro;
  - Espaçamento entre linhas de **1,5 linha**;
  - Recuo de primeira linha nos parágrafos de **1,25 cm**.
- **Numeração Progressiva de Seções (NBR 6024):** Título principal do artigo centralizado em 14 pt negrito maiúsculo; títulos primários, secundários e terciários recebem diferenciação tipográfica normativa (caixa alta, negrito e itálico regulamentares).
- **Citações Longas Diretas (NBR 10520):** Citações textuais com mais de 3 linhas recebem automaticamente recuo de **4,0 cm à esquerda**, fonte tamanho **10 pt**, espaçamento simples entre linhas e eliminação das aspas.
- **Tabelas Acadêmicas Normatizadas (IBGE / ABNT):** Bordas horizontais superior e inferior nítidas, sem bordas verticais externas laterais, texto em 10 pt, numeração consecutiva com título acima (*"Tabela 1 — ..."*) e indicação de autoria abaixo (*"Fonte: ..."*).
- **Fórmulas e Diagramas Técnicos:** Centralização de equações matemáticas e diagramas estruturados com identificação numerada de figura.
- **Seção de Referências Bibliográficas (NBR 6023):** Alinhamento justificado à esquerda, espaçamento simples entre linhas e separação padronizada entre obras individuais.

### Como Exportar para ABNT:
1. Abra a nota acadêmica desejada.
2. No canto superior direito do editor, abra o menu dropdown de **Exportar**.
3. Selecione a opção **Artigo ABNT (.docx)**.
4. Escolha onde salvar o arquivo no seu computador. O documento abre perfeitamente no Word, LibreOffice Writer e Google Docs!

---

## 2. Motor de Impressão e PDF de Alta Fidelidade

Ao pressionar `<kbd>Ctrl+P` ou clicar no botão de impressora na barra superior, o Magnetares aciona o motor de renderização `@media print`:

- **Fundo 100% Branco Puro:** Diferente de navegadores comuns que imprimem molduras cinzas nas bordas da página A4, o Magnetares redefine o canvas raiz para branco absoluto, gerando impressões limpas e econômicas para qualquer impressora física.
- **Rodapé Institucional Padronizado:** Cada página do PDF recebe na base uma linha divisória elegante com a assinatura oficial:
  ```text
  Gerado via Magnetares Notes            Título da Nota • Data de Edição
  ```
- **Título Semântico Nativo (`<h1>`):** Evita que títulos longos sejam truncados ou cortados nas quebras de página.
- **Tabelas com Layout Automático e Cabeçalhos Contínuos:** As tabelas adaptam a largura das colunas organicamente, impedindo quebras indevidas de palavras (como *"Inconsistências"*), e repetem o cabeçalho (`thead`) automaticamente no topo de todas as páginas seguintes.
- **Prevenção contra Quebras Órfãs:** Fórmulas matemáticas em bloco (`$$...$$`), diagramas Mermaid.js, caixas de destaque (callouts), itens de tarefas e linhas de tabelas são protegidos com `break-inside: avoid !important`, garantindo que nunca sejam fatiados ao meio na quebra de página.

---

## 3. Exportação e Importação Fiel em Markdown e HTML

O Magnetares Notes possui suporte simétrico ao ecossistema Markdown:

- **Exportar Markdown (.md):** Salva o arquivo em formato legível preservando fórmulas matemáticas padrão (`$latex$` e `$$latex$$`), diagramas (```` ```mermaid ````), checklists (`- [ ]`), tabelas e metadados.
- **Importação com Compilação Completa:** Ao importar arquivos `.md`, `.markdown` ou `.txt`, o aplicativo interpreta títulos, negritos, listas, tabelas e callouts, convertendo-os diretamente em nós ricos e editáveis do TipTap sem achatar seu texto em blocos planos.
- **Exportação HTML Estático:** Gera um arquivo `.html` autossuficiente com estilização embutida, pronto para ser aberto em qualquer navegador ou compartilhado por e-mail.

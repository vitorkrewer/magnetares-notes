# Listas & Tarefas

Introduzido na versão **1.8.0**, o módulo de **Listas & Tarefas** é um sistema nativo de produtividade pessoal e gerenciamento de pendências, totalmente integrado ao armazenamento SQLite local e à sincronização na nuvem.

![Módulo de Listas & Tarefas com Prioridades Semânticas e Painel Inspector](assets/screenshots/tasks.png)

---

## 1. A Hierarquia em Quatro Níveis

Para evitar o caos das listas de afazeres genéricas, o Magnetares estrutura suas pendências em quatro camadas lógicas:

1. **Listas de Tarefas:** Agrupamentos temáticos de alto nível (ex.: *Entrada*, *Faculdade*, *Trabalho*, *Projetos Pessoais*, *Compras*).
2. **Tarefas:** A pendência individual, com título, data de vencimento, nível de prioridade e status de conclusão.
3. **Subtarefas (Checklist Decomposta):** Pequenos passos acionáveis dentro de uma tarefa. Conforme você marca os itens, uma barra de progresso proporcional é preenchida dinamicamente.
4. **Múltiplas Notas por Tarefa:** Bloco contextual onde você pode anexar quantas notas ricas forem necessárias para documentar aquela tarefa, cada uma com seu próprio carimbo de data/hora.

---

## 2. A Lista Padrão de Triagem (*Entrada*)

O Magnetares Notes provisiona automaticamente a lista protegida **"Entrada"** (`list-inbox`):
- Ela funciona como sua caixa de entrada rápida para capturar ideias ou tarefas urgentes antes de decidir a qual projeto ou matéria pertencem.
- Por segurança do fluxo de trabalho, a lista *Entrada* é protegida contra exclusão acidental ou arquivamento.

---

## 3. Barra de Entrada Rápida (*Quick-Add*)

No topo da lista de tarefas ativa, você encontra a barra de captura instantânea:

1. Digite o título da pendência no campo de texto.
2. Selecione a **Prioridade Semântica**:
   - 🔥 **Alta** (*Vermelho*): Urgências e entregas críticas.
   - ⚠️ **Média** (*Laranja*): Tarefas importantes do dia a dia.
   - ⬇️ **Baixa** (*Azul*): Pendências secundárias ou sem prazo rígido.
   - ➖ **Nenhuma** (*Neutro*): Afazeres corriqueiros.
3. Defina a **Data de Vencimento** através do seletor rápido com cálculo de prazos relativos (*Hoje*, *Amanhã*, *Próxima semana*).
4. Pressione `<kbd>Enter` ou clique no botão de confirmação. A tarefa é criada imediatamente na lista ativa!

---

## 4. O Painel Lateral Inspector

Ao clicar sobre qualquer tarefa da lista central, o painel lateral **Inspector** é aberto para detalhamento aprofundado:

- **Edição Direta do Título:** Altere o nome da tarefa a qualquer momento.
- **Mover entre Listas:** Utilize o menu suspenso para transferir a tarefa para outra lista temática.
- **Decomposição em Subtarefas:** Adicione subtarefas em um clique. Conforme as caixas são marcadas, o indicador percentual e a barra visual de progresso são atualizados em tempo real.
- **Notas Contextuais Anexas:** Clique em *+ Adicionar nota à tarefa* para registrar anotações de reuniões, links úteis ou passos executados. Cada nota possui data própria e pode ser editada ou removida individualmente.

---

## 5. Arquivamento Inteligente de Listas (*Soft-Delete*)

Ao concluir um semestre na faculdade ou finalizar um projeto de pesquisa, você não precisa excluir a lista para despoluir sua barra lateral:

- Passe o cursor sobre a lista na barra lateral e selecione o botão **Arquivar Lista**.
- A lista sai da visualização ativa e passa a residir na seção recolhível **"Arquivadas (N)"** no rodapé do módulo.
- Ao clicar em uma lista arquivada, ela é exibida em **Modo Consulta**, com um banner informativo e um botão **Desarquivar Lista** para restaurá-la a qualquer momento em 1 clique!

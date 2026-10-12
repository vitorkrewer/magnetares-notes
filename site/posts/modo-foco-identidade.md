# Aulas da faculdade, foco e o caminho para a v1.9.0

A aula continua no canto esquerdo da tela. No direito, tento registrar uma ideia antes que ela desapareça.

Mas ali está a barra lateral, a lista de notas, os botões, as pastas — tudo útil, mas tudo competindo por alguns centímetros de tela. Em poucos minutos, eu já não estou apenas assistindo à aula ou escrevendo: estou negociando espaço com a interface.

Foi numa dessas aulas que percebi o que faltava ao Magnetares Notes. Eu não queria uma tela cheia que me isolasse do resto do computador. Queria uma nota pequena, livre e presente; um lugar para pensar que pudesse ficar ao lado da aula, sem esconder o restante da minha rotina.

---

## O incômodo de negociar espaço na tela

Quem estuda pelo computador — seja em aulas remotas com slides e PDFs abertos, seja na faculdade presencial anotando enquanto faz pesquisas paralelas — conhece bem essa fricção. O tempo precisa ser dividido entre acompanhar o professor, pesquisar referências e sintetizar o conteúdo em palavras próprias.

Quando eu tentava usar o aplicativo aberto ao lado do navegador, a interface acabava engolindo metade do monitor. Eu só precisava de um espaço limpo para escrever, sem distrações.

Inicialmente, cheguei a pensar na solução mais comum: um modal flutuante dentro do próprio aplicativo. Parecia fazer sentido no papel. Mas bastou uma aula para a ideia ruir na prática. No meio de uma explicação, eu precisava checar a data de entrega de um trabalho na lista de tarefas ou conferir uma fórmula guardada em outra pasta. O modal me bloqueava por inteiro. Fechar a anotação, navegar até a outra pasta e reabrir o modal quebrava completamente o fio da meada.

Foi aí que me fiz uma pergunta simples:  
*Por que não permitir que a nota se destaque em uma janela própria, independente e leve, parecida com um "Picture-in-Picture" de vídeo, enquanto todo o restante do Magnetares continua aberto e acessível em segundo plano?*

---

## A solução natural: foco sem isolamento

A ideia que guiará a futura versão 1.9.0 nasceu dessa necessidade de foco autêntico: dar liberdade para posicionar o pensamento onde ele for mais útil, sem amarras.

Em vez de prender a anotação dentro do aplicativo principal, libertei-a para o sistema operacional:
- **Janela independente:** Um clique no botão de Modo Foco na nota e ela se abre em uma janela leve e dedicada. Ela aceita o encaixe automático do Windows ao lado do vídeo, pode ir para um segundo monitor ou ficar quietinha em um canto da tela.
- **Acesso livre ao restante do app:** Enquanto a anotação está destacada, a aplicação principal continua 100% viva. Posso consultar listas de tarefas, riscar pendências ou pesquisar em outras pastas sem interromper a nota aberta.
- **Fixar no topo (Always-on-Top):** Adicionei um botão de alfinete na barra da janela para que ela não se escondesse no fundo ao clicar no player de vídeo ou alternar entre abas do navegador.
- **Fechamento invisível:** Um simples toque em `Esc` fecha a janela, grava tudo no banco SQLite local e devolve a edição imediatamente ao aplicativo principal.

---

## Cuidando dos detalhes

Aproveitei o dia também para alinhar os detalhes visuais com essa sensação de calma:
- **Ícones refinados:** Redesenhei os ícones do aplicativo para os temas claro e escuro em formato arredondado (*squircle*), trazendo mais harmonia para a barra de tarefas e a navegação.
- **Cores mais suaves:** No aplicativo principal, o aviso do Modo Foco no tema claro ganhou tons delicados em âmbar translúcido, trocando blocos pesados por um visual leve e acolhedor para longas sessões de leitura.

---

## O valor de construir para o próprio uso

Desenvolver um projeto sozinho tem seus desafios, mas traz uma clareza que nenhum planejamento abstrato consegue substituir: quando você usa a ferramenta diariamente, as necessidades reais se revelam quase sozinhas.

Essa janela destacada nem estava no meu cronograma original para este mês. Mas bastou usá-la em uma única tarde de estudos para perceber que ela se tornou indispensável — daquelas funcionalidades que, depois que você experimenta, não entende como conseguia produzir sem ela. Não se trata de inflar o software com recursos vazios, mas de resolver uma fricção real da vida cotidiana.

Essa experiência do Modo Foco ainda está sendo lapidada e será a grande estrela da **versão 1.9.0**, que trarei em breve assim que todos os detalhes de estabilidade estiverem perfeitos. No horizonte, também estou preparando suporte aprimorado para fórmulas matemáticas e diagramas, pensando especialmente em quem lida com matérias de exatas.

Se você também estuda, programa ou passa horas dividindo a tela entre referências e cadernos, espero de verdade que esse cuidado torne seus momentos de aprendizado mais leves e fluidos.

Até a próxima...

---

*Acompanhe o desenvolvimento pelo [GitHub](https://github.com/vitorkrewer/magnetares-notes).*

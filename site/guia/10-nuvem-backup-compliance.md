# Nuvem, Backup & Integridade

O Magnetares Notes foi projetado sob o lema: **"Seus dados são seus, e ficam no seu computador"**. O aplicativo funciona plenamente sem internet. No entanto, quando você precisa de mobilidade entre diferentes máquinas, a sincronização em nuvem e os backups locais oferecem segurança e redundância total.

![Sincronização na Nuvem com Turso no Magnetares Notes](assets/screenshots/sync.png)

---

## 1. Conectando a Nuvem Opcional (Turso / libSQL)

O Magnetares utiliza a tecnologia **libSQL / Turso**, um banco de dados distribuído SQLite em nuvem de baixíssima latência:

1. Clique no ícone de engrenagem no rodapé da barra lateral (**Preferências**).
2. Selecione a aba **Sincronização**.
3. Insira a **URL do banco de dados na nuvem** (ex: `libsql://meu-banco-usuario.turso.io`).
4. Cole o seu **Token de Autenticação** fornecido pelo Turso.
5. Clique em **Testar Conexão** para validar a comunicação e a latência.
6. Clique em **Conectar Nuvem** e, em seguida, em **Sincronizar agora com a Nuvem**.

> [!IMPORTANT]
> **Segurança de Credenciais:** Seu token de autenticação nunca é salvo em texto puro nos arquivos do app. Ele é armazenado com criptografia no **cofre de credenciais nativo do seu sistema operacional** (Windows Credential Manager, Apple Keychain ou Secret Service no Linux).

---

## 2. Sincronização Automática em Segundo Plano

Após conectar a nuvem, você pode definir a frequência da sincronização automática:
- **Desativada:** Apenas sincroniza quando você clicar no botão manual.
- **A cada 5 minutos:** Recomendado para quem trabalha com dois computadores abertos simultaneamente.
- **A cada 15 ou 30 minutos:** Equilíbrio perfeito entre economia e continuidade.
- **A cada hora:** Ideal para backups periódicos.

O ícone de nuvem no rodapé da barra lateral exibe o status em tempo real:
- 🟢 **Nuvem Ativa:** Sincronizado e operando normalmente.
- 🟡 **Sincronizando...:** Transferência de mutações e downloads pendentes em andamento.
- ⚪ **Armazenamento Local:** Modo padrão 100% offline.

---

## 3. Resolução Inteligente de Conflitos

Quando você edita a mesma nota em dois computadores diferentes enquanto estava offline:
- O Magnetares **nunca apaga silenciosamente sua versão local**.
- O sistema utiliza a regra *Last-Write-Wins (LWW)* combinada com detecção de revisão.
- Em caso de conflito real, um diálogo transparente oferece três opções:
  1. **Manter Minha Versão:** Rebaseia suas edições locais sobre a versão da nuvem.
  2. **Usar Versão da Nuvem:** Substitui a nota local pela cópia remota mais recente.
  3. **Mesclar Conteúdo:** Preserva o conteúdo local no topo e anexa a versão remota na mesma nota, com separador e indicação de data para você comparar com calma.
- **Segurança de Lápides (*Tombstones*):** Notas ou listas excluídas geram registros de exclusão que impedem que itens deletados "ressuscitem" na nuvem.

---

## 4. Aparência, Banco de Dados Local & Backup (v2.0.0)

Na versão **2.0.0**, o painel **Preferências & Configurações** foi reorganizado em quatro abas diretas (**Geral**, **Armazenamento**, **Sincronização** e **Sobre**):

### Tema Claro & Escuro (Aba Geral)
![Preferências Gerais e Alternância de Tema](assets/screenshots/settings-general.png)

- Escolha entre **Claro** (aparência limpa e clara) e **Escuro** (modo noturno para conforto visual).
- **Alternância Rápida na Barra Lateral:** Você também pode alternar o tema instantaneamente pelo botão dedicado (**Sol / Lua**) no rodapé da barra lateral, ao lado do ícone de configurações.

### Troca Segura do Local do Banco, Backup & Restauração (Aba Armazenamento)
![Painel de Armazenamento, Backup e Auditoria de Compliance](assets/screenshots/settings.png)

1. **Alterar Local do Banco (.db):** Clique em **Procurar...** para escolher outra pasta ou unidade. Antes de aplicar, o sistema inspeciona o destino e abre um modal guiado para você escolher entre **Copiar dados atuais** (com verificação de integridade), **Usar banco existente no destino** ou **Iniciar banco limpo**, gerando sempre um backup automático de segurança. Caso deseje voltar ao padrão do sistema, clique em **Restaurar local padrão**.
2. **Backup & Restauração:** Clique em **Fazer Backup Local** para gerar uma cópia íntegra do seu banco SQLite com data e hora no nome do arquivo. Para restaurar uma versão anterior, clique em **Restaurar de Backup** e selecione o arquivo `.db` desejado.

---

## 5. Auditoria de Conformidade e Compliance de Dados

Se você utiliza o Magnetares há várias versões ou importou milhares de notas de outros sistemas, o motor de auditoria garante a integridade estrutural do seu banco:

1. Em **Preferências > Armazenamento**, clique em **Executar Auditoria de Compliance**.
2. O sistema executa uma varredura transacional que:
   - Identifica e reatribui notas órfãs para a pasta padrão (*"Notas"*);
   - Repara hierarquias de pastas legadas e impede ciclos de ancestralidade;
   - Recalcula contadores de checklists e metadados de busca em texto puro (`bodyText`);
   - Normaliza marcas temporais e limpa conflitos resolvidos.
3. Um relatório detalhado com a lista de correções executadas é apresentado na tela.

---

## 6. Aba Sobre & Verificação de Atualizações

![Aba Sobre e Verificação de Atualizações](assets/screenshots/settings-about.png)

1. Na aba **Sobre**, você visualiza a versão instalada, a data da compilação e os links oficiais do projeto.
2. O aplicativo verifica silenciosamente na inicialização se há uma nova versão publicada no GitHub (exibindo um aviso discreto no canto inferior direito quando houver novidade).
3. Você também pode checar manualmente a qualquer momento clicando em **Verificar atualizações**.

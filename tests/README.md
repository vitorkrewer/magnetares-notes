# Laboratorio de sincronizacao

Este modulo exercita a API real do projeto contra um Turso fake local. O fake implementa o protocolo HTTP pipeline usando SQLite em memoria, portanto o teste cobre:

- inicializacao do schema remoto pela API;
- precondicao de revisao (`baseRevision`);
- concorrencia entre cinco computadores;
- conflitos HTTP 409 sem sobrescrever o estado local do cliente;
- idempotencia de retry pelo `mutationId`;
- cursores e snapshots historicos;
- resolucao posterior de um conflito sobre a revisao mais recente.

## Executar

A partir da raiz do repositorio:

```powershell
Set-Location tests
go test -v -count=1 .
```

No Windows, o wrapper equivalente e:

```powershell
./run-five-computers.ps1
```

No Linux/macOS:

```bash
sh ./run-five-computers.sh
```

O teste compila um binario temporario de `apps/api` e o inicia como subprocesso, portanto nao depende do launcher `go run` nem de um banco Turso real.

## Cenario

1. Um computador cria a nota inicial na revisao 1.
2. Cinco computadores fazem pull e passam a conhecer a mesma revisao.
3. Os cinco enviam uma edicao diferente simultaneamente, usando `baseRevision = 1`.
4. Exatamente uma escrita deve ser aceita; as outras quatro devem receber conflito.
5. O retry da escrita vencedora deve retornar o mesmo resultado, sem criar nova revisao.
6. O cursor deve devolver snapshots distintos das revisoes 1 e 2.
7. Um dos computadores conflitantes faz rebase na revisao 2 e publica sua versao como revisao 3.

O teste registra cada computador, revisao, cursor e resultado HTTP para facilitar a leitura do protocolo.

## Extensao

Para criar novos cenarios, reutilize `newFakeTurso`, `startAPI`, `pullChanges`, `putNote` e `computer`. Mantenha cada teste focado em uma propriedade de integridade: uma unica escrita vencedora, nenhum rollback silencioso, cursor monotonicamente crescente e retry idempotente.

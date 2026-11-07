# Predator 2 — contrato entre o ares-web e o coletor

O ares-web **só grava configuração** nas tabelas `predator_*`. O predator2 **lê essa configuração, executa e grava o histórico**. Ares Web 2.0, predator2 e o Postgres rodam cada um na sua LXC no Proxmox, e as duas aplicações só se falam pelo Postgres; o ares-web nunca chama a LXC do predator. A VPS3 fica só para backup (dump do Postgres).

```
┌──────────── LXC ares-web 2.0 ────────────┐        ┌──────────── LXC predator2 ────────────┐
│ /predator (tela admin)                    │        │ scheduler (systemd, loop de 60 s)      │
│   PATCH /api/predator/jobs/:id  ──────┐   │        │   ├─ lê predator_jobs                  │
│   POST  /api/predator/jobs/:id/run ───┤   │        │   ├─ executa plugin do relatório       │
│   GET   /api/predator/execucoes  ◄──┐ │   │        │   └─ grava predator_execucoes          │
└─────────────────────────────────────┼─┼──┘        └──────────────┬─────────────────────────┘
                                      │ ▼                          │
                               ┌──────┴──────── Postgres ares_bi (LXC própria, rede interna) ┐
                               │ predator_jobs · predator_execucoes · predator_alteracoes     │
                               │ view predator_jobs_status                                    │
                               └──────────────────────────────────────────────────────────────┘
```

Schema: [`db/migrations/001_predator_control.sql`](../db/migrations/001_predator_control.sql).

## Tabelas

| Tabela | Quem escreve | Para quê |
|---|---|---|
| `predator_jobs` | ares-web (tela) | Um job por relatório: ligado/desligado, intervalos, janela diurna, pausa, parâmetros, "rodar agora" |
| `predator_execucoes` | predator2 | Uma linha por execução: status, duração, registros, erro |
| `predator_alteracoes` | ares-web | Auditoria: quem mudou o quê e quando |
| `predator_jobs_status` (view) | — | Job + última execução + falhas 24h + próxima execução prevista. Usada pela tela e pela futura I.A do WhatsApp |

## O que o scheduler do predator2 faz a cada ciclo (60 s)

1. **Limpa execuções travadas**: `UPDATE predator_execucoes SET status='timeout', finalizado_em=now() WHERE status='executando' AND iniciado_em < now() - (timeout_seg do job) * interval '1 second'`.
2. **Escolhe os jobs vencidos** lendo `predator_jobs_status`:
   - pedido manual: `execucao_solicitada_em > coalesce(ultimo_inicio, '-infinity')` → roda mesmo se o job estiver desligado (útil para testar);
   - agendado: `ativo AND (pausado_ate IS NULL OR pausado_ate <= now()) AND proxima_execucao_prevista <= now()`.
3. **Pega a trava** com `INSERT INTO predator_execucoes (job_id, origem, host, versao) VALUES (...) RETURNING id`. Se der violação de unicidade (`predator_execucoes_um_executando`), outro processo já está rodando o job; pula.
4. **Executa o plugin** do job (`tipo` + `id`), passando `parametros`, `tabela_destino` e `modo_gravacao`.
5. **Finaliza**: `UPDATE predator_execucoes SET status, finalizado_em=now(), duracao_ms, registros, erro, log WHERE id=...`. Em erro, se `tentativa < max_tentativas`, insere nova linha com `origem='retentativa'`.

A configuração é relida a cada ciclo, então uma mudança na tela vale em até 1 minuto, sem reiniciar o serviço.

## Plugins

Cada relatório é um módulo com a mesma interface, por exemplo em Python:

```python
class Relatorio106:
    id = "r106"
    def coletar(self, sessao_brudam, parametros) -> list[dict]: ...
    def gravar(self, conn, linhas, tabela, modo) -> int: ...
```

Acrescentar uma função nova = escrever um plugin e cadastrar uma linha em `predator_jobs`. O núcleo (scheduler, trava, histórico) não muda.

## Segurança

- Credenciais do Brudam e do banco ficam em `/etc/predator2/env` (permissão 600) carregado pelo systemd via `EnvironmentFile=`. Nada de senha no repositório.
- Postgres na própria LXC, escutando só na rede interna do Proxmox (nada exposto na internet); backup diário para a VPS3; o usuário do predator2 tem permissão de escrita só nas tabelas que ele alimenta e em `predator_execucoes`. O usuário do ares-web precisa de `UPDATE` em `predator_jobs` e `INSERT` em `predator_alteracoes`, e leitura no resto.
- Todas as consultas parametrizadas; o ares-web só aceita uma lista fechada de campos (`lib/predator.ts`).
- As rotas `/api/predator/*` exigem sessão com `role = admin`.

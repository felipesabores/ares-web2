<p align="center">
  <img src="public/logo.png" alt="ARES Logo" width="120" />
</p>

```
 █████╗ ██████╗ ███████╗███████╗    ██╗    ██╗███████╗██████╗
██╔══██╗██╔══██╗██╔════╝██╔════╝    ██║    ██║██╔════╝██╔══██╗
███████║██████╔╝█████╗  ███████╗    ██║ █╗ ██║█████╗  ██████╔╝
██╔══██║██╔══██╗██╔══╝  ╚════██║    ██║███╗██║██╔══╝  ██╔══██╗
██║  ██║██║  ██║███████╗███████║    ╚███╔███╔╝███████╗██████╔╝
╚═╝  ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝     ╚══╝╚══╝╚══════╝╚═════╝
```

> **ARES 2.0.** Este repositório é a versão 2.0 do ARES Web, criada a partir do `ares-web` em 07/11/2026. Roda separado da produção: LXC própria no Proxmox, banco Postgres próprio e alimentado pelo `ares-predator2`. Nenhuma credencial fica no código; veja `.env.example`.

# ARES Web — Dashboard Operacional

Dashboard em tempo real para monitoramento de operações e logística da **Acerta Express**. Exibe KPIs, gráficos e tabelas de CTe com dados extraídos diretamente do banco de dados operacional.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Componentes | shadcn/ui + Radix UI |
| Gráficos | Recharts + react-simple-maps |
| Banco de dados | PostgreSQL via `node-postgres` (`pg`) |
| Animações | Framer Motion |
| Linguagem | TypeScript |

## Acesso

> **https://ares.acertaexpress.app**

## Funcionalidades

- **KPIs em tempo real** — Em Movimento, Entregas, Em Atraso, SAC Aberto, Coletas Pendentes, AWBs, Remessas e Performance
- **Performance** — Mapa coroplético do Brasil por UF, gráfico de atraso, projeção 7 dias, tabela de CTes em trânsito, ranking por responsável
- **Canhotos / SAC** — KPIs de ocorrências, pizzas por tipo e atendente, tabela de canhotos
- **Gauge de performance** — Indicador radial com faixas verde/amarelo/vermelho (≥90% / ≥70% / <70%)
- **Mapa coroplético do Brasil** — Emissões por UF destino com gradiente de intensidade e tooltip interativo
- **Gráficos** — Tipo de Serviço (donut), AWBs por Status (donut), Atraso por UF, Coletas por Responsável
- **Tabela de CTe** — Últimas emissões com busca por minuta, cliente ou destino (até 300 registros)
- **Portal Cliente** — Visão consolidada por cliente com 9 colunas de KPIs
- **Painel Comercial (`/comercial`)** — 5 KPIs definidos pela diretoria (Faturamento Dia/Mensal/Médio 3M, Qtd Entregas, Lucro Op. Trimestre) + gráfico Comparativo Receita Mensal × Média Trimestral com histórico longo via backfill 147
- **Sidebar colapsável** — Navegação lateral com ícones e link externo para Grafana
- **Atualização manual** — Botão de sync no header com timestamp da última atualização

## Estrutura

```
app/
  page.tsx              # Dashboard principal
  layout.tsx            # Layout raiz com sidebar
  globals.css           # Estilos globais
  performance/          # Página de performance operacional
  canhotos/             # Página de canhotos e SAC
  emissoes/             # Emissões por período
  awbs/                 # AWBs por status
  coletas/              # Coletas por responsável
  remessas/             # Remessas
  comercial/            # Painel comercial (ex-financeiro) — KPIs de faturamento + lucro
  cliente/              # Portal cliente
  api/
    kpis/route.ts       # KPIs consolidados
    performance/route.ts# KPIs + mapa + tabela de performance
    emissoes/route.ts   # Emissões por UF, serviço e atraso
    emissoes/timeline/  # Timeline de emissões
    awbs/route.ts       # AWBs por status
    awbs/tabela/        # Tabela de AWBs
    coletas/route.ts    # Coletas por responsável
    coletas/tabela/     # Tabela de coletas
    canhotos/route.ts   # Canhotos + SAC KPIs
    canhotos/tabela/    # Tabela de canhotos
    remessas/route.ts   # Remessas
    comercial/route.ts  # KPIs do Painel Comercial + chart Comparativo (UNION 3 tabelas)
    sac/route.ts        # Ocorrências SAC
    cte/route.ts        # Relação de CTe em trânsito
components/
  charts/               # KpiCard, DonutChart, SimpleTable, EmptyState
  BrazilMapChart.tsx    # Mapa coroplético do Brasil
  PageHeader.tsx        # Header com título, refresh e timestamp
  ui/                   # Componentes shadcn/ui
lib/
  db.ts                 # Pool de conexão PostgreSQL
  utils.ts              # Helpers (cn)
```

## APIs

| Rota | Descrição |
|---|---|
| `GET /api/kpis` | Contadores principais |
| `GET /api/performance` | KPIs, mapa, projeção 7d, tabela CTes em trânsito |
| `GET /api/emissoes` | Agrupamentos por UF, serviço e atraso |
| `GET /api/awbs` | AWBs por status |
| `GET /api/coletas` | Coletas por responsável |
| `GET /api/canhotos` | KPIs + pizzas de SAC |
| `GET /api/canhotos/tabela` | Tabela de canhotos |
| `GET /api/sac` | SAC por status |
| `GET /api/cte` | CTes em trânsito (até 300 registros) |
| `GET /api/comercial` | 5 KPIs do Painel Comercial + `timeline_comparativo` (UNION `custos_operacao_historico` + `custos_operacao` + `emissoes` com `MAX` por mês) |

## Banco de Dados

Conecta a um PostgreSQL externo (`ares_bi`). As credenciais vêm de variáveis de ambiente (veja `.env.example`):

```env
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
```

Tabelas utilizadas:

| Tabela | Origem | Usada por |
|---|---|---|
| `emissoes` | sync diário 106 SEM RECEBEDOR (UPSERT por MINUTA) | `/performance`, `/comercial`, demais |
| `coletas`, `awbs`, `remessas`, `canhotos`, `pereciveis`, `cotacoes` | sync diário (TRUNCATE+INSERT) | rotas correspondentes |
| `custos_operacao` | sync diário relatório 147 (TRUNCATE+INSERT, janela Jan/26+) | `/comercial` (Card 5 + chart) |
| `custos_operacao_historico` | backfill manual mensal (cron dia 1) — ver `ares-predator/backfill_147.py` | `/comercial` (chart Comparativo) |

## Como rodar

```bash
npm install
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # build de produção
npm run start   # servidor de produção
npm run lint    # lint
```

## Deploy

Rodando em produção via **Dokploy** na VPS Hetzner (`173.249.15.221`) com Docker.

```bash
# Build da imagem
docker build -t ares-web .

# Rodar localmente
docker run -p 3000:3000 ares-web
```

O `Dockerfile` usa build multi-stage (node:22-alpine): `deps → builder → runner`.  
**Importante:** `npm ci --legacy-peer-deps` é necessário devido ao conflito de peer deps do `react-simple-maps@3` com React 19.

| Serviço | Endereço |
|---|---|
| Dashboard | https://ares.acertaexpress.app |
| VPS | `173.249.15.221` |
| Dokploy | `http://173.249.15.221:3000` |

---

ARES Intelligence © Acerta Express

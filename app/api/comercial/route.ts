import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { CLIENTE_GRUPOS, cnpjGrupoValuesSQL } from "@/lib/cliente-grupos";
import {
  clienteFilterSQL, clientesAvulsosSQL, clienteNomeId, lerPeriodo, periodoSQL,
} from "@/lib/comercial-filtro";

const TTL_MS = 10 * 60 * 1000;

export const revalidate = 0;

// Parse Brazilian number format "1.234,56" → numeric
function campo(col: string) {
  return `COALESCE(
    NULLIF(
      REPLACE(REGEXP_REPLACE(dados->>'${col}', '[^0-9,]', '', 'g'), ',', '.'),
      ''
    )::numeric, 0
  ) / 100.0`;
}

const BRUTO   = campo("TOTAL COBRADO");
const LIQUIDO = campo("FRETE S/ICMS");
const ICMS    = campo("ICMS");
const FRETE   = campo("FRETE PESO");
const ADV     = campo("AD VALOREM");
const REDESP  = campo("REDESPACHO");
const COLETA  = campo("EXC. COLETA");
const ENTREGA = campo("EXC. ENTREGA");

// Specs definitivas dos KPIs do Painel Comercial (diretoria 2026-05-27):
// - Faturamento usa coluna "FRETE TOTAL" do relatório 106 (decimal já com ponto, parse direto)
// - Data de referência é "DATA" (= data de emissão, formato DD/MM/YYYY)
const FRETE_TOTAL = `COALESCE(NULLIF(dados->>'FRETE TOTAL','')::numeric, 0)`;

// O Postgres roda em UTC, mas a operação é em Brasília. Sem isso, a partir
// das 21h BRT (00h UTC do dia seguinte), "hoje" e o corte do mês pulam de dia.
const HOJE_BR = `((NOW() AT TIME ZONE 'America/Sao_Paulo')::date)`;

const DATE_VALID = `dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
  AND TO_DATE(dados->>'DATA','DD/MM/YYYY') BETWEEN '2000-01-01' AND '2030-12-31'`;

function kpiQuery(where: string, cnpjFilter = "TRUE") {
  return `
    SELECT
      COALESCE(SUM(${BRUTO}),   0)::float AS bruto,
      COALESCE(SUM(${LIQUIDO}), 0)::float AS liquido,
      COALESCE(SUM(${ICMS}),    0)::float AS icms,
      COALESCE(SUM(${FRETE}),   0)::float AS frete_peso,
      COALESCE(SUM(${ADV}),     0)::float AS ad_valorem,
      COALESCE(SUM(${REDESP}),  0)::float AS redespacho,
      COALESCE(SUM(${COLETA}),  0)::float AS exc_coleta,
      COALESCE(SUM(${ENTREGA}), 0)::float AS exc_entrega,
      COUNT(*)::int                         AS total
    FROM emissoes
    WHERE ${DATE_VALID} AND ${where} AND ${cnpjFilter}
  `;
}

export async function GET(req: NextRequest) {
  const clienteId = req.nextUrl.searchParams.get("cliente") ?? "";
  const mesParam  = (req.nextUrl.searchParams.get("mes") ?? "").trim();
  const periodo   = lerPeriodo(req.nextUrl.searchParams);
  const cacheKey  = `comercial:${clienteId}:${mesParam}:${periodo ? `${periodo.de}..${periodo.ate}` : ""}`;

  const data = await withCache(cacheKey, TTL_MS, async () => {
  // Grupo conhecido (CNPJs) ou qualquer outro cliente do 106 pelo nome.
  const CNPJ_FILTER = clienteFilterSQL(clienteId);
  const temCliente  = CNPJ_FILTER !== "TRUE";
  // Discover the most recent month available in the DB
  const [anchor] = await query(`
    SELECT
      TO_CHAR(MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY')), 'YYYY-MM-DD') AS max_date,
      TO_CHAR(MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY')), 'YYYY-MM') AS max_mes,
      TO_CHAR(MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY')), 'YYYY') AS max_ano
    FROM emissoes
    WHERE ${DATE_VALID}
  `) as { max_date: string; max_mes: string; max_ano: string }[];

  const maxMes = anchor.max_mes; // e.g. "2022-03"

  // ── Seletor de mês retroativo ────────────────────────────────────────────
  // ?mes=YYYY-MM. Ausente/inválido ou == maxMes → modo AO VIVO (comportamento
  // original 100% intacto). Mês passado válido → modo MÊS FECHADO (mês inteiro).
  const mesValido = /^\d{4}-\d{2}$/.test(mesParam) && mesParam <= maxMes;
  const anchorMes = mesValido ? mesParam : maxMes;           // mês de referência
  const anchorAno = anchorMes.slice(0, 4);
  const isClosed  = mesValido && mesParam < maxMes;          // mês passado (fechado)

  // Âncora temporal única que alimenta TODAS as janelas de faturamento.
  // Ao vivo  → hoje (mês parcial, 1→hoje). Fechado → último dia do mês escolhido
  // (mês inteiro). Trocar HOJE_BR por REF_DATE re-escopa tudo de uma vez.
  const REF_DATE = isClosed
    ? `(DATE_TRUNC('month', DATE '${anchorMes}-01') + INTERVAL '1 month' - INTERVAL '1 day')::date`
    : HOJE_BR;

  // Dynamic period expressions based on selected/most-recent month
  const MES_AT  = `TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') = '${anchorMes}'`;
  const MES_ANT = `TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') = TO_CHAR((TO_DATE('${anchorMes}-01','YYYY-MM-DD') - INTERVAL '1 month'), 'YYYY-MM')`;
  const ANO_AT  = `TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY') = '${anchorAno}'`;
  const ANO_ANT = `TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY') = '${String(parseInt(anchorAno) - 1)}'`;

  // Most recent day in data and the day before
  const HOJE  = `TO_DATE(dados->>'DATA','DD/MM/YYYY') = '${anchor.max_date}'`;

  // ── Período livre (?de=&ate=) ────────────────────────────────────────────
  // Quando informado, vale para os totais do período, rankings, mapa, modal,
  // composição e o gráfico de evolução. Os cards diários/mensais (ontem, hoje,
  // mês, mês anterior, média 3 meses) seguem o seletor de mês.
  const JANELA = periodo ? periodoSQL(periodo) : MES_AT;
  // Período anterior de mesma duração, para o delta dos totais.
  const PERIODO_ANT = periodo
    ? `TO_DATE(dados->>'DATA','DD/MM/YYYY') BETWEEN
         (DATE '${periodo.de}' - (DATE '${periodo.ate}' - DATE '${periodo.de}' + 1))
         AND (DATE '${periodo.de}' - 1)`
    : "FALSE";
  const ONTEM = `TO_DATE(dados->>'DATA','DD/MM/YYYY') = ('${anchor.max_date}'::date - INTERVAL '1 day')::date`;

  // Meses disponíveis pro dropdown (fonte = emissoes_dia, a mesma dos cards),
  // do mais recente pro mais antigo, no máximo 6.
  const mesesDisp = await query(`
    SELECT DISTINCT TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') AS mes
    FROM emissoes_dia WHERE ${DATE_VALID}
    ORDER BY mes DESC LIMIT 6
  `) as { mes: string }[];
  const mesesDisponiveis = mesesDisp.map(r => r.mes);

  const [
    hoje,
    ontem,
    mesAtual,
    mesAnterior,
    anoAtual,
    anoAnterior,
    timelineMensal,
    timelineDiaria,
    porUF,
    porServico,
    porModal,
    topClientes,
    componentes,
    kpisNovos,
    trimFechado,
    timelineComparativo,
    fatDiaAntRows,
    periodoRows,
    clientesAvulsos,
  ] = await Promise.all([

    query(kpiQuery(HOJE,    CNPJ_FILTER)),
    query(kpiQuery(ONTEM,   CNPJ_FILTER)),
    query(kpiQuery(MES_AT,  CNPJ_FILTER)),
    query(kpiQuery(MES_ANT, CNPJ_FILTER)),
    query(kpiQuery(ANO_AT,  CNPJ_FILTER)),
    query(kpiQuery(ANO_ANT, CNPJ_FILTER)),

    // Evolução mensal — lê de emissoes_dia (snapshot full sem SEM RECEBEDOR).
    // emissoes perde notas entregues (UPSERT por minuta + delete), inflando só o mês
    // corrente. emissoes_dia tem cobertura uniforme da janela do scraper 106 (Jan/26 →
    // hoje), então o gráfico mostra os ~6 meses cobertos pelo snapshot, sem buracos.
    query(`
      SELECT
        TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'), 'YYYY-MM') AS mes,
        COALESCE(SUM(${BRUTO}),       0)::float AS bruto,
        COALESCE(SUM(${LIQUIDO}),     0)::float AS liquido,
        COALESCE(SUM(${ICMS}),        0)::float AS icms,
        COALESCE(SUM(${FRETE_TOTAL}), 0)::float AS receita,
        COUNT(*)::int                            AS total
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${CNPJ_FILTER}
        AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= '${anchor.max_date}'::date
        AND ${periodo ? periodoSQL(periodo) : "TRUE"}
      GROUP BY mes ORDER BY mes
    `),

    // Receita diária — mês mais recente disponível
    query(`
      SELECT
        TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'), 'YYYY-MM-DD') AS dia,
        COALESCE(SUM(${BRUTO}),   0)::float AS bruto,
        COALESCE(SUM(${LIQUIDO}), 0)::float AS liquido,
        COUNT(*)::int                         AS total
      FROM emissoes
      WHERE ${DATE_VALID} AND ${MES_AT} AND ${CNPJ_FILTER}
      GROUP BY dia ORDER BY dia
    `),

    // Top UFs — mês mais recente
    // Fonte: emissoes_dia (snapshot completo). emissoes subestimaria porque
    //   delete cascading de notas entregues reduz cobertura do mês corrente.
    query(`
      SELECT
        COALESCE(NULLIF(TRIM(dados->>'UF.1'),''), 'N/D') AS uf,
        COALESCE(SUM(${FRETE_TOTAL}), 0)::float AS bruto,
        COUNT(*)::int AS total
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${JANELA} AND ${CNPJ_FILTER}
      GROUP BY uf ORDER BY bruto DESC
    `),

    // Receita por serviço — mês mais recente
    query(`
      SELECT
        COALESCE(NULLIF(TRIM(dados->>'SERVIÇO'),''), 'Outros') AS servico,
        COALESCE(SUM(${BRUTO}), 0)::float AS bruto,
        COALESCE(SUM(${LIQUIDO}), 0)::float AS liquido,
        COUNT(*)::int AS total
      FROM emissoes
      WHERE ${DATE_VALID} AND ${JANELA} AND ${CNPJ_FILTER}
      GROUP BY servico ORDER BY bruto DESC LIMIT 8
    `),

    // Qtd entregas por MODAL (coluna K do relatório 106) — mês corrente.
    // Usado no donut "Modal de Transferência". Critério é COUNT (não SUM),
    // pra refletir distribuição operacional, não financeira.
    query(`
      SELECT
        COALESCE(NULLIF(TRIM(dados->>'MODAL'),''), 'Outros') AS modal,
        COUNT(*)::int AS qtd
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${JANELA} AND ${CNPJ_FILTER}
      GROUP BY modal ORDER BY qtd DESC
    `),

    // Top clientes — mês mais recente
    // Fonte: emissoes_dia (snapshot completo).
    // Métrica: FRETE TOTAL (faturamento puro, consistente com os cards
    // "Faturamento Mensal" / "Faturamento do Mês Anterior"). NÃO usar
    // TOTAL COBRADO aqui — inclui ad valorem/redespacho/etc, gera ~11%
    // a mais e ranking não reconcilia com card de Faturamento.
    // Agrupa CNPJs de grupos conhecidos (Aspen, Payot, Medlevensohn, Zydus etc.)
    // sob um label canônico via JOIN com VALUES do mapa cliente-grupos.ts.
    // CNPJs não mapeados caem no nome cru de dados->>'CLIENTE'.
    query(`
      WITH cnpj_grupo (cnpj, grupo) AS (VALUES ${cnpjGrupoValuesSQL()})
      SELECT
        COALESCE(g.grupo, NULLIF(TRIM(d.dados->>'CLIENTE'),''), 'Desconhecido') AS cliente,
        COALESCE(SUM(${FRETE_TOTAL}), 0)::float AS bruto,
        COUNT(*)::int AS total
      FROM emissoes_dia d
      LEFT JOIN cnpj_grupo g ON g.cnpj = d.dados->>'CNPJ'
      WHERE ${DATE_VALID} AND ${JANELA.replace(/dados->/g, "d.dados->")} AND ${CNPJ_FILTER.replace(/dados->/g, "d.dados->")}
      GROUP BY cliente ORDER BY bruto DESC LIMIT 10
    `),

    // Componentes de receita — mês mais recente
    // Fonte: emissoes_dia (snapshot completo). Mesmo motivo do Top UFs/clientes.
    query(`
      SELECT
        COALESCE(SUM(${FRETE}),   0)::float AS frete_peso,
        COALESCE(SUM(${ADV}),     0)::float AS ad_valorem,
        COALESCE(SUM(${REDESP}),  0)::float AS redespacho,
        COALESCE(SUM(${COLETA}),  0)::float AS exc_coleta,
        COALESCE(SUM(${ENTREGA}), 0)::float AS exc_entrega,
        COALESCE(SUM(${ICMS}),    0)::float AS icms,
        COALESCE(SUM(${BRUTO}),   0)::float AS bruto
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${JANELA} AND ${CNPJ_FILTER}
    `),

    // KPIs novos do Painel Comercial (specs diretoria 2026-05-27)
    // Todas as referências de "hoje" usam HOJE_BR (data em America/Sao_Paulo)
    // pra evitar virada de dia precoce porque o Postgres roda em UTC.
    //
    // Todos os KPIs do dia/mês leem de `emissoes_dia` — snapshot do 106 SEM o
    // filtro SEM RECEBEDOR, então inclui notas já entregues (que saíram do
    // em-trânsito). Cobre 01/01/2026 → hoje (mesma janela do scrape 106f).
    // Fallback p/ `emissoes` se emissoes_dia estiver vazia (1ª execução).
    query(`
      WITH full_src AS (
        SELECT
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') = ${REF_DATE}
          ), 0)::float AS fat_dia,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') = (${REF_DATE} - INTERVAL '1 day')::date
          ), 0)::float AS fat_ontem,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${REF_DATE})::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${REF_DATE}
          ), 0)::float AS fat_mes,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '1 month')::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= (${REF_DATE} - INTERVAL '1 month')::date
          ), 0)::float AS fat_mes_ant_janela,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '1 month')::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  DATE_TRUNC('month', ${REF_DATE})::date
          ), 0)::float AS fat_mes_anterior,
          COUNT(*) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${REF_DATE})::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${REF_DATE}
          )::int AS qtd_entregas_mes,
          COUNT(*) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '1 month')::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= (${REF_DATE} - INTERVAL '1 month')::date
          )::int AS qtd_entregas_mes_ant_janela,
          COALESCE(SUM(COALESCE(NULLIF(dados->>'VALOR SEGURADO R$','')::numeric, 0)) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${REF_DATE})::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${REF_DATE}
          ), 0)::float AS valor_carga_mes,
          COUNT(*)::int AS rows_total
        FROM emissoes_dia WHERE ${CNPJ_FILTER}
      ),
      fallback_src AS (
        SELECT
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') = ${REF_DATE}
          ), 0)::float AS fat_dia,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') = (${REF_DATE} - INTERVAL '1 day')::date
          ), 0)::float AS fat_ontem,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${REF_DATE})::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${REF_DATE}
          ), 0)::float AS fat_mes,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '1 month')::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= (${REF_DATE} - INTERVAL '1 month')::date
          ), 0)::float AS fat_mes_ant_janela,
          COALESCE(SUM(${FRETE_TOTAL}) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '1 month')::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  DATE_TRUNC('month', ${REF_DATE})::date
          ), 0)::float AS fat_mes_anterior,
          COUNT(*) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${REF_DATE})::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${REF_DATE}
          )::int AS qtd_entregas_mes,
          COUNT(*) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '1 month')::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= (${REF_DATE} - INTERVAL '1 month')::date
          )::int AS qtd_entregas_mes_ant_janela,
          COALESCE(SUM(COALESCE(NULLIF(dados->>'VALOR SEGURADO R$','')::numeric, 0)) FILTER (
            WHERE ${DATE_VALID}
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${REF_DATE})::date
              AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${REF_DATE}
          ), 0)::float AS valor_carga_mes
        FROM emissoes WHERE ${CNPJ_FILTER}
      )
      SELECT
        CASE WHEN full_src.rows_total > 0 THEN full_src.fat_dia              ELSE fallback_src.fat_dia              END AS fat_dia,
        CASE WHEN full_src.rows_total > 0 THEN full_src.fat_ontem            ELSE fallback_src.fat_ontem            END AS fat_ontem,
        CASE WHEN full_src.rows_total > 0 THEN full_src.fat_mes              ELSE fallback_src.fat_mes              END AS fat_mes,
        CASE WHEN full_src.rows_total > 0 THEN full_src.fat_mes_ant_janela   ELSE fallback_src.fat_mes_ant_janela   END AS fat_mes_ant_janela,
        CASE WHEN full_src.rows_total > 0 THEN full_src.fat_mes_anterior     ELSE fallback_src.fat_mes_anterior     END AS fat_mes_anterior,
        CASE WHEN full_src.rows_total > 0 THEN full_src.qtd_entregas_mes     ELSE fallback_src.qtd_entregas_mes     END AS qtd_entregas_mes,
        CASE WHEN full_src.rows_total > 0 THEN full_src.qtd_entregas_mes_ant_janela ELSE fallback_src.qtd_entregas_mes_ant_janela END AS qtd_entregas_mes_ant_janela,
        CASE WHEN full_src.rows_total > 0 THEN full_src.valor_carga_mes           ELSE fallback_src.valor_carga_mes           END AS valor_carga_mes
      FROM full_src, fallback_src
    `),

    // Card 4: faturamento médio dos 3 meses fechados anteriores ao corrente (soma/3)
    // Fonte: emissoes_dia (FRETE TOTAL = frete bruto cobrado, snapshot diário do 106).
    // ATENÇÃO: NÃO usar custos_operacao_historico.RECEITA — essa coluna é receita
    //   LÍQUIDA (~56% do frete bruto), inadequada pra um KPI rotulado "faturamento".
    //   emissoes_dia.FRETE TOTAL casa com o gráfico Comparativo e o card Receita Bruta.
    query(`
      SELECT
        TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'), 'YYYY-MM') AS mes,
        COALESCE(SUM(${FRETE_TOTAL}), 0)::float AS fat
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${CNPJ_FILTER}
        AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (DATE_TRUNC('month', ${REF_DATE}) - INTERVAL '3 months')::date
        AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  DATE_TRUNC('month', ${REF_DATE})::date
      GROUP BY mes ORDER BY mes
    `),

    // Gráfico "Comparativo Receita Mensal × Faturamento Médio do Último Trimestre"
    // Quando há filtro de cliente, usa só emissoes_dia (custos_operacao não tem CNPJ).
    query(temCliente ? `
      WITH hist AS (
        SELECT
          TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') AS mes,
          SUM(
            CASE
              WHEN dados->>'RECEITA' ~ ','          THEN REPLACE(REPLACE(dados->>'RECEITA','.',''),',','.')::numeric
              WHEN dados->>'RECEITA' ~ '^-?[0-9]+$' THEN (dados->>'RECEITA')::numeric / 100
              ELSE 0
            END
          ) AS receita
        FROM custos_operacao_historico
        WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
        GROUP BY mes
      ),
      atual AS (
        SELECT
          TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') AS mes,
          SUM(
            CASE
              WHEN dados->>'RECEITA' ~ ','          THEN REPLACE(REPLACE(dados->>'RECEITA','.',''),',','.')::numeric
              WHEN dados->>'RECEITA' ~ '^-?[0-9]+$' THEN (dados->>'RECEITA')::numeric / 100
              ELSE 0
            END
          ) AS receita
        FROM custos_operacao
        WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
        GROUP BY mes
      ),
      emi AS (
        SELECT
          TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') AS mes,
          SUM(${FRETE_TOTAL}) AS receita
        FROM emissoes_dia
        WHERE ${DATE_VALID}
        GROUP BY mes
      ),
      unioned AS (
        SELECT mes, receita FROM hist
        UNION ALL
        SELECT mes, receita FROM atual
        UNION ALL
        SELECT mes, receita FROM emi
      )
      SELECT
        mes,
        MAX(receita)::float AS receita
      FROM unioned
      WHERE mes >= '2025-02'
      GROUP BY mes
      ORDER BY mes
    ` : `
      SELECT
        TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') AS mes,
        COALESCE(SUM(${FRETE_TOTAL}), 0)::float AS receita
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${CNPJ_FILTER}
        AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= '2025-02-01'::date
      GROUP BY mes
      ORDER BY mes
    `),

    // Faturamento do dia anterior (penúltimo dia com dados — Option B)
    query(`
      WITH penultimo AS (
        SELECT DISTINCT TO_DATE(dados->>'DATA','DD/MM/YYYY') AS dt
        FROM emissoes_dia
        WHERE ${DATE_VALID} AND ${CNPJ_FILTER}
        ORDER BY dt DESC
        OFFSET 1 LIMIT 1
      )
      SELECT
        TO_CHAR(p.dt, 'DD/MM/YYYY') AS dia_label,
        COALESCE(SUM(${FRETE_TOTAL}), 0)::float AS fat
      FROM emissoes_dia e, penultimo p
      WHERE ${DATE_VALID} AND ${CNPJ_FILTER}
        AND TO_DATE(e.dados->>'DATA','DD/MM/YYYY') = p.dt
      GROUP BY p.dt
    `),

    // Totais do período livre + período anterior de mesma duração (só com ?de=&ate=)
    periodo ? query(`
      SELECT
        COALESCE(SUM(${FRETE_TOTAL}) FILTER (WHERE ${JANELA}), 0)::float      AS fat,
        COUNT(*) FILTER (WHERE ${JANELA})::int                                AS qtd,
        COALESCE(SUM(COALESCE(NULLIF(dados->>'VALOR SEGURADO R$','')::numeric, 0)) FILTER (WHERE ${JANELA}), 0)::float AS carga,
        COALESCE(SUM(${FRETE_TOTAL}) FILTER (WHERE ${PERIODO_ANT}), 0)::float AS fat_ant,
        COUNT(*) FILTER (WHERE ${PERIODO_ANT})::int                           AS qtd_ant
      FROM emissoes_dia
      WHERE ${DATE_VALID} AND ${CNPJ_FILTER}
    `) : Promise.resolve([]),

    // Todos os clientes do 106 fora dos grupos — alimenta o filtro de cliente.
    withCache("comercial:clientes-avulsos", TTL_MS, () =>
      query(clientesAvulsosSQL(cnpjGrupoValuesSQL())) as Promise<{ nome: string }[]>),
  ]);

  type KPI = {
    bruto: number; liquido: number; icms: number;
    frete_peso: number; ad_valorem: number; redespacho: number;
    exc_coleta: number; exc_entrega: number; total: number;
  };

  const h  = hoje[0]        as KPI;
  const on = ontem[0]       as KPI;
  const ma = mesAtual[0]    as KPI;
  const mp = mesAnterior[0] as KPI;
  const aa = anoAtual[0]    as KPI;
  const ap = anoAnterior[0] as KPI;

  const delta = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : null;

  const ticketAtual    = ma.total > 0 ? ma.bruto / ma.total : 0;
  const ticketAnterior = mp.total > 0 ? mp.bruto / mp.total : 0;

  // KPIs definitivos (specs diretoria 2026-05-27)
  type KpiRow = {
    fat_dia: number; fat_ontem: number;
    fat_mes: number; fat_mes_ant_janela: number;
    fat_mes_anterior: number;
    qtd_entregas_mes: number; qtd_entregas_mes_ant_janela: number;
    valor_carga_mes: number;
  };
  const k = kpisNovos[0] as KpiRow;
  const trim = trimFechado as { mes: string; fat: number }[];
  const fatMedio3M = trim.length > 0
    ? trim.reduce((s, r) => s + r.fat, 0) / 3   // soma / 3, igual à fórmula da diretoria
    : 0;

  const diaAnt = (fatDiaAntRows as { dia_label: string; fat: number }[])[0];

  const pr = (periodoRows as { fat: number; qtd: number; carga: number; fat_ant: number; qtd_ant: number }[])[0];
  const periodoKpis = periodo && pr ? {
    de: periodo.de, ate: periodo.ate,
    fat: pr.fat, fat_delta: delta(pr.fat, pr.fat_ant),
    qtd: pr.qtd, qtd_delta: delta(pr.qtd, pr.qtd_ant),
    carga: pr.carga,
    ticket: pr.qtd > 0 ? pr.fat / pr.qtd : 0,
  } : null;

  const kpis = {
    fat_dia_ant:                diaAnt?.fat ?? 0,
    fat_dia_ant_label:          diaAnt?.dia_label ?? "",
    fat_dia:                    k.fat_dia,
    fat_dia_delta:              delta(k.fat_dia, k.fat_ontem),
    fat_mes:                    k.fat_mes,
    fat_mes_delta:              delta(k.fat_mes, k.fat_mes_ant_janela),
    fat_mes_anterior:           k.fat_mes_anterior,
    fat_medio_3m:               fatMedio3M,
    fat_medio_3m_meses:         trim.map(r => r.mes),
    qtd_entregas_mes:           k.qtd_entregas_mes,
    qtd_entregas_mes_delta:     delta(k.qtd_entregas_mes, k.qtd_entregas_mes_ant_janela),
    valor_carga_mes:            k.valor_carga_mes,
  };

  return {
    kpis,
    periodo: { mes: anchorMes, ano: anchorAno, max_date: anchor.max_date, is_closed: isClosed, meses_disponiveis: mesesDisponiveis },
    periodo_livre: periodoKpis,
    hoje:         { ...h,  delta_bruto: delta(h.bruto,  on.bruto) },
    ontem:        on,
    mes_atual:    { ...ma, delta_bruto: delta(ma.bruto, mp.bruto), delta_total: delta(ma.total, mp.total), ticket: ticketAtual },
    mes_anterior: { ...mp, ticket: ticketAnterior },
    ano_atual:    { ...aa, delta_bruto: delta(aa.bruto, ap.bruto), delta_total: delta(aa.total, ap.total) },
    ano_anterior: ap,
    ticket:       { atual: ticketAtual, anterior: ticketAnterior, delta: delta(ticketAtual, ticketAnterior) },
    componentes:  componentes[0],
    timeline_mensal:  timelineMensal,
    timeline_comparativo: timelineComparativo,
    timeline_diaria:  timelineDiaria,
    por_uf:           porUF,
    por_servico:      porServico,
    por_modal:        porModal,
    top_clientes:     topClientes,
    grupos:           CLIENTE_GRUPOS.map(g => ({ id: g.id, label: g.label })),
    clientes:         (clientesAvulsos as { nome: string }[]).map(c => ({ id: clienteNomeId(c.nome), label: c.nome })),
    cliente_ativo:    clienteId || null,
  };
  });

  return NextResponse.json(data);
}

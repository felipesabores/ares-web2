import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { ENT, PREV, VALID, IS_METRO, VALOR, SITUACAO, REGIAO, REGIOES, isMes } from "@/lib/sla";

const TTL_MS = 10 * 60 * 1000;

export const revalidate = 0;

// SLA de entregas — baseado no relatório 106 (tabela emissoes_dia, que inclui
// notas ENTREGUES, ao contrário de `emissoes` que só tem em trânsito).
//
// Conceito (≠ do donut da Performance, que olha notas EM TRÂNSITO vs hoje):
// aqui olhamos só o que JÁ FOI ENTREGUE (COMPROVANTE ENTREGA='SIM') e comparamos
// a DATA ENTREGA real com a PREV. ENTREGA prometida. Período conta por DATA DE
// ENTREGA (o que foi entregue no mês), não por emissão.
// Regras (ENT/PREV/VALID/IS_METRO) vivem em lib/sla.ts — fonte única.
// Polo: Região Metropolitana × Interior, pelo cadastro de praças do Brudam.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const cacheKey = `sla:${sp.get("start") ?? ""}:${sp.get("end") ?? ""}:${sp.get("cliente") ?? ""}:${sp.get("uf_destino") ?? ""}:${sp.get("tabela_page") ?? "1"}:${sp.get("tabela_size") ?? "50"}:${sp.get("sort_by") ?? "data_entrega"}:${sp.get("sort_dir") ?? "desc"}`;

  const data = await withCache(cacheKey, TTL_MS, async () => {
  // Meses disponíveis (por data de entrega)
  const [anchor] = await query(`
    SELECT
      TO_CHAR(MAX(${ENT}), 'YYYY-MM') AS max_mes,
      TO_CHAR(MIN(${ENT}), 'YYYY-MM') AS min_mes
    FROM emissoes_dia WHERE ${VALID}
  `) as { max_mes: string; min_mes: string }[];

  const maxMes = anchor?.max_mes ?? "";
  const minMes = anchor?.min_mes ?? "";

  const startRaw    = sp.get("start")        ?? "";
  const endRaw      = sp.get("end")          ?? "";
  const clienteRaw  = sp.get("cliente")      ?? "";
  const ufDestinoRaw = sp.get("uf_destino")  ?? "";
  const tabelaPage  = Math.max(1, parseInt(sp.get("tabela_page") ?? "1", 10));
  const tabelaSize  = Math.min(200, Math.max(10, parseInt(sp.get("tabela_size") ?? "50", 10)));
  const tabelaOffset = (tabelaPage - 1) * tabelaSize;

  const SLA_SORT: Record<string, string> = {
    minuta:       `dados->>'MINUTA'`,
    emissao:      `TO_DATE(dados->>'DATA', 'DD/MM/YYYY')`,
    prev_entrega: PREV,
    data_entrega: ENT,
    atraso:       `(${ENT} - ${PREV})::int`,
    valor:        `(dados->>'VALOR')::float`,
    peso:         `(dados->>'PESO REAL')::float`,
    vol:          `(dados->>'VOL')::int`,
    cliente:      `TRIM(dados->>'CLIENTE')`,
    uf_destino:   `dados->>'UF.1'`,
  };
  const rawSortBy  = sp.get("sort_by")  ?? "data_entrega";
  const slaSortDir = sp.get("sort_dir") === "asc" ? "ASC" : "DESC";
  const slaSortExpr = SLA_SORT[rawSortBy] ?? ENT;
  const slaOrderBy  = `${slaSortExpr} ${slaSortDir}, dados->>'MINUTA' ${slaSortDir}`;
  const start = isMes(startRaw) ? startRaw : maxMes;
  const end   = isMes(endRaw)   ? endRaw   : maxMes;

  const periodo = `TO_CHAR(${ENT}, 'YYYY-MM') BETWEEN '${start}' AND '${end}'`;
  const clienteFiltro = clienteRaw
    ? `TRIM(dados->>'CLIENTE') = '${clienteRaw.replace(/'/g, "''")}'`
    : "TRUE";
  const ufFiltro = /^[A-Z]{2}$/.test(ufDestinoRaw)
    ? `dados->>'UF.1' = '${ufDestinoRaw}'`
    : "TRUE";
  const where = `${VALID} AND ${periodo} AND (${clienteFiltro}) AND (${ufFiltro})`;

  // Quebra por UF de destino (UF.1) de um balde de prazo — pros gráficos de barra.
  const ufBreakdown = (bucket: string) => query(`
    SELECT dados->>'UF.1' AS uf, COUNT(*)::int AS total
    FROM emissoes_dia
    WHERE ${where} AND dados->>'UF.1' ~ '^[A-Z]{2}$' AND (${bucket})
    GROUP BY 1
    ORDER BY total DESC, uf
  `) as Promise<{ uf: string; total: number }[]>;

  // Série histórica de atrasos por região — sempre últimos 6 meses (independente
  // do filtro DE/ATÉ da página), pra dar contexto de tendência.
  const atrasosRegiaoQuery = query(`
    WITH meses AS (
      SELECT TO_CHAR(gs, 'YYYY-MM') AS mes
      FROM generate_series(
        DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) - INTERVAL '5 months',
        DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date),
        '1 month'
      ) gs
    ),
    agg AS (
      SELECT
        TO_CHAR(${ENT}, 'YYYY-MM')             AS mes,
        ${REGIAO}                              AS regiao,
        COUNT(*)::int                          AS total,
        COUNT(*) FILTER (WHERE ${ENT} > ${PREV})::int AS atrasos
      FROM emissoes_dia
      WHERE ${VALID}
        AND ${ENT} >= (DATE_TRUNC('month', (NOW() AT TIME ZONE 'America/Sao_Paulo')::date) - INTERVAL '5 months')
        AND ${REGIAO} IS NOT NULL
      GROUP BY 1, 2
    )
    SELECT m.mes, a.regiao, COALESCE(a.total,0)::int AS total, COALESCE(a.atrasos,0)::int AS atrasos
    FROM meses m LEFT JOIN agg a ON a.mes = m.mes
    ORDER BY m.mes, a.regiao
  `) as Promise<{ mes: string; regiao: string | null; total: number; atrasos: number }[]>;

  // Lista de clientes disponíveis no período (sem filtro de cliente — pra popular o select)
  const clientesQuery = query(`
    SELECT TRIM(dados->>'CLIENTE') AS cliente, COUNT(*)::int AS total
    FROM emissoes_dia
    WHERE ${VALID} AND ${periodo}
      AND TRIM(dados->>'CLIENTE') != '' AND dados->>'CLIENTE' IS NOT NULL
    GROUP BY 1
    ORDER BY total DESC, cliente
  `) as Promise<{ cliente: string; total: number }[]>;

  // UFs de destino disponíveis no período (sem filtro de UF)
  const ufsQuery = query(`
    SELECT dados->>'UF.1' AS uf, COUNT(*)::int AS total
    FROM emissoes_dia
    WHERE ${VALID} AND ${periodo} AND dados->>'UF.1' ~ '^[A-Z]{2}$'
    GROUP BY 1
    ORDER BY total DESC, uf
  `) as Promise<{ uf: string; total: number }[]>;

  const tabelaQuery = query(`
    SELECT
      COUNT(*) OVER()                                        AS tabela_total,
      dados->>'MINUTA'                                       AS minuta,
      dados->>'TIPO EMISSAO'                                 AS tipo_emissao,
      dados->>'CTE/NFSE'                                     AS cte,
      dados->>'NF/DOC'                                       AS nf_doc,
      dados->>'DATA'                                         AS emissao,
      SUBSTRING(dados->>'PREV. ENTREGA', 1, 10)              AS prev_entrega,
      SUBSTRING(dados->>'DATA ENTREGA',  1, 10)              AS data_entrega,
      ${SITUACAO}                                            AS situacao,
      (${ENT} - ${PREV})::int                                AS atraso_dias,
      dados->>'VALOR'                                        AS valor,
      dados->>'PESO REAL'                                    AS peso_real,
      dados->>'VOL'                                          AS vol,
      TRIM(dados->>'CLIENTE')                                AS cliente,
      dados->>'ORIGEM'                                       AS origem,
      dados->>'UF'                                           AS uf_origem,
      dados->>'CIDADE.2'                                     AS destino,
      dados->>'UF.1'                                         AS uf_destino,
      dados->>'RESP ENTREGA'                                 AS resp_entrega
    FROM emissoes_dia
    WHERE ${where}
    ORDER BY ${slaOrderBy}
    LIMIT ${tabelaSize} OFFSET ${tabelaOffset}
  `) as Promise<{
    tabela_total: number; minuta: string; tipo_emissao: string; cte: string; nf_doc: string;
    emissao: string; prev_entrega: string; data_entrega: string; situacao: string; atraso_dias: number;
    valor: string; peso_real: string; vol: string; cliente: string; origem: string;
    uf_origem: string; destino: string; uf_destino: string; resp_entrega: string;
  }[]>;

  const [kpiRows, porUfNoPrazo, porUfAntes, porUfAtraso, atrasosRegiaoRows, clientesRows, ufsRows, tabelaRows] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (WHERE ${ENT} < ${PREV})::int          AS antes,
        COUNT(*) FILTER (WHERE ${ENT} = ${PREV})::int          AS no_prazo,
        COUNT(*) FILTER (WHERE ${ENT} > ${PREV})::int          AS fora,
        COUNT(*) FILTER (WHERE ${IS_METRO})::int               AS metropolitana,
        COALESCE(SUM(${VALOR}), 0)::float                                  AS valor_total,
        COALESCE(SUM(${VALOR}) FILTER (WHERE ${ENT} < ${PREV}), 0)::float  AS valor_antes,
        COALESCE(SUM(${VALOR}) FILTER (WHERE ${ENT} = ${PREV}), 0)::float  AS valor_no_prazo,
        COALESCE(SUM(${VALOR}) FILTER (WHERE ${ENT} > ${PREV}), 0)::float  AS valor_fora,
        COALESCE(SUM(${VALOR}) FILTER (WHERE ${IS_METRO}), 0)::float       AS valor_metropolitana
      FROM emissoes_dia
      WHERE ${where}
    `) as Promise<{
      total: number; antes: number; no_prazo: number; fora: number; metropolitana: number;
      valor_total: number; valor_antes: number; valor_no_prazo: number; valor_fora: number; valor_metropolitana: number;
    }[]>,
    ufBreakdown(`${ENT} = ${PREV}`),
    ufBreakdown(`${ENT} < ${PREV}`),
    ufBreakdown(`${ENT} > ${PREV}`),
    atrasosRegiaoQuery,
    clientesQuery,
    ufsQuery,
    tabelaQuery,
  ]);

  // Pivotea (mes, regiao) → 1 linha por mês com uma coluna por região.
  // Cada célula = { atrasos, total, pct }.
  const mesesUnicos = Array.from(new Set(atrasosRegiaoRows.map(r => r.mes))).sort();
  const atrasos_regiao = mesesUnicos.map(mes => {
    const row: Record<string, unknown> = { mes };
    for (const reg of REGIOES) {
      const cell = atrasosRegiaoRows.find(r => r.mes === mes && r.regiao === reg);
      const total = cell?.total ?? 0;
      const atrasos = cell?.atrasos ?? 0;
      row[reg] = {
        atrasos,
        total,
        pct: total > 0 ? (atrasos / total) * 100 : 0,
      };
    }
    return row;
  });

  const kpi = kpiRows[0];
  const total    = kpi?.total ?? 0;
  const antes    = kpi?.antes ?? 0;
  const noPrazo  = kpi?.no_prazo ?? 0;
  const fora     = kpi?.fora ?? 0;
  const metro    = kpi?.metropolitana ?? 0;
  const interior = total - metro;
  const slaPct   = total > 0 ? ((antes + noPrazo) / total) * 100 : 0;

  // Valor da mercadoria (VALOR do 106) por card. Interior = total − metropolitana.
  const vTotal    = kpi?.valor_total ?? 0;
  const vMetro    = kpi?.valor_metropolitana ?? 0;

  return {
    periodo: { start, end, max_mes: maxMes, min_mes: minMes },
    kpis: {
      total, antes, no_prazo: noPrazo, fora, metropolitana: metro, interior, sla_pct: slaPct,
      valor_total: vTotal,
      valor_antes: kpi?.valor_antes ?? 0,
      valor_no_prazo: kpi?.valor_no_prazo ?? 0,
      valor_fora: kpi?.valor_fora ?? 0,
      valor_metropolitana: vMetro,
      valor_interior: vTotal - vMetro,
    },
    clientes:       clientesRows.map(r => r.cliente),
    ufs_destino:    ufsRows.map(r => r.uf),
    por_uf_no_prazo: porUfNoPrazo,
    por_uf_antes:    porUfAntes,
    por_uf_atraso:   porUfAtraso,
    atrasos_regiao,
    tabela:       tabelaRows,
    tabela_total: tabelaRows[0]?.tabela_total ?? 0,
    tabela_page:  tabelaPage,
    tabela_size:  tabelaSize,
    sort_by:      rawSortBy,
    sort_dir:     slaSortDir.toLowerCase(),
    uf_destino:   ufDestinoRaw,
  };
  });

  return NextResponse.json(data);
}

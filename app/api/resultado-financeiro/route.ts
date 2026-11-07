import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withCache } from "@/lib/cache";

const TTL_MS = 10 * 60 * 1000;

export const revalidate = 0;

function campo(col: string) {
  return `
    CASE
      WHEN dados->>'${col}' ~ ','
        THEN REPLACE(REPLACE(dados->>'${col}', '.', ''), ',', '.')::numeric
      WHEN dados->>'${col}' ~ '^-?[0-9]+$'
        THEN (dados->>'${col}')::numeric / 100
      ELSE 0
    END
  `;
}

function campoPeso() {
  return `
    CASE
      WHEN dados->>'PESO' ~ ','
        THEN REPLACE(REPLACE(dados->>'PESO', '.', ''), ',', '.')::numeric
      WHEN dados->>'PESO' ~ '^-?[0-9]+$'
        THEN (dados->>'PESO')::numeric
      ELSE 0
    END
  `;
}

const FRETE         = campo("FRETE");
const RESULT        = campo("LUCRO LIQ");
const VALORNF       = campo("VALOR NF");
const PESO          = campoPeso();
const CUSTO_ENTREGA = campo("CUSTO ENTREGA");
const CUSTO_TRANSF  = campo("CUSTO TRANSF");
const CUSTO_COLETA  = campo("CUSTO COLETA");
const CUSTO_TOTAL   = campo("C.TOTAL");

const DATE_FILTER = `
  dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
  AND LENGTH(REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g')) >= 6
`;

function baseQuery(whereDate: string, whereCliente = "TRUE", whereTabela = "TRUE") {
  return `
    WITH dedup AS (
      SELECT DISTINCT ON (REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g'))
        dados
      FROM (
        SELECT dados, 1 AS src FROM custos_operacao_historico
        UNION ALL
        SELECT dados, 2 AS src FROM custos_operacao
      ) all_rows
      WHERE ${DATE_FILTER}
      ORDER BY REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g'), src
    )
    SELECT dados FROM dedup
    WHERE ${whereDate}
      AND ${whereCliente}
      AND ${whereTabela}
  `;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const cacheKey = `rf:${searchParams.get("start") ?? ""}:${searchParams.get("end") ?? ""}:${searchParams.get("cliente") ?? ""}:${searchParams.get("tabela_comercial") ?? ""}:${searchParams.get("resultado_filter") ?? ""}:${searchParams.get("tabela_page") ?? "1"}:${searchParams.get("tabela_size") ?? "50"}:${searchParams.get("sort_by") ?? "data"}:${searchParams.get("sort_dir") ?? "desc"}`;

  const data = await withCache(cacheKey, TTL_MS, async () => {
  const [anchor] = await query(`
    SELECT
      TO_CHAR(MAX(TO_DATE(dados->>'DATA', 'DD/MM/YYYY')), 'YYYY-MM') AS max_mes,
      TO_CHAR(MIN(TO_DATE(dados->>'DATA', 'DD/MM/YYYY')), 'YYYY-MM') AS min_mes
    FROM (
      SELECT dados FROM custos_operacao_historico WHERE ${DATE_FILTER}
      UNION ALL
      SELECT dados FROM custos_operacao WHERE ${DATE_FILTER}
    ) all_rows
  `) as { max_mes: string; min_mes: string }[];

  const maxMes = anchor?.max_mes ?? "";
  const minMes = anchor?.min_mes ?? "";

  const start           = searchParams.get("start")           ?? maxMes;
  const end             = searchParams.get("end")             ?? maxMes;
  const cliente         = searchParams.get("cliente")         ?? "";
  const tabelaComercial = searchParams.get("tabela_comercial") ?? "";
  const resultadoFilter = searchParams.get("resultado_filter") ?? "";
  const tabelaPage = Math.max(1, parseInt(searchParams.get("tabela_page") ?? "1", 10));
  const tabelaSize = Math.min(200, Math.max(10, parseInt(searchParams.get("tabela_size") ?? "50", 10)));
  const tabelaOffset = (tabelaPage - 1) * tabelaSize;

  const SORT_COLS: Record<string, string> = {
    data:      `TO_DATE(dados->>'DATA', 'DD/MM/YYYY')`,
    minuta:    `REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g')`,
    cliente:   `dados->>'CLIENTE TOMADOR'`,
    destino:   `dados->>'DESTINO'`,
    peso:      `(${PESO})`,
    frete:     `(${FRETE})`,
    resultado: `(${RESULT})`,
    valor_nf:  `(${VALORNF})`,
  };
  const rawSortBy  = searchParams.get("sort_by")  ?? "data";
  const sortDir    = searchParams.get("sort_dir") === "asc" ? "ASC" : "DESC";
  const sortExpr   = SORT_COLS[rawSortBy] ?? SORT_COLS["data"];
  const orderBy    = `${sortExpr} ${sortDir}`;

  const whereDate = `
    TO_CHAR(TO_DATE(dados->>'DATA', 'DD/MM/YYYY'), 'YYYY-MM')
    BETWEEN '${start}' AND '${end}'
  `;

  const safeCliente = cliente.replace(/'/g, "''");
  const whereCliente = cliente
    ? `dados->>'CLIENTE TOMADOR' = '${safeCliente}'`
    : "TRUE";

  const safeTabelaComercial = tabelaComercial.replace(/'/g, "''");
  const whereTabela = tabelaComercial
    ? `REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g') IN (SELECT id_minuta FROM emissoes WHERE dados->>'TABELA' = '${safeTabelaComercial}')`
    : "TRUE";

  const whereResultado = resultadoFilter === "lucro"
    ? `AND (${RESULT}) > 0`
    : resultadoFilter === "prejuizo"
      ? `AND (${RESULT}) < 0`
      : "";

  const evolucaoStart = maxMes
    ? `TO_CHAR((TO_DATE('${maxMes}-01','YYYY-MM-DD') - INTERVAL '11 months'), 'YYYY-MM')`
    : `'${minMes}'`;

  const [totaisRows, porUF, evolucao, clientesRows, porClienteRows, distMargemRows, custosRows, tabelaRows, topNegativosRows, porTabelaRows, tabelasRows] = await Promise.all([
    query(`
      SELECT
        COALESCE(SUM(${FRETE}),   0)::float AS faturamento,
        COALESCE(SUM(${RESULT}),  0)::float AS resultado,
        COALESCE(SUM(${PESO}),    0)::float AS peso,
        COALESCE(SUM(${VALORNF}), 0)::float AS valor_nf,
        COUNT(*)::int                         AS total,
        COUNT(*) FILTER (WHERE (${RESULT}) < 0)::int AS ctes_negativos,
        COUNT(*) FILTER (WHERE (${FRETE}) > 0 AND (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 10)::int AS ctes_margem_baixa
      FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
    `),
    query(`
      SELECT
        RIGHT(TRIM(dados->>'DESTINO'), 2)       AS uf,
        COALESCE(SUM(${FRETE}),   0)::float     AS faturamento,
        COALESCE(SUM(${RESULT}),  0)::float     AS resultado,
        COALESCE(SUM(${PESO}),    0)::float     AS peso,
        COALESCE(SUM(${VALORNF}), 0)::float     AS valor_nf,
        COUNT(*)::int                            AS total
      FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
      WHERE dados->>'DESTINO' IS NOT NULL
        AND LENGTH(TRIM(dados->>'DESTINO')) >= 2
      GROUP BY uf
      ORDER BY resultado DESC
    `),
    query(`
      SELECT
        TO_CHAR(TO_DATE(dados->>'DATA', 'DD/MM/YYYY'), 'YYYY-MM') AS mes,
        COALESCE(SUM(${FRETE}),  0)::float AS faturamento,
        COALESCE(SUM(${RESULT}), 0)::float AS resultado
      FROM (${baseQuery(`
        TO_CHAR(TO_DATE(dados->>'DATA', 'DD/MM/YYYY'), 'YYYY-MM')
        BETWEEN ${evolucaoStart} AND '${maxMes}'
      `, whereCliente, whereTabela)}) t
      GROUP BY mes
      ORDER BY mes
    `),
    query(`
      SELECT
        dados->>'CLIENTE TOMADOR'          AS cliente,
        COALESCE(SUM(${FRETE}), 0)::float  AS faturamento
      FROM (${baseQuery("TRUE")}) t
      WHERE dados->>'CLIENTE TOMADOR' IS NOT NULL
        AND TRIM(dados->>'CLIENTE TOMADOR') <> ''
      GROUP BY cliente
      ORDER BY faturamento DESC
    `),
    query(`
      SELECT
        COALESCE(NULLIF(TRIM(dados->>'CLIENTE TOMADOR'), ''), 'Sem cliente') AS cliente,
        COALESCE(SUM(${RESULT}),  0)::float AS resultado,
        COALESCE(SUM(${FRETE}),   0)::float AS faturamento,
        COUNT(*)::int                         AS total
      FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
      GROUP BY cliente
      ORDER BY resultado DESC
      LIMIT 10
    `),
    query(`
      SELECT
        CASE
          WHEN (${RESULT}) < 0                                        THEN 'Prejuízo'
          WHEN (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 10        THEN '0–10%'
          WHEN (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 20        THEN '10–20%'
          WHEN (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 30        THEN '20–30%'
          ELSE '> 30%'
        END AS faixa,
        CASE
          WHEN (${RESULT}) < 0                                        THEN 0
          WHEN (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 10        THEN 1
          WHEN (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 20        THEN 2
          WHEN (${RESULT}) / NULLIF((${FRETE}), 0) * 100 < 30        THEN 3
          ELSE 4
        END AS sort_order,
        COUNT(*)::int                        AS total,
        COALESCE(SUM(${RESULT}), 0)::float   AS resultado,
        COALESCE(SUM(${FRETE}),  0)::float   AS faturamento
      FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
      WHERE (${FRETE}) > 0
      GROUP BY faixa, sort_order
      ORDER BY sort_order
    `),
    query(`
      SELECT
        COALESCE(SUM(${CUSTO_ENTREGA}), 0)::float AS custo_entrega,
        COALESCE(SUM(${CUSTO_TRANSF}),  0)::float AS custo_transf,
        COALESCE(SUM(${CUSTO_COLETA}),  0)::float AS custo_coleta,
        GREATEST(COALESCE(SUM(${CUSTO_TOTAL}) - SUM(${CUSTO_ENTREGA}) - SUM(${CUSTO_TRANSF}) - SUM(${CUSTO_COLETA}), 0), 0)::float AS custo_outros
      FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
    `),
    query(`
      SELECT
        base.tabela_total,
        base.data,
        base.minuta,
        base.cte,
        base.cliente,
        base.destino,
        base.servico,
        base.tipo_cte,
        base.peso,
        base.frete,
        base.resultado,
        base.valor_nf,
        base.margem,
        em.dados->>'TABELA'      AS tabela_comercial
      FROM (
        SELECT
          COUNT(*) OVER()           AS tabela_total,
          dados->>'DATA'            AS data,
          dados->>'MINUTA'          AS minuta,
          dados->>'CT-E'            AS cte,
          dados->>'CLIENTE TOMADOR' AS cliente,
          dados->>'DESTINO'         AS destino,
          dados->>'SERVICO'         AS servico,
          dados->>'TIPO CTE'        AS tipo_cte,
          (${PESO})::float          AS peso,
          (${FRETE})::float         AS frete,
          (${RESULT})::float        AS resultado,
          (${VALORNF})::float       AS valor_nf,
          dados->>'MARGEM'          AS margem,
          REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g') AS minuta_clean
        FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
        WHERE TRUE ${whereResultado}
        ORDER BY ${orderBy}
        LIMIT ${tabelaSize} OFFSET ${tabelaOffset}
      ) base
      LEFT JOIN emissoes em ON em.id_minuta = base.minuta_clean
    `),
    query(`
      SELECT
        COALESCE(NULLIF(TRIM(dados->>'CLIENTE TOMADOR'), ''), 'Sem cliente') AS cliente,
        COUNT(*) FILTER (WHERE (${RESULT}) < 0)::int                          AS ctes_negativos,
        COALESCE(SUM(${RESULT}) FILTER (WHERE (${RESULT}) < 0), 0)::float    AS resultado,
        COUNT(*)::int                                                          AS total
      FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
      GROUP BY cliente
      HAVING COUNT(*) FILTER (WHERE (${RESULT}) < 0) > 0
      ORDER BY ctes_negativos DESC
      LIMIT 10
    `),
    query(`
      SELECT
        tabela_comercial AS tabela,
        COUNT(*)::int                                AS total,
        COALESCE(SUM(${FRETE}),  0)::float           AS faturamento,
        COALESCE(SUM(${RESULT}), 0)::float           AS resultado,
        COALESCE(SUM(CASE WHEN (${RESULT}) < 0 THEN (${RESULT}) ELSE 0 END), 0)::float AS prejuizo
      FROM (
        SELECT t.dados, em.dados->>'TABELA' AS tabela_comercial
        FROM (${baseQuery(whereDate, whereCliente, whereTabela)}) t
        LEFT JOIN emissoes em
          ON em.id_minuta = REGEXP_REPLACE(t.dados->>'MINUTA', '[^0-9]', '', 'g')
      ) sub
      WHERE tabela_comercial IS NOT NULL AND TRIM(tabela_comercial) != ''
      GROUP BY tabela_comercial
      ORDER BY faturamento DESC
    `),
    query(`
      SELECT DISTINCT dados->>'TABELA' AS tabela
      FROM emissoes
      WHERE dados->>'TABELA' IS NOT NULL AND TRIM(dados->>'TABELA') != ''
      ORDER BY tabela
    `),
  ]) as [
    { faturamento: number; resultado: number; peso: number; valor_nf: number; total: number; ctes_negativos: number; ctes_margem_baixa: number }[],
    { uf: string; faturamento: number; resultado: number; peso: number; valor_nf: number; total: number }[],
    { mes: string; faturamento: number; resultado: number }[],
    { cliente: string; faturamento: number }[],
    { cliente: string; resultado: number; faturamento: number; total: number }[],
    { faixa: string; sort_order: number; total: number; resultado: number; faturamento: number }[],
    { custo_entrega: number; custo_transf: number; custo_coleta: number; custo_outros: number }[],
    {
      tabela_total: number;
      data: string; minuta: string; cte: string; cliente: string; destino: string;
      servico: string; tipo_cte: string; peso: number; frete: number;
      resultado: number; valor_nf: number; margem: string; tabela_comercial: string | null;
    }[],
    { cliente: string; ctes_negativos: number; resultado: number; total: number }[],
    { tabela: string; total: number; faturamento: number; resultado: number; prejuizo: number }[],
    { tabela: string }[],
  ];

  const [totais] = totaisRows;
  const [custos] = custosRows;

  const tabelaTotal = tabelaRows[0]?.tabela_total ?? 0;

  return {
    periodo:        { start, end, max_mes: maxMes, min_mes: minMes },
    totais,
    por_uf:         porUF,
    evolucao,
    clientes:       clientesRows.map(r => r.cliente),
    tabela:         tabelaRows,
    tabela_total:   tabelaTotal,
    tabela_page:    tabelaPage,
    tabela_size:    tabelaSize,
    sort_by:        rawSortBy,
    sort_dir:       sortDir.toLowerCase(),
    por_cliente:      porClienteRows,
    dist_margem:      distMargemRows,
    custos,
    top_negativos:    topNegativosRows,
    por_tabela:       porTabelaRows,
    tabelas_comerciais: tabelasRows.map(r => r.tabela),
    resultado_filter:   resultadoFilter,
  };
  });

  return NextResponse.json(data);
}

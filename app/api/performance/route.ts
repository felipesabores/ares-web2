import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withCache } from "@/lib/cache";
import { getSession } from "@/lib/session";
import { UF_RESP, RESPONSAVEIS } from "@/lib/sac-ufs";

const TTL_MS = 10 * 60 * 1000;

export const revalidate = 0;

// UF → SAC Responsável: mapa oficial em lib/sac-ufs.ts (fonte única).
const TIPO_ALLOWED  = new Set(["ENTREGA","DEVOLUCAO","CORTESIA","REENTREGA","GAIOLAS"]);
const RESP_ALLOWED  = new Set(RESPONSAVEIS);

function ufsOf(nome: string): string {
  return Object.entries(UF_RESP)
    .filter(([, r]) => r === nome)
    .map(([uf]) => `'${uf}'`)
    .join(",");
}

// PREV. ENTREGA date expression
const prevDate = `CASE
  WHEN dados->>'PREV. ENTREGA' ~ '^\\d{4}-\\d{2}-\\d{2}'
    THEN SUBSTRING(dados->>'PREV. ENTREGA', 1, 10)::date
  WHEN dados->>'PREV. ENTREGA' ~ '^\\d{2}/\\d{2}/\\d{4}'
    THEN TO_DATE(SUBSTRING(dados->>'PREV. ENTREGA', 1, 10),'DD/MM/YYYY')
  ELSE NULL
END`;

// Data de hoje no fuso de Brasília (servidor está em UTC na Europa)
const hoje = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;

// Currently overdue: in transit, PREV. ENTREGA in the past
const atrasoCond = `(
  dados->>'COMPROVANTE ENTREGA' = 'NAO'
  AND (${prevDate}) IS NOT NULL
  AND (${prevDate}) < ${hoje}
)`;

// Due today: in transit, PREV. ENTREGA = today (d0)
const entregaDiaHoje = `(
  dados->>'COMPROVANTE ENTREGA' = 'NAO'
  AND (${prevDate}) IS NOT NULL
  AND (${prevDate}) = ${hoje}
)`;

// On time: in transit, PREV. ENTREGA >= tomorrow (d+1 or later)
const noPrazoCond = `(
  dados->>'COMPROVANTE ENTREGA' = 'NAO'
  AND (${prevDate}) IS NOT NULL
  AND (${prevDate}) > ${hoje}
)`;

function validate(uf: string | null): boolean {
  return !uf || /^[A-Z]{1,3}$/.test(uf);
}

export async function GET(req: NextRequest) {
  const session = await getSession();

  const uf         = req.nextUrl.searchParams.get("uf");
  const clienteRaw = req.nextUrl.searchParams.get("cliente") ?? "";
  const tipoRaw    = req.nextUrl.searchParams.get("tipo")    ?? "";
  const respRaw    = req.nextUrl.searchParams.get("resp")    ?? "";
  const full       = req.nextUrl.searchParams.get("full") === "1";

  if (!validate(uf))                          return NextResponse.json({ error: "invalid params" }, { status: 400 });
  if (tipoRaw && !TIPO_ALLOWED.has(tipoRaw)) return NextResponse.json({ error: "invalid params" }, { status: 400 });
  if (respRaw && !RESP_ALLOWED.has(respRaw)) return NextResponse.json({ error: "invalid params" }, { status: 400 });

  const cacheKey = `perf:${session?.role ?? "anon"}:${session?.username ?? ""}:${uf ?? ""}:${clienteRaw}:${tipoRaw}:${respRaw}:${full ? "1" : "0"}`;

  const data = await withCache(cacheKey, TTL_MS, async () => {

  const isCliente = session?.role === "cliente";
  const clienteCnpjs = session?.cnpjs ?? [];

  const ufWhere      = !isCliente && uf         ? `AND dados->>'UF.1' = '${uf}'`                                  : "";
  const clienteWhere = isCliente
    ? clienteCnpjs.length > 0
      ? `AND dados->>'CNPJ' IN (${clienteCnpjs.map(c => `'${c}'`).join(",")})`
      : "AND 1=0"
    : clienteRaw
      ? `AND dados->>'CLIENTE' = '${clienteRaw.replace(/'/g, "''")}'`
      : "";
  const tipoWhere    = tipoRaw    ? `AND dados->>'TIPO EMISSAO' = '${tipoRaw}'`                    : "";
  const respUfs      = !isCliente && respRaw    ? ufsOf(respRaw)                                   : "";
  const respWhere    = respUfs    ? `AND dados->>'UF.1' IN (${respUfs})`                           : "";

  // WHERE aplicado a todas as queries de emissoes
  const fw = `${ufWhere} ${clienteWhere} ${tipoWhere} ${respWhere}`;

  // Por responsável: já tem filtro de UF próprio; aplica só cliente e tipo
  const respQueries = RESPONSAVEIS.map(nome => {
    const ufs = ufsOf(nome);
    return query(`
      SELECT
        '${nome}' AS nome,
        COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO')::int AS em_movimento,
        COUNT(*) FILTER (WHERE ${atrasoCond})::int AS atraso,
        COUNT(*) FILTER (WHERE ${entregaDiaHoje})::int AS entregas_dia,
        COUNT(*) FILTER (WHERE ${noPrazoCond})::int AS no_prazo
      FROM emissoes
      WHERE dados->>'UF.1' IN (${ufs}) ${clienteWhere} ${tipoWhere}
    `);
  });

  const [
    kpi_main,
    kpi_sac,
    kpi_pereciveis,
    kpi_agendamentos,
    kpi_prioridades,
    kpi_devolucoes,
    por_uf,
    por_uf_atraso,
    por_uf_dia,
    projecao_7d,
    sac_atendente,
    clientes_list,
    cte_rows,
    ...respResults
  ] = await Promise.all([

    // KPIs principais
    query(`
      SELECT
        COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO')::int AS em_movimento,
        COUNT(*) FILTER (WHERE ${atrasoCond})::int AS atraso,
        COUNT(*) FILTER (WHERE ${entregaDiaHoje})::int AS entregas_dia,
        COUNT(*) FILTER (WHERE ${noPrazoCond})::int AS no_prazo
      FROM emissoes WHERE 1=1 ${fw}
    `),

    // SAC aberto total
    query(`
      SELECT COUNT(*)::int AS n FROM canhotos
      WHERE dados->>'STATUS' = 'ABERTO'
        AND dados->>'DATA ATENDIMENTO' IS NOT NULL
        AND dados->>'DATA ATENDIMENTO' NOT IN ('', 'NaT')
        AND TO_DATE(dados->>'DATA ATENDIMENTO', 'DD/MM/YYYY') >= ${hoje} - 30
    `),

    query(`SELECT COUNT(*)::int AS n FROM pereciveis WHERE TO_DATE(SUBSTRING(dados->>'PREV. ENTREGA', 1, 10), 'DD/MM/YYYY') = ${hoje}`),

    // Agendamentos: relatório 399 salvo na tabela remessas
    query(`
      SELECT COUNT(*)::int AS n FROM remessas
      WHERE dados->>'PREV. ENTREGA' IS NOT NULL
        AND dados->>'PREV. ENTREGA' NOT IN ('', 'NaT')
        AND TO_DATE(SUBSTRING(dados->>'PREV. ENTREGA', 1, 10), 'DD/MM/YYYY') = ${hoje}
    `),

    query(`SELECT COUNT(*)::int AS n FROM canhotos WHERE dados->>'TIPO' = 'PRIORIDADE' AND dados->>'STATUS' = 'ABERTO'`),

    query(`SELECT COUNT(*)::int AS n FROM emissoes WHERE dados->>'TIPO EMISSAO' = 'DEVOLUCAO'`),

    // Em movimento por UF (para mapa)
    query(`
      SELECT
        dados->>'UF.1' AS uf,
        COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO')::int AS em_movimento,
        COUNT(*) FILTER (WHERE ${atrasoCond})::int AS atraso,
        COUNT(*) FILTER (WHERE ${entregaDiaHoje})::int AS entregas_dia,
        COUNT(*) FILTER (WHERE ${noPrazoCond})::int AS no_prazo,
        COALESCE(ROUND(
          COUNT(*) FILTER (WHERE ${noPrazoCond}) * 100.0
          / NULLIF(COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO'), 0)
        , 0)::int, 0) AS pontualidade
      FROM emissoes
      WHERE dados->>'UF.1' IS NOT NULL ${ufWhere} ${clienteWhere} ${tipoWhere} ${respWhere}
      GROUP BY 1
      HAVING COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO') > 0
      ORDER BY 2 DESC, 3 DESC
      LIMIT 27
    `),

    // Entregas em ATRASO por UF (barras vermelhas)
    query(`
      SELECT dados->>'UF.1' AS uf, COUNT(*)::int AS total
      FROM emissoes
      WHERE ${atrasoCond} AND dados->>'UF.1' IS NOT NULL ${ufWhere} ${clienteWhere} ${tipoWhere} ${respWhere}
      GROUP BY 1 HAVING COUNT(*) > 0 ORDER BY 2 DESC LIMIT 20
    `),

    // Previsão DO DIA por UF (barras azuis — PREV. ENTREGA = hoje, ainda em trânsito)
    query(`
      SELECT dados->>'UF.1' AS uf, COUNT(*)::int AS total
      FROM emissoes
      WHERE ${entregaDiaHoje} AND dados->>'UF.1' IS NOT NULL ${ufWhere} ${clienteWhere} ${tipoWhere} ${respWhere}
      GROUP BY 1 HAVING COUNT(*) > 0 ORDER BY 2 DESC LIMIT 20
    `),

    // Projeção 7 dias: notas em trânsito com PREV. ENTREGA nos próximos 7 dias
    query(`
      SELECT
        (${prevDate})::text AS data,
        COUNT(*)::int AS total
      FROM emissoes
      WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO'
        AND (${prevDate}) IS NOT NULL
        AND (${prevDate}) BETWEEN ${hoje} + 1 AND ${hoje} + 7
        ${ufWhere} ${clienteWhere} ${tipoWhere} ${respWhere}
      GROUP BY 1 ORDER BY 1
    `),

    // SAC por atendente
    query(`
      SELECT dados->>'ÚLTIMO USUÁRIO' AS atendente, COUNT(*)::int AS total
      FROM canhotos
      WHERE dados->>'STATUS' = 'ABERTO'
        AND dados->>'ÚLTIMO USUÁRIO' IS NOT NULL AND dados->>'ÚLTIMO USUÁRIO' != ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `),

    // Lista de clientes distintos (sem LIMIT — usada pelo filtro da page)
    !isCliente ? query(`
      SELECT DISTINCT dados->>'CLIENTE' AS cliente
      FROM emissoes
      WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO'
        AND dados->>'CLIENTE' IS NOT NULL
        AND TRIM(dados->>'CLIENTE') <> ''
        ${tipoWhere} ${respWhere}
      ORDER BY cliente
    `) : Promise.resolve([]),

    // Tabela de CTes em movimento
    query(`
      SELECT
        dados->>'MINUTA'             AS minuta,
        dados->>'TIPO EMISSAO'       AS servico,
        dados->>'CTE/NFSE'           AS cte_nfse,
        dados->>'NF/DOC'             AS nf_doc,
        dados->>'DATA'               AS emissao,
        dados->>'PREV. ENTREGA'      AS prev_entrega,
        dados->>'VALOR'              AS valor,
        dados->>'PESO REAL'          AS peso,
        dados->>'VOL'                AS vol,
        dados->>'CLIENTE'            AS cliente,
        dados->>'ORIGEM'             AS origem,
        dados->>'UF'                 AS uf_origem,
        dados->>'DESTINO'            AS destinatario,
        dados->>'CIDADE.2'           AS destino,
        dados->>'UF.1'               AS uf,
        dados->>'RESP ENTREGA'       AS resp_entrega,
        dados->>'AWB'                AS awb,
        dados->>'CIA TRANSFERENCIA'  AS cia_transferencia
      FROM emissoes
      WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO' ${fw}
      ORDER BY TO_DATE(dados->>'DATA', 'DD/MM/YYYY') ASC
      ${full ? "" : "LIMIT 300"}
    `),

    ...respQueries,
  ]);

  const responsaveis = RESPONSAVEIS.map((nome, i) => {
    const r = respResults[i][0] ?? { em_movimento: 0, atraso: 0, entregas_dia: 0, no_prazo: 0 };
    return { nome, em_movimento: r.em_movimento, atraso: r.atraso, entregas_dia: r.entregas_dia, no_prazo: r.no_prazo };
  });

  const em  = Number(kpi_main[0].em_movimento ?? 0);
  const atr = Number(kpi_main[0].atraso       ?? 0);
  const dia = Number(kpi_main[0].entregas_dia  ?? 0);
  const np  = Number(kpi_main[0].no_prazo     ?? 0);
  const pontualidade = em > 0 ? Math.round(np * 100 / em * 10) / 10 : 0;

  return {
    kpis: {
      em_movimento: em,
      atraso:       atr,
      entregas_dia: dia,
      no_prazo:     np,
      sac_aberto:   kpi_sac[0].n,
      pontualidade,
      pereciveis:   kpi_pereciveis[0].n,
      agendamentos: kpi_agendamentos[0].n,
      prioridades:  kpi_prioridades[0].n,
      devolucoes:   kpi_devolucoes[0].n,
    },
    por_uf,
    por_uf_atraso,
    por_uf_dia,
    projecao_7d,
    responsaveis,
    sac_atendente,
    clientes: (clientes_list as { cliente: string }[]).map(r => r.cliente),
    cte: cte_rows,
  };
  });

  return NextResponse.json(data);
}

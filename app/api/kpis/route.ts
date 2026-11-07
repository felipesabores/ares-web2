import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month"); // "YYYY-MM"
  const year  = req.nextUrl.searchParams.get("year");  // "YYYY"

  const dateClause = month
    ? `AND dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= '${month}-01'::date
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  ('${month}-01'::date + INTERVAL '1 month')`
    : year
    ? `AND dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
       AND EXTRACT(YEAR FROM TO_DATE(dados->>'DATA','DD/MM/YYYY')) = ${parseInt(year)}`
    : "";

  const [em_movimento, entregas, atraso, sac_aberto, coletas_pendentes, awbs, remessas, data_range] = await Promise.all([
    query(`SELECT COUNT(*)::int as n FROM emissoes WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO' ${dateClause}`),
    query(`SELECT COUNT(*)::int as n FROM emissoes WHERE dados->>'COMPROVANTE ENTREGA' = 'SIM' ${dateClause}`),
    query(`
      SELECT COUNT(*)::int as n FROM emissoes
      WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO'
        AND (
          CASE
            WHEN dados->>'PREV. ENTREGA' ~ '^\\d{4}-\\d{2}-\\d{2}'
              THEN SUBSTRING(dados->>'PREV. ENTREGA', 1, 10)::date
            WHEN dados->>'PREV. ENTREGA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
              THEN TO_DATE(dados->>'PREV. ENTREGA','DD/MM/YYYY')
            ELSE NULL
          END
        ) < CURRENT_DATE
        ${dateClause}
    `),
    query(`SELECT COUNT(*)::int as n FROM canhotos WHERE dados->>'STATUS' = 'ABERTO'`),
    query(`SELECT COUNT(*)::int as n FROM coletas WHERE dados->>'STATUS' NOT IN ('FINALIZADA','CANCELADA') OR dados->>'STATUS' IS NULL`),
    query(`SELECT COUNT(*)::int as n FROM awbs WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$' AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (SELECT MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY')) FROM awbs WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$') - INTERVAL '60 days'`),
    query(`SELECT COUNT(*)::int as n FROM remessas`),
    query(`
      SELECT
        MIN(TO_DATE(dados->>'DATA','DD/MM/YYYY'))::text as data_min,
        MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY'))::text as data_max,
        COUNT(*)::int as total
      FROM emissoes
      WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
        AND dados->>'DATA' != '00/00/0000'
        AND TO_DATE(dados->>'DATA','DD/MM/YYYY') > '1900-01-01'
    `),
  ]);

  const total = (em_movimento[0].n as number) + (entregas[0].n as number);
  const perf  = total > 0 ? Math.round(((entregas[0].n as number) / total) * 1000) / 10 : 0;

  return NextResponse.json({
    em_movimento:      em_movimento[0].n,
    entregas:          entregas[0].n,
    atraso:            atraso[0].n,
    sac_aberto:        sac_aberto[0].n,
    coletas_pendentes: coletas_pendentes[0].n,
    awbs:              awbs[0].n,
    remessas:          remessas[0].n,
    performance:       perf,
    data_range: {
      min:   (data_range[0] as Record<string, unknown>)?.data_min ?? null,
      max:   (data_range[0] as Record<string, unknown>)?.data_max ?? null,
      total: (data_range[0] as Record<string, unknown>)?.total    ?? 0,
    },
  });
}

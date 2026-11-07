import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month"); // formato: "YYYY-MM"

  const dateClause = month
    ? `AND dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= '${month}-01'::date
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  ('${month}-01'::date + INTERVAL '1 month')`
    : "";

  const [byUF, byServico, atrasoUF] = await Promise.all([
    query(`
      SELECT COALESCE(dados->>'UF.1','??') as uf, COUNT(*)::int as total
      FROM emissoes WHERE true ${dateClause}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `),
    query(`
      SELECT COALESCE(dados->>'SERVIÇO','N/A') as servico, COUNT(*)::int as total
      FROM emissoes WHERE true ${dateClause}
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `),
    query(`
      SELECT COALESCE(dados->>'UF.1','??') as uf, COUNT(*)::int as total
      FROM emissoes
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
      GROUP BY 1 ORDER BY 2 DESC LIMIT 15
    `),
  ]);

  return NextResponse.json({ byUF, byServico, atrasoUF });
}

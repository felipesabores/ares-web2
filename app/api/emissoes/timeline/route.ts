import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month");

  const dateFilter = month
    ? `dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= '${month}-01'::date
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  ('${month}-01'::date + INTERVAL '1 month')`
    : `dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') > '1900-01-01'
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= (CURRENT_DATE - INTERVAL '30 days')`;

  const rows = await query(`
    SELECT
      TO_DATE(dados->>'DATA','DD/MM/YYYY')::text AS data,
      COUNT(*)::int AS total
    FROM emissoes
    WHERE ${dateFilter}
    GROUP BY 1
    ORDER BY 1
  `);

  return NextResponse.json(rows);
}

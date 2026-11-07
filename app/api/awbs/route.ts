import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  const rows = await query(`
    WITH max_date AS (
      SELECT MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY')) AS d
      FROM awbs
      WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
    )
    SELECT
      CASE
        WHEN dados->>'STATUS' LIKE '%105%' OR dados->>'STATUS' LIKE '%COMPROVANTE%' THEN 'Entregue'
        WHEN dados->>'STATUS' LIKE '%175%' OR dados->>'STATUS' LIKE '%RETIRADO%'    THEN 'Retirado CIA'
        WHEN dados->>'STATUS' LIKE '%179%' OR dados->>'STATUS' LIKE '%DISPONIVEL%'  THEN 'Disponível'
        WHEN dados->>'STATUS' LIKE '%305%' OR dados->>'STATUS' LIKE '%INSERIDO%'    THEN 'Inserido'
        ELSE 'Outros'
      END as status,
      COUNT(*)::int as total
    FROM awbs, max_date
    WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
      AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= max_date.d - INTERVAL '60 days'
    GROUP BY 1 ORDER BY 2 DESC
  `);
  return NextResponse.json(rows);
}

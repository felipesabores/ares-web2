import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET() {
  const rows = await query(`
    WITH max_date AS (
      SELECT MAX(TO_DATE(dados->>'DATA','DD/MM/YYYY')) AS d
      FROM awbs
      WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
    )
    SELECT
      COALESCE(dados->>'AWB', dados->>'NUMERO', '—')  AS awb,
      dados->>'DATA'                                  AS data,
      dados->>'MINUTA'                                AS minuta,
      dados->>'DESTINO'                               AS destino,
      dados->>'VOLUMES'                               AS volumes,
      dados->>'PESO'                                  AS peso,
      COALESCE(
        CASE
          WHEN dados->>'STATUS' LIKE '%105%' OR dados->>'STATUS' LIKE '%COMPROVANTE%' THEN 'Entregue'
          WHEN dados->>'STATUS' LIKE '%175%' OR dados->>'STATUS' LIKE '%RETIRADO%'    THEN 'Retirado CIA'
          WHEN dados->>'STATUS' LIKE '%179%' OR dados->>'STATUS' LIKE '%DISPONIVEL%'  THEN 'Disponível'
          WHEN dados->>'STATUS' LIKE '%305%' OR dados->>'STATUS' LIKE '%INSERIDO%'    THEN 'Inserido'
          ELSE dados->>'STATUS'
        END,
        'Sem status'
      ) AS status
    FROM awbs, max_date
    WHERE dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
      AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= max_date.d - INTERVAL '60 days'
    ORDER BY TO_DATE(dados->>'DATA','DD/MM/YYYY') DESC, id DESC
    LIMIT 500
  `);

  return NextResponse.json(rows);
}

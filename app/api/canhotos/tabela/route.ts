import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET() {
  const rows = await query(`
    SELECT
      SPLIT_PART(COALESCE(dados->>'MINUTA', ''), '.', 1)              AS minuta,
      dados->>'CLIENTE'                                                AS cliente,
      dados->>'DATA'                                                   AS data,
      COALESCE(dados->>'STATUS', '—')                                  AS status,
      COALESCE(dados->>'SOLICITANTE', dados->>'TIPO', '—')             AS solicitante,
      dados->>'OBSERVACAO'                                             AS observacao
    FROM canhotos
    ORDER BY id DESC NULLS LAST
    LIMIT 500
  `);

  return NextResponse.json(rows);
}

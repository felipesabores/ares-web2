import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  const rows = await query(`
    SELECT
      COALESCE(dados->>'SOLICITANTE', dados->>'TIPO', 'Não informado') as solicitante,
      COUNT(*)::int as total
    FROM canhotos
    WHERE dados->>'STATUS' = 'ABERTO'
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);
  return NextResponse.json(rows);
}

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 300;

export async function GET() {
  const rows = await query(`
    SELECT
      COALESCE(dados->>'RESPONSAVEL', 'Sem responsável') as responsavel,
      COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE dados->>'STATUS' = 'FINALIZADA')::int as finalizadas
    FROM coletas
    WHERE dados->>'RESPONSAVEL' IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  `);
  return NextResponse.json(rows);
}

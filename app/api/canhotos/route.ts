import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { withCache } from "@/lib/cache";

export const revalidate = 0;

const TTL_MS = 10 * 60 * 1000;

export async function GET() {
  const data = await withCache("canhotos", TTL_MS, async () => {
  const [kpis, byStatus, byTipo, byAtendente] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE dados->>'STATUS' = 'ABERTO')::int  AS abertos,
        COUNT(*) FILTER (WHERE dados->>'STATUS' != 'ABERTO')::int AS encerrados
      FROM canhotos
    `),
    query(`
      SELECT
        COALESCE(dados->>'STATUS', 'Sem status') AS status,
        COUNT(*)::int AS total
      FROM canhotos
      GROUP BY 1 ORDER BY 2 DESC
    `),
    query(`
      SELECT
        COALESCE(dados->>'TIPO', 'Não informado') AS tipo,
        COUNT(*)::int AS total
      FROM canhotos
      WHERE dados->>'STATUS' = 'ABERTO'
        AND dados->>'TIPO' IS NOT NULL AND dados->>'TIPO' != ''
      GROUP BY 1 ORDER BY 2 DESC
    `),
    query(`
      SELECT
        COALESCE(dados->>'ÚLTIMO USUÁRIO', 'Não informado') AS atendente,
        COUNT(*)::int AS total
      FROM canhotos
      WHERE dados->>'STATUS' = 'ABERTO'
        AND dados->>'ÚLTIMO USUÁRIO' IS NOT NULL AND dados->>'ÚLTIMO USUÁRIO' != ''
      GROUP BY 1 ORDER BY 2 DESC
    `),
  ]);

  return { kpis: kpis[0], byStatus, byTipo, byAtendente };
  });

  return NextResponse.json(data);
}

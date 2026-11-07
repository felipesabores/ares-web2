import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET() {
  const [kpis, rows] = await Promise.all([
    query(`
      SELECT
        COUNT(*)::int                                                            AS total,
        COUNT(*) FILTER (WHERE dados->>'STATUS' = 'FINALIZADA')::int           AS finalizadas,
        COUNT(*) FILTER (WHERE dados->>'STATUS' IS DISTINCT FROM 'FINALIZADA')::int AS pendentes
      FROM coletas
    `),
    query(`
      SELECT
        COALESCE(dados->>'NUMERO', dados->>'COLETA', '—')          AS numero,
        dados->>'DATA'                                              AS data,
        COALESCE(dados->>'CLIENTE', dados->>'REMETENTE', '—')       AS cliente,
        COALESCE(dados->>'RESPONSAVEL', '—')                        AS responsavel,
        COALESCE(dados->>'STATUS', 'Pendente')                      AS status,
        dados->>'DESTINO'                                           AS destino,
        dados->>'OBSERVACAO'                                        AS observacao
      FROM coletas
      ORDER BY id DESC NULLS LAST
      LIMIT 500
    `),
  ]);

  return NextResponse.json({ kpis: kpis[0], rows });
}

import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET() {
  const [kpis, rows] = await Promise.all([
    query(`SELECT COUNT(*)::int AS total FROM remessas`),
    query(`
      SELECT
        COALESCE(dados->>'NUMERO', dados->>'REMESSA', dados->>'ID', '—')  AS numero,
        dados->>'DATA'                                                      AS data,
        dados->>'CLIENTE'                                                   AS cliente,
        dados->>'DESTINATARIO'                                              AS destinatario,
        dados->>'DESTINO'                                                   AS destino,
        COALESCE(dados->>'UF', dados->>'UF.1')                             AS uf,
        dados->>'PESO'                                                      AS peso,
        dados->>'VOLUMES'                                                   AS volumes,
        dados->>'RESPONSAVEL'                                               AS responsavel,
        dados->>'STATUS'                                                    AS status
      FROM remessas
      ORDER BY id DESC NULLS LAST
      LIMIT 500
    `),
  ]);

  return NextResponse.json({ total: (kpis[0] as Record<string, number>).total, rows });
}

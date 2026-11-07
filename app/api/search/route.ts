import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

const hoje = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
const prevDate = `CASE
  WHEN dados->>'PREV. ENTREGA' ~ '^\\d{4}-\\d{2}-\\d{2}'
    THEN SUBSTRING(dados->>'PREV. ENTREGA', 1, 10)::date
  WHEN dados->>'PREV. ENTREGA' ~ '^\\d{2}/\\d{2}/\\d{4}'
    THEN TO_DATE(SUBSTRING(dados->>'PREV. ENTREGA', 1, 10),'DD/MM/YYYY')
  ELSE NULL
END`;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ results: [] });

  const t = q.replace(/'/g, "''");
  const like = `ILIKE '%${t}%'`;

  const [emissoes, canhotos, awbs, coletas, remessas] = await Promise.all([
    // CTes em movimento
    query(`
      SELECT
        'cte'                          AS tipo,
        dados->>'MINUTA'               AS id,
        dados->>'CLIENTE'              AS principal,
        dados->>'DESTINO'              AS secundario,
        dados->>'UF'                   AS uf,
        dados->>'DATA'                 AS data,
        dados->>'PREV. ENTREGA'        AS prev_entrega,
        dados->>'TIPO EMISSAO'         AS servico,
        dados->>'CTE/NFSE'             AS ref,
        CASE
          WHEN dados->>'COMPROVANTE ENTREGA' = 'NAO'
            AND (${prevDate}) IS NOT NULL
            AND (${prevDate}) < ${hoje} THEN 'atraso'
          WHEN dados->>'COMPROVANTE ENTREGA' = 'NAO'
            AND (${prevDate}) = ${hoje}  THEN 'hoje'
          WHEN dados->>'COMPROVANTE ENTREGA' = 'NAO' THEN 'em_transito'
          ELSE 'entregue'
        END AS status
      FROM emissoes
      WHERE
        dados->>'MINUTA'   ${like} OR
        dados->>'CLIENTE'  ${like} OR
        dados->>'DESTINO'  ${like} OR
        dados->>'CTE/NFSE' ${like} OR
        dados->>'NF/DOC'   ${like}
      ORDER BY dados->>'DATA' DESC
      LIMIT 8
    `),

    // Canhotos
    query(`
      SELECT
        'canhoto'                   AS tipo,
        dados->>'MINUTA'            AS id,
        dados->>'CLIENTE'           AS principal,
        dados->>'SOLICITANTE'       AS secundario,
        ''                          AS uf,
        dados->>'DATA'              AS data,
        ''                          AS prev_entrega,
        dados->>'TIPO'              AS servico,
        dados->>'OBSERVACAO'        AS ref,
        LOWER(COALESCE(dados->>'STATUS','')) AS status
      FROM canhotos
      WHERE
        dados->>'MINUTA'  ${like} OR
        dados->>'CLIENTE' ${like}
      ORDER BY dados->>'DATA' DESC
      LIMIT 5
    `),

    // AWBs
    query(`
      SELECT
        'awb'                        AS tipo,
        dados->>'AWB'                AS id,
        dados->>'DESTINATARIO'       AS principal,
        dados->>'DESTINO'            AS secundario,
        ''                           AS uf,
        dados->>'DATA'               AS data,
        dados->>'PREV. CHEGADA'      AS prev_entrega,
        dados->>'SERVICO'            AS servico,
        dados->>'MINUTA'             AS ref,
        LOWER(COALESCE(dados->>'STATUS','')) AS status
      FROM awbs
      WHERE
        dados->>'AWB'          ${like} OR
        dados->>'MINUTA'       ${like} OR
        dados->>'DESTINATARIO' ${like} OR
        dados->>'DESTINO'      ${like}
      ORDER BY dados->>'DATA' DESC
      LIMIT 5
    `),

    // Coletas
    query(`
      SELECT
        'coleta'                     AS tipo,
        dados->>'COLETA'             AS id,
        dados->>'DESTINATARIO'       AS principal,
        dados->>'DESTINO'            AS secundario,
        dados->>'UF'                 AS uf,
        dados->>'DATA COLETA'        AS data,
        dados->>'PREVISAO'           AS prev_entrega,
        dados->>'SERVIÇO'            AS servico,
        dados->>'NF'                 AS ref,
        LOWER(COALESCE(dados->>'STATUS','')) AS status
      FROM coletas
      WHERE
        dados->>'COLETA'       ${like} OR
        dados->>'DESTINATARIO' ${like} OR
        dados->>'DESTINO'      ${like} OR
        dados->>'NF'           ${like}
      ORDER BY dados->>'DATA COLETA' DESC
      LIMIT 5
    `),

    // Remessas
    query(`
      SELECT
        'remessa'                    AS tipo,
        dados->>'CTE'                AS id,
        dados->>'DESTINATÁRIO'       AS principal,
        dados->>'DESTINO'            AS secundario,
        ''                           AS uf,
        dados->>'DATA'               AS data,
        dados->>'PREV. ENTREGA'      AS prev_entrega,
        dados->>'CIA TRANSF.'        AS servico,
        dados->>'NFS/DOC-S'          AS ref,
        LOWER(COALESCE(dados->>'STATUS','')) AS status
      FROM remessas
      WHERE
        dados->>'CTE'          ${like} OR
        dados->>'DESTINATÁRIO' ${like} OR
        dados->>'DESTINO'      ${like} OR
        dados->>'NFS/DOC-S'    ${like}
      ORDER BY dados->>'DATA' DESC
      LIMIT 5
    `),
  ]);

  return NextResponse.json({
    results: { emissoes, canhotos, awbs, coletas, remessas },
  });
}

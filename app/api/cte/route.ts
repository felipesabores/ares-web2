import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("month"); // "YYYY-MM"

  const dateClause = month
    ? `AND dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') >= '${month}-01'::date
       AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <  ('${month}-01'::date + INTERVAL '1 month')`
    : "";

  const rows = await query(`
    SELECT
      SPLIT_PART(dados->>'MINUTA', '.', 1) as minuta,
      dados->>'SERVIÇO'       as servico,
      dados->>'DATA'          as emissao,
      dados->>'PREV. ENTREGA' as prev_entrega,
      dados->>'CLIENTE'       as cliente,
      dados->>'REMETENTE'     as remetente,
      dados->>'DESTINATARIO'  as destinatario,
      dados->>'DESTINO'       as destino,
      dados->>'UF.1'          as uf,
      dados->>'PESO'          as peso,
      dados->>'TOTAL COBRADO' as total,
      CASE WHEN dados->>'COMPROVANTE ENTREGA' = 'SIM' THEN 'Entregue' ELSE 'Pendente' END as status
    FROM emissoes
    WHERE true ${dateClause}
    ORDER BY TO_DATE(dados->>'DATA','DD/MM/YYYY') DESC NULLS LAST
    LIMIT 200
  `);
  return NextResponse.json(rows);
}

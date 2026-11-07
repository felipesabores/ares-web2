import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { UF_RESP, RESPONSAVEIS } from "@/lib/sac-ufs";

export const revalidate = 0;

const UF_NOME: Record<string, string> = {
  AC:"Acre", AL:"Alagoas", AP:"Amapá", AM:"Amazonas", BA:"Bahia",
  CE:"Ceará", DF:"Distrito Federal", ES:"Espírito Santo", GO:"Goiás",
  MA:"Maranhão", MT:"Mato Grosso", MS:"Mato Grosso do Sul", MG:"Minas Gerais",
  PA:"Pará", PB:"Paraíba", PR:"Paraná", PE:"Pernambuco", PI:"Piauí",
  RJ:"Rio de Janeiro", RN:"Rio Grande do Norte", RS:"Rio Grande do Sul",
  RO:"Rondônia", RR:"Roraima", SC:"Santa Catarina", SP:"São Paulo",
  SE:"Sergipe", TO:"Tocantins",
};

const RESPONSAVEIS_ALLOWED = new Set(RESPONSAVEIS);

const hoje = `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`;
const prevDate = `CASE
  WHEN dados->>'PREV. ENTREGA' ~ '^\\d{4}-\\d{2}-\\d{2}'
    THEN SUBSTRING(dados->>'PREV. ENTREGA', 1, 10)::date
  WHEN dados->>'PREV. ENTREGA' ~ '^\\d{2}/\\d{2}/\\d{4}'
    THEN TO_DATE(SUBSTRING(dados->>'PREV. ENTREGA', 1, 10),'DD/MM/YYYY')
  ELSE NULL
END`;

const atrasoCond = `(
  dados->>'COMPROVANTE ENTREGA' = 'NAO'
  AND (${prevDate}) IS NOT NULL
  AND (${prevDate}) < ${hoje}
)`;

const hojeEntrega = `(
  dados->>'COMPROVANTE ENTREGA' = 'NAO'
  AND (${prevDate}) IS NOT NULL
  AND (${prevDate}) = ${hoje}
)`;

const noPrazoCond = `(
  dados->>'COMPROVANTE ENTREGA' = 'NAO'
  AND (${prevDate}) IS NOT NULL
  AND (${prevDate}) > ${hoje}
)`;

export async function GET(req: NextRequest) {
  const nome = req.nextUrl.searchParams.get("nome")?.toUpperCase().trim() ?? "";
  if (!nome || !RESPONSAVEIS_ALLOWED.has(nome)) {
    return NextResponse.json({ error: "Responsável inválido" }, { status: 400 });
  }

  // UFs desse responsável
  const ufs = Object.entries(UF_RESP)
    .filter(([, r]) => r === nome)
    .map(([uf]) => uf);
  const ufsIn = ufs.map(u => `'${u}'`).join(",");

  const [kpis, por_uf, atrasados, projecao] = await Promise.all([

    // KPIs globais do responsável
    query(`
      SELECT
        COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO')::int AS em_movimento,
        COUNT(*) FILTER (WHERE ${atrasoCond})::int                          AS atraso,
        COUNT(*) FILTER (WHERE ${hojeEntrega})::int                        AS entregas_dia,
        COUNT(*) FILTER (WHERE ${noPrazoCond})::int                        AS no_prazo,
        COALESCE(ROUND(
          COUNT(*) FILTER (WHERE ${noPrazoCond}) * 100.0
          / NULLIF(COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO'), 0)
        , 0)::int, 0) AS pontualidade
      FROM emissoes
      WHERE dados->>'UF.1' IN (${ufsIn})
    `),

    // Breakdown por UF
    query(`
      SELECT
        dados->>'UF.1' AS uf,
        COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO')::int AS em_movimento,
        COUNT(*) FILTER (WHERE ${atrasoCond})::int                          AS atraso,
        COUNT(*) FILTER (WHERE ${hojeEntrega})::int                        AS entregas_dia,
        COUNT(*) FILTER (WHERE ${noPrazoCond})::int                        AS no_prazo,
        COALESCE(ROUND(
          COUNT(*) FILTER (WHERE ${noPrazoCond}) * 100.0
          / NULLIF(COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO'), 0)
        , 0)::int, 0) AS pontualidade
      FROM emissoes
      WHERE dados->>'UF.1' IN (${ufsIn})
      GROUP BY 1
      HAVING COUNT(*) FILTER (WHERE dados->>'COMPROVANTE ENTREGA' = 'NAO') > 0
      ORDER BY 3 DESC, 2 DESC
    `),

    // Top 10 CTes em atraso
    query(`
      SELECT
        dados->>'MINUTA'        AS minuta,
        dados->>'CLIENTE'       AS cliente,
        dados->>'DESTINO'       AS destino,
        dados->>'UF.1'            AS uf,
        dados->>'PREV. ENTREGA' AS prev_entrega,
        dados->>'TIPO EMISSAO'  AS servico,
        (${hoje} - (${prevDate}))::int AS dias_atraso
      FROM emissoes
      WHERE dados->>'UF.1' IN (${ufsIn})
        AND ${atrasoCond}
      ORDER BY (${prevDate}) ASC
      LIMIT 10
    `),

    // Projeção 5 dias
    query(`
      SELECT
        (${prevDate})::text AS data,
        COUNT(*)::int       AS total
      FROM emissoes
      WHERE dados->>'UF.1' IN (${ufsIn})
        AND dados->>'COMPROVANTE ENTREGA' = 'NAO'
        AND (${prevDate}) IS NOT NULL
        AND (${prevDate}) BETWEEN ${hoje} AND ${hoje} + 5
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  return NextResponse.json({
    nome,
    ufs: ufs.map(uf => ({ uf, nome: UF_NOME[uf] ?? uf })),
    kpis: kpis[0] ?? { em_movimento: 0, atraso: 0, entregas_dia: 0, no_prazo: 0, pontualidade: 0 },
    por_uf,
    atrasados,
    projecao,
  });
}

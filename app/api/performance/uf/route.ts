import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { UF_RESP } from "@/lib/sac-ufs";

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

const UF_REGIAO: Record<string, string> = {
  AC:"Norte", AM:"Norte", AP:"Norte", PA:"Norte", RO:"Norte", RR:"Norte", TO:"Norte",
  AL:"Nordeste", BA:"Nordeste", CE:"Nordeste", MA:"Nordeste", PB:"Nordeste",
  PE:"Nordeste", PI:"Nordeste", RN:"Nordeste", SE:"Nordeste",
  DF:"Centro-Oeste", GO:"Centro-Oeste", MS:"Centro-Oeste", MT:"Centro-Oeste",
  ES:"Sudeste", MG:"Sudeste", RJ:"Sudeste", SP:"Sudeste",
  PR:"Sul", RS:"Sul", SC:"Sul",
};

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
  const uf = req.nextUrl.searchParams.get("uf")?.toUpperCase().trim() ?? "";
  if (!uf || !/^[A-Z]{2}$/.test(uf)) {
    return NextResponse.json({ error: "UF inválida" }, { status: 400 });
  }

  const [kpis, atrasados, projecao] = await Promise.all([

    // KPIs da UF
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
      WHERE dados->>'UF.1' = '${uf}'
    `),

    // CTes em atraso — top 8
    query(`
      SELECT
        dados->>'MINUTA'          AS minuta,
        dados->>'CLIENTE'         AS cliente,
        dados->>'DESTINO'         AS destino,
        dados->>'PREV. ENTREGA'   AS prev_entrega,
        dados->>'TIPO EMISSAO'    AS servico,
        (${hoje} - (${prevDate}))::int AS dias_atraso
      FROM emissoes
      WHERE dados->>'UF.1' = '${uf}'
        AND ${atrasoCond}
      ORDER BY (${prevDate}) ASC
      LIMIT 8
    `),

    // Projeção 5 dias
    query(`
      SELECT
        (${prevDate})::text AS data,
        COUNT(*)::int       AS total
      FROM emissoes
      WHERE dados->>'UF.1' = '${uf}'
        AND dados->>'COMPROVANTE ENTREGA' = 'NAO'
        AND (${prevDate}) IS NOT NULL
        AND (${prevDate}) BETWEEN ${hoje} AND ${hoje} + 5
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  return NextResponse.json({
    uf,
    nome: UF_NOME[uf] ?? uf,
    regiao: UF_REGIAO[uf] ?? "—",
    responsavel: UF_RESP[uf] ?? "—",
    kpis: kpis[0] ?? { em_movimento: 0, atraso: 0, entregas_dia: 0, no_prazo: 0, pontualidade: 0 },
    atrasados,
    projecao,
  });
}

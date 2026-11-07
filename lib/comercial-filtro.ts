// Filtros do Painel Comercial (cliente + período), compartilhados entre
// /api/comercial e /api/comercial/export.
//
// Cliente: o parâmetro ?cliente= aceita dois formatos.
//   - id de grupo de lib/cliente-grupos.ts (ex: "medlevensohn") → filtra pelos
//     CNPJs do grupo, juntando as filiais;
//   - "nome:<CLIENTE>" → qualquer outro cliente do relatório 106, pelo nome
//     cru da coluna CLIENTE, excluindo CNPJs que já pertencem a um grupo (é o
//     mesmo critério do ranking, que agrupa por COALESCE(grupo, CLIENTE)).
//
// Período: ?de=YYYY-MM-DD&ate=YYYY-MM-DD (data de emissão, coluna DATA).

import { CLIENTE_GRUPOS } from "@/lib/cliente-grupos";

const PREFIXO_NOME = "nome:";

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

const CNPJS_AGRUPADOS = CLIENTE_GRUPOS.flatMap(g => g.cnpjs);

/** Condição SQL sobre `dados` para o cliente escolhido; "TRUE" quando não há filtro ou o valor é inválido. */
export function clienteFilterSQL(clienteParam: string): string {
  const grupo = CLIENTE_GRUPOS.find(g => g.id === clienteParam);
  if (grupo) {
    return `dados->>'CNPJ' = ANY(ARRAY[${grupo.cnpjs.map(sqlStr).join(",")}]::text[])`;
  }
  if (clienteParam.startsWith(PREFIXO_NOME)) {
    const nome = clienteParam.slice(PREFIXO_NOME.length).trim();
    // Nome vem da URL: só aceita texto imprimível de tamanho razoável e escapa aspas.
    if (nome && nome.length <= 200 && !/[\u0000-\u001f]/.test(nome)) {
      return `(TRIM(dados->>'CLIENTE') = ${sqlStr(nome)}
        AND COALESCE(dados->>'CNPJ','') <> ALL(ARRAY[${CNPJS_AGRUPADOS.map(sqlStr).join(",")}]::text[]))`;
    }
  }
  return "TRUE";
}

/** Rótulo legível do cliente escolhido (para a planilha exportada). */
export function clienteLabel(clienteParam: string): string {
  const grupo = CLIENTE_GRUPOS.find(g => g.id === clienteParam);
  if (grupo) return grupo.label;
  if (clienteParam.startsWith(PREFIXO_NOME)) return clienteParam.slice(PREFIXO_NOME.length).trim();
  return "Todos os clientes";
}

/** SQL que lista os clientes do 106 que NÃO pertencem a um grupo (nome cru, ordem alfabética). */
export function clientesAvulsosSQL(cnpjGrupoValues: string): string {
  return `
    WITH cnpj_grupo (cnpj, grupo) AS (VALUES ${cnpjGrupoValues})
    SELECT DISTINCT TRIM(d.dados->>'CLIENTE') AS nome
    FROM emissoes_dia d
    LEFT JOIN cnpj_grupo g ON g.cnpj = d.dados->>'CNPJ'
    WHERE g.cnpj IS NULL AND NULLIF(TRIM(d.dados->>'CLIENTE'),'') IS NOT NULL
    ORDER BY 1
  `;
}

export const clienteNomeId = (nome: string) => `${PREFIXO_NOME}${nome}`;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export interface Periodo { de: string; ate: string }

/** Lê ?de= e ?ate= (YYYY-MM-DD). Devolve null se faltar um dos dois ou se forem inválidos. */
export function lerPeriodo(params: URLSearchParams): Periodo | null {
  const de  = (params.get("de")  ?? "").trim();
  const ate = (params.get("ate") ?? "").trim();
  if (!ISO.test(de) || !ISO.test(ate)) return null;
  if (Number.isNaN(Date.parse(de)) || Number.isNaN(Date.parse(ate))) return null;
  return de <= ate ? { de, ate } : { de: ate, ate: de };
}

/** Condição SQL: data de emissão dentro do período (inclusive). */
export function periodoSQL(p: Periodo): string {
  return `TO_DATE(dados->>'DATA','DD/MM/YYYY') BETWEEN DATE '${p.de}' AND DATE '${p.ate}'`;
}

/** "2026-01-01" → "01/01/2026" */
export const isoParaBR = (iso: string) => iso.split("-").reverse().join("/");

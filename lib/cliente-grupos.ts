// Mapa CNPJ → grupo comercial canônico.
//
// Por que existe: na base do Brudam, o mesmo grupo cliente aparece com
// nomes diferentes (filiais, razões sociais distintas, CDs em outros
// estados). Rankings e relatórios precisam consolidar por grupo, não por
// nome ou CNPJ individual.
//
// Os 9 grupos abaixo vêm de lib/users.ts (clientes com portal). Outros
// grupos podem ser acrescentados aqui sem precisar mexer no users.
//
// IMPORTANTE: mantenha em sincronia com lib/users.ts quando adicionar
// CNPJs a um cliente que tem portal.

export interface ClienteGrupo {
  id: string;       // slug interno
  label: string;    // nome exibido no ranking/portal
  cnpjs: string[];  // CNPJs (formato com pontuação igual ao do Brudam)
}

export const CLIENTE_GRUPOS: ClienteGrupo[] = [
  {
    id: "medlevensohn",
    label: "MEDLEVENSOHN",
    cnpjs: [
      "25.346.626/0001-85","27.986.353/0001-69","00.577.604/0003-67","05.343.029/0001-90",
      "05.343.029/0004-32",  // filial confirmada por faturamento (2026-06)
      "06.626.253/0001-51","48.495.866/0001-47","46.523.056/0001-21","27.844.493/0001-00",
      "26.571.648/0001-01","07.122.223/0001-70","50.644.565/0001-80","45.739.083/0001-73",
      "16.647.278/0001-95","61.585.865/2128-41",
    ],
  },
  {
    id: "payot",
    label: "PAYOT",
    cnpjs: [
      "12.806.592/0001-12","61.183.729/0008-01","49.768.372/0001-51","07.246.802/0001-25",
      "02.167.473/0002-94","32.356.707/0001-21","02.167.473/0001-03","02.167.473/0004-56",
    ],
  },
  {
    id: "aspenpharma",
    label: "ASPEN PHARMA",
    cnpjs: [
      "17.008.753/0001-46","04.899.316/0351-75","73.773.129/0001-06","88.212.113/0160-14",
      "02.433.631/0001-20","03.649.560/0001-60","24.112.048/0001-50","04.425.347/0002-18",
      "73.081.382/0001-07","59.610.485/0001-88","09.403.367/0001-20","07.593.518/0001-25",
      "31.672.475/0001-58","01.122.809/0002-30","61.190.096/0008-69",
    ],
  },
  {
    id: "zydus",
    label: "ZYDUS",
    cnpjs: [
      "01.206.820/0031-12","07.224.991/0006-40","04.899.316/0351-75","05.254.971/0012-34",
      "05.254.971/0011-53","05.254.971/0008-58",  // filiais confirmadas por faturamento (2026-06)
      "06.626.253/0633-15","07.224.991/0015-30","01.206.820/0024-93","07.224.991/0011-07",
      "07.224.991/0017-00","61.940.292/0055-20","61.940.292/0066-82","04.429.478/0001-92",
      "01.206.820/0032-01","06.626.253/1493-84","01.206.820/0008-73","61.940.292/0064-10",
      "07.224.991/0012-98","06.626.253/0669-26","06.626.253/0875-08","06.626.253/0124-00",
      "61.940.292/0056-00","89.735.070/0001-00","45.453.214/0024-48","04.899.316/0252-93",
    ],
  },
  // BIOCHIMICO: CNPJ corrigido baseado em faturamento real (2026-06) —
  // raiz 33.258.401 (não 23.668.196 que estava em users.ts).
  { id: "biochimico", label: "BIOCHIMICO", cnpjs: ["33.258.401/0014-10"] },
  { id: "caudalie",   label: "CAUDALIE",   cnpjs: ["15.204.861/0008-35"] },
  { id: "clarevet",   label: "CLARE VET",  cnpjs: ["50.765.434/0001-50","50.765.434/0002-31"] },
  { id: "oncovit",    label: "ONCOVIT",    cnpjs: ["07.826.037/0001-12","10.586.940/0001-68","10.586.940/0004-00"] },
  // UNILOG: CNPJs corrigidos baseado em faturamento real (2026-06) —
  // raiz 09.403.367 (não 05.656.727/13.537.247 que estavam em users.ts).
  { id: "unilog",     label: "UNILOG EXPRESS", cnpjs: ["09.403.367/0011-00","09.403.367/0001-20","09.403.367/0010-11"] },
];

// SQL VALUES clause: "('cnpj1','GRUPO1'),('cnpj2','GRUPO1'),..."
// Usar em CTE pra JOIN com emissoes/emissoes_dia.
export function cnpjGrupoValuesSQL(): string {
  const rows: string[] = [];
  for (const g of CLIENTE_GRUPOS) {
    for (const cnpj of g.cnpjs) {
      // CNPJs e labels são literais controlados nesta lib (nunca entrada de
      // usuário), mas escapamos aspas simples por consistência.
      const cnpjEsc  = cnpj.replace(/'/g, "''");
      const labelEsc = g.label.replace(/'/g, "''");
      rows.push(`('${cnpjEsc}','${labelEsc}')`);
    }
  }
  return rows.join(",");
}

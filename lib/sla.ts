// Regras de SLA de entregas (relatório 106 / tabela emissoes_dia).
// Fonte única de verdade — usada pela API (/api/sla-entregas) e pelo export.
//
// Conceito: só notas ENTREGUES (COMPROVANTE ENTREGA='SIM'), comparando a
// DATA ENTREGA real com a PREV. ENTREGA prometida. Período conta por DATA DE
// ENTREGA. Datas vêm em ISO "2026-01-22 03:00:00" — a hora é constante/default,
// comparamos só a parte de data.

export const ENT  = `SUBSTRING(dados->>'DATA ENTREGA',1,10)::date`;
export const PREV = `SUBSTRING(dados->>'PREV. ENTREGA',1,10)::date`;

// Valor da mercadoria / nota fiscal (campo 'VALOR' do 106, ISO decimal "676.14").
// Parse defensivo: só soma se casar o formato numérico, senão 0.
export const VALOR = `CASE WHEN dados->>'VALOR' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (dados->>'VALOR')::numeric ELSE 0 END`;

// Linhas válidas pra SLA: entregues, com data de entrega E prazo em ISO.
export const VALID = `dados->>'COMPROVANTE ENTREGA' = 'SIM'
  AND dados->>'DATA ENTREGA'  ~ '^\\d{4}-\\d{2}-\\d{2}'
  AND dados->>'PREV. ENTREGA' ~ '^\\d{4}-\\d{2}-\\d{2}'`;

// ─── Polo de entrega: Região Metropolitana × Interior ──────────────────────
//
// ORIGEM: cadastro de praças do Brudam (export "brudam_1784205246510.xls",
// obtido em 2026-07-16). Extraídas APENAS as praças "<UF> - REGIAO
// METROPOLITANA" (157 cidades em 27 UFs) — as listas "DEMAIS CIDADES" do mesmo
// cadastro foram ignoradas de propósito: vêm poluídas com duplicatas em massa
// (BA com 5.784 entradas p/ 417 municípios reais, MG com 7.607 p/ 853). Grupos
// de rota/polo (BRASILIA - ROTA 1/2/3, RJ LOCALIDADE 1-6, SP - INTERIOR I etc.)
// também ficaram de fora: não descrevem o corte metro/interior.
//
// REGRA: cidade de destino está na lista da sua UF → Região Metropolitana;
// qualquer outra → Interior. A capital está dentro da sua metropolitana.
//
// A grafia bate com o 106 porque ambos saem do mesmo Brudam (MAIÚSCULA, sem
// acento). Se o Brudam mudar o cadastro de praças, reexportar e regerar aqui.
export const METRO_CIDADES: Record<string, string[]> = {
  AC: ["RIO BRANCO"],
  AL: ["BARRA DE SANTO ANTONIO", "BARRA DE SAO MIGUEL", "COQUEIRO SECO", "MACEIO", "MARECHAL DEODORO", "MESSIAS", "PARIPUEIRA", "PILAR", "RIO LARGO", "SANTA LUZIA DO NORTE"],
  AM: ["MANAUS"],
  AP: ["MACAPA"],
  BA: ["CAMACARI", "CANDEIAS", "DIAS D AVILA", "LAURO DE FREITAS", "MADRE DE DEUS", "SALVADOR", "SIMOES FILHO"],
  CE: ["AQUIRAZ", "CAUCAIA", "EUSEBIO", "FORTALEZA", "GUAIUBA", "HORIZONTE", "MARACANAU", "MARANGUAPE", "PACATUBA", "PINDORETAMA"],
  DF: ["BRASILIA", "BRAZLANDIA", "CEILANDIA", "GAMA", "GUARA", "SAMAMBAIA", "SANTA MARIA", "SOBRADINHO", "TAGUATINGA"],
  ES: ["CARIACICA", "FUNDAO", "SERRA", "VIANA", "VILA VELHA", "VITORIA"],
  GO: ["APARECIDA DE GOIANIA", "GOIANIA", "TRINDADE"],
  MA: ["ALCANTARA", "PACO DO LUMIAR", "RAPOSA", "SAO JOSE DE RIBAMAR", "SAO LUIS"],
  MG: ["BELO HORIZONTE", "BETIM", "CONFINS", "CONTAGEM", "RIBEIRAO DAS NEVES"],
  MS: ["CAMPO GRANDE"],
  MT: ["CUIABA", "VARZEA GRANDE"],
  PA: ["ANANINDEUA", "BELEM"],
  PB: ["BAYEUX", "CABEDELO", "CONDE", "CRUZ DO ESPIRITO SANTO", "JOAO PESSOA"],
  PE: ["ABREU E LIMA", "ARACOIABA", "CABO DE SANTO AGOSTINHO", "CAMARAGIBE", "IGARASSU", "ILHA DE ITAMARACA", "IPOJUCA", "ITAPISSUMA", "JABOATAO DOS GUARARAPES", "MORENO", "OLINDA", "PAULISTA", "RECIFE", "SAO LOURENCO DA MATA"],
  PI: ["ALTOS", "DEMERVAL LOBAO", "JOSE DE FREITAS", "LAGOA DO PIAUI", "TERESINA"],
  PR: ["ALMIRANTE TAMANDARE", "ARAUCARIA", "CAMPINA GRANDE DO SUL", "CAMPO LARGO", "COLOMBO", "CURITIBA", "PINHAIS", "SAO JOSE DOS PINHAIS"],
  RJ: ["BELFORD ROXO", "DUQUE DE CAXIAS", "MESQUITA", "NILOPOLIS", "NITEROI", "NOVA IGUACU", "QUEIMADOS", "RIO DE JANEIRO", "SAO GONCALO", "SAO JOAO DE MERITI", "SEROPEDICA"],
  RN: ["CEARA-MIRIM", "EXTREMOZ", "MACAIBA", "NATAL", "NISIA FLORESTA", "PARNAMIRIM", "SAO GONCALO DO AMARANTE", "SAO JOSE DE MIPIBU"],
  RO: ["PORTO VELHO"],
  RR: ["BOA VISTA"],
  RS: ["ALVORADA", "CACHOEIRINHA", "CANOAS", "ELDORADO DO SUL", "ESTEIO", "GRAVATAI", "GUAIBA", "NOVA SANTA RITA", "NOVO HAMBURGO", "PORTO ALEGRE", "SAO LEOPOLDO", "SAPUCAIA DO SUL", "VIAMAO"],
  SC: ["AGUAS MORNAS", "FLORIANOPOLIS", "PALHOCA", "SANTO AMARO DA IMPERATRIZ", "SAO JOSE", "SAO PEDRO DE ALCANTARA"],
  SE: ["ARACAJU", "BARRA DOS COQUEIROS", "NOSSA SENHORA DO SOCORRO", "SAO CRISTOVAO"],
  SP: ["BARUERI", "BELA VISTA", "COTIA", "DIADEMA", "FERRAZ DE VASCONCELOS", "GUARULHOS", "ITAPECERICA DA SERRA", "ITAQUAQUECETUBA", "MAUA", "OSASCO", "POA", "RIBEIRAO PIRES", "SANTO ANDRE", "SAO BERNARDO DO CAMPO", "SAO CAETANO DO SUL", "SAO PAULO", "TABOAO DA SERRA"],
  TO: ["PALMAS"],
};

// Cidade destino sem o sufixo " - UF" (ex.: "BRASILIA - DF" → "BRASILIA").
export const CITY = `TRIM(SPLIT_PART(dados->>'CIDADE.2', ' - ', 1))`;

const sqlStr = (s: string) => `'${s.replace(/'/g, "''")}'`;

// Expressão booleana SQL: destino é região metropolitana da sua UF?
export const IS_METRO = Object.entries(METRO_CIDADES)
  .map(([uf, cidades]) => `(dados->>'UF.1' = '${uf}' AND ${CITY} IN (${cidades.map(sqlStr).join(",")}))`)
  .join(" OR ");

// Situação de prazo como texto (pra planilha).
export const SITUACAO = `CASE
  WHEN ${ENT} < ${PREV} THEN 'Antes do prazo'
  WHEN ${ENT} = ${PREV} THEN 'No prazo'
  ELSE 'Fora do prazo' END`;

export const POLO = `CASE WHEN ${IS_METRO} THEN 'Região Metropolitana' ELSE 'Interior' END`;

export const isMes = (s: string) => /^\d{4}-\d{2}$/.test(s);

// ─── UF → Região (IBGE) ────────────────────────────────────────────────────
export const UF_REGIAO: Record<string, string> = {
  AC: "Norte", AM: "Norte", AP: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MS: "Centro-Oeste", MT: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

// Expressão SQL: UF.1 → nome da região (igual ao dicionário acima).
export const REGIAO = `CASE
  WHEN dados->>'UF.1' IN ('AC','AM','AP','PA','RO','RR','TO') THEN 'Norte'
  WHEN dados->>'UF.1' IN ('AL','BA','CE','MA','PB','PE','PI','RN','SE') THEN 'Nordeste'
  WHEN dados->>'UF.1' IN ('DF','GO','MS','MT') THEN 'Centro-Oeste'
  WHEN dados->>'UF.1' IN ('ES','MG','RJ','SP') THEN 'Sudeste'
  WHEN dados->>'UF.1' IN ('PR','RS','SC') THEN 'Sul'
  ELSE NULL
END`;

export const REGIOES = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"] as const;

// Cores das regiões (usadas no gráfico de atrasos por região).
export const REGIAO_COR: Record<string, string> = {
  "Norte":        "#eab308", // amarelo
  "Nordeste":     "#f97316", // laranja
  "Centro-Oeste": "#38bdf8", // azul claro
  "Sudeste":      "#ec4899", // rosa
  "Sul":          "#22c55e", // verde
};

// WHERE do card (além de VALID + período). kpiId → condição.
export const CARD_WHERE: Record<string, string> = {
  total:          "TRUE",
  antes:          `${ENT} < ${PREV}`,
  "no-prazo":     `${ENT} = ${PREV}`,
  fora:           `${ENT} > ${PREV}`,
  metropolitana:  `(${IS_METRO})`,
  interior:       `NOT (${IS_METRO})`,
};

export const CARD_LABEL: Record<string, string> = {
  total:          "Total de Entregas",
  antes:          "Entregas Antes do Prazo",
  "no-prazo":     "Entregas No Prazo",
  fora:           "Entregas Fora do Prazo",
  metropolitana:  "Entregas — Região Metropolitana",
  interior:       "Entregas — Interior",
};

// Mapa oficial UF de destino → responsável SAC de rastreio.
// FONTE: e-mail de redistribuição do SAC (05/11/2026), que substitui a planilha
// "SAC rastreio UF - Dedicado 21-07.xlsx". Mayara e Jheniffer saíram do SAC;
// entraram Kamilla (Nordeste, parte) e Acsa (Centro-Oeste + MG/RJ).
//
// Fonte ÚNICA — importado por /api/performance e /api/performance/responsavel.
// Antes cada rota tinha sua própria cópia e elas já haviam DIVERGIDO (PB/PE e
// MT ficavam em responsáveis diferentes entre os dois arquivos). Manter aqui
// evita esse tipo de bug.
export const UF_RESP: Record<string, string> = {
  // Norte — Sabrina
  AC: "SABRINA", AP: "SABRINA", AM: "SABRINA", PA: "SABRINA", RO: "SABRINA", RR: "SABRINA", TO: "SABRINA",
  // Nordeste — Kamilla
  AL: "KAMILLA", BA: "KAMILLA", CE: "KAMILLA", MA: "KAMILLA", PB: "KAMILLA",
  // Nordeste — Luany
  PE: "LUANY", PI: "LUANY", RN: "LUANY", SE: "LUANY",
  // Centro-Oeste inteiro + MG e RJ — Acsa
  GO: "ACSA", MT: "ACSA", MS: "ACSA", DF: "ACSA", MG: "ACSA", RJ: "ACSA",
  // Sudeste — ES Taylon, SP Laís
  ES: "TAYLON",
  SP: "LAIS",
  // Sul — Ranyeri
  PR: "RANYERI", RS: "RANYERI", SC: "RANYERI",
};

// Ordem de exibição dos cards por responsável (Norte → Sul).
export const RESPONSAVEIS = ["SABRINA", "KAMILLA", "LUANY", "ACSA", "TAYLON", "LAIS", "RANYERI"];

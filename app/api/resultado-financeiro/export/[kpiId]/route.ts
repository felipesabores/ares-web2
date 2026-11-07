// Export XLSX dos cards do Resultado Financeiro (atalho 147).
//
// XLSX com 1 aba:
//   Linhas 1-6:  Metadados (KPI, período, total destacado, qtd, gerado em, fonte)
//   Linha 8:     Instrução de auditoria
//   Linha 10:    Cabeçalhos das colunas (negrito)
//   Linha 11+:   Rows de custos_operacao / custos_operacao_historico (deduplicado por MINUTA)
//   Última:      Total da coluna destacada (negrito)

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = "America/Sao_Paulo";

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function fmtMes(ym: string) {
  if (!ym) return ym;
  const [y, m] = ym.split("-");
  return `${MONTHS_PT[parseInt(m) - 1]}/${y}`;
}

function brDateParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [year, month, day] = fmt.format(d).split("-").map(Number);
  return { year, month, day };
}

// Parse mixed BR number: "1.234,56" → 1234.56 | "46051" (centavos) → 460.51
function parseMonetary(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n / 100;
}

// PESO: integer = já em kg, vírgula = decimal
function parsePeso(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

const DATE_FILTER = `
  dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
  AND LENGTH(REGEXP_REPLACE(dados->>'MINUTA', '[^0-9]', '', 'g')) >= 6
`;

const EXPORT_COLS = [
  "DATA", "MINUTA", "CT-E", "CLIENTE TOMADOR", "DESTINO",
  "SERVICO", "TIPO CTE", "VOLUMES", "PESO",
  "FRETE", "VALOR NF", "RESULTADO", "MARGEM",
];

// Colunas da exportação da tabela (sem CT-E, Serviço, Tipo)
const TABELA_COLS = [
  "DATA", "MINUTA", "CLIENTE TOMADOR", "DESTINO", "TAB. COMERCIAL",
  "PESO", "FRETE", "RESULTADO", "VALOR NF", "MARGEM",
];

interface KpiSpec {
  label: string;
  highlightCol: string;   // coluna destacada em amarelo
  totalLabel: string;
  b3Label?: string;       // override do label "Total exibido no card:"
  filterRows?: (row: Record<string, unknown>) => boolean; // filtra linhas antes do XLSX
  getTotalAndFmt: (rows: Record<string, unknown>[]) => { total: number; numFmt: string; color: string };
}

const KPI_SPECS: Record<string, KpiSpec> = {
  faturamento: {
    label: "Faturamento do Período",
    highlightCol: "FRETE",
    totalLabel: "TOTAL FATURAMENTO",
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parseMonetary(r["FRETE"]), 0),
      numFmt: '"R$" #,##0.00',
      color: "FFFBBF24",
    }),
  },
  resultado: {
    label: "Resultado do Período",
    highlightCol: "RESULTADO",
    totalLabel: "TOTAL RESULTADO",
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parseMonetary(r["RESULTADO"]), 0),
      numFmt: '"R$" #,##0.00',
      color: "FF10B981",
    }),
  },
  peso: {
    label: "Peso Transportado no Período",
    highlightCol: "PESO",
    totalLabel: "TOTAL PESO (kg)",
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parsePeso(r["PESO"]), 0),
      numFmt: "#,##0.00",
      color: "FF38BDF8",
    }),
  },
  "valor-carga": {
    label: "Valor de Carga no Período",
    highlightCol: "VALOR NF",
    totalLabel: "TOTAL VALOR NF",
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parseMonetary(r["VALOR NF"]), 0),
      numFmt: '"R$" #,##0.00',
      color: "FFA78BFA",
    }),
  },
  tabela: {
    label: "CTes do Período",
    highlightCol: "RESULTADO",
    totalLabel: "TOTAL RESULTADO",
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parseMonetary(r["RESULTADO"]), 0),
      numFmt: '"R$" #,##0.00',
      color: "FF10B981",
    }),
  },
  "pct-frete": {
    label: "% de Frete do Período",
    highlightCol: "FRETE",
    totalLabel: "% FRETE TOTAL",
    getTotalAndFmt: (rows) => {
      const totalFrete = rows.reduce((s, r) => s + parseMonetary(r["FRETE"]), 0);
      const totalNF    = rows.reduce((s, r) => s + parseMonetary(r["VALOR NF"]), 0);
      return {
        total: totalNF > 0 ? (totalFrete / totalNF) * 100 : 0,
        numFmt: '0.00"%"',
        color: "FFFB923C",
      };
    },
  },
  "ctes-prejuizo": {
    label: "CTes no Prejuízo",
    highlightCol: "RESULTADO",
    totalLabel: "TOTAL RESULTADO (perdas)",
    b3Label: "Total das perdas:",
    filterRows: (row) => parseMonetary(row["RESULTADO"]) < 0,
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parseMonetary(r["RESULTADO"]), 0),
      numFmt: '"R$" #,##0.00',
      color: "FFEF4444",
    }),
  },
  "margem-baixa": {
    label: "CTes com Margem Abaixo de 10%",
    highlightCol: "RESULTADO",
    totalLabel: "TOTAL RESULTADO",
    b3Label: "Total resultado (margem < 10%):",
    filterRows: (row) => {
      const frete     = parseMonetary(row["FRETE"]);
      const resultado = parseMonetary(row["RESULTADO"]);
      return frete > 0 && (resultado / frete) * 100 < 10;
    },
    getTotalAndFmt: (rows) => ({
      total: rows.reduce((s, r) => s + parseMonetary(r["RESULTADO"]), 0),
      numFmt: '"R$" #,##0.00',
      color: "FFFB923C",
    }),
  },
};

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ kpiId: string }> },
) {
  try {
    const { kpiId } = await ctx.params;
    const spec = KPI_SPECS[kpiId];
    if (!spec) {
      return NextResponse.json({ error: `KPI desconhecido: ${kpiId}` }, { status: 404 });
    }

    const start   = req.nextUrl.searchParams.get("start")   ?? "";
    const end     = req.nextUrl.searchParams.get("end")     ?? "";
    const cliente = req.nextUrl.searchParams.get("cliente") ?? "";

    const whereDate = start && end
      ? `TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') BETWEEN '${start}' AND '${end}'`
      : "TRUE";

    const safeCliente = cliente.replace(/'/g, "''");
    const whereCliente = cliente
      ? `dados->>'CLIENTE TOMADOR' = '${safeCliente}'`
      : "TRUE";

    const rows = await query<{ dados: Record<string, unknown>; tabela_comercial: string | null }>(`
      SELECT t.dados, COALESCE(ed.cv, em.dados->>'CV') AS tabela_comercial FROM (
        SELECT DISTINCT ON (REGEXP_REPLACE(dados->>'MINUTA','[^0-9]','','g'))
          dados
        FROM (
          SELECT dados, 1 AS src FROM custos_operacao_historico
          UNION ALL
          SELECT dados, 2 AS src FROM custos_operacao
        ) all_rows
        WHERE ${DATE_FILTER}
        ORDER BY REGEXP_REPLACE(dados->>'MINUTA','[^0-9]','','g'), src
      ) t
      LEFT JOIN emissoes em
        ON em.id_minuta = REGEXP_REPLACE(t.dados->>'MINUTA','[^0-9]','','g')
      LEFT JOIN LATERAL (
        SELECT e.dados->>'CV' AS cv
        FROM emissoes_dia e
        WHERE (e.dados->>'MINUTA') = REGEXP_REPLACE(t.dados->>'MINUTA','[^0-9]','','g')
        LIMIT 1
      ) ed ON TRUE
      WHERE ${whereDate.replace(/dados->>/g, "t.dados->>")} AND ${whereCliente.replace(/dados->>/g, "t.dados->>")}
      ORDER BY TO_DATE(t.dados->>'DATA','DD/MM/YYYY'), t.dados->>'MINUTA'
    `);

    const allData = rows.map(r => ({ ...r.dados, "TAB. COMERCIAL": r.tabela_comercial ?? "" } as Record<string, unknown>));
    const data = spec.filterRows ? allData.filter(spec.filterRows) : allData;
    const { total, numFmt, color } = spec.getTotalAndFmt(data);
    const cols = kpiId === "tabela" ? TABELA_COLS : EXPORT_COLS;
    const hoje = new Date();
    const periodo = start && end
      ? start === end ? fmtMes(start) : `${fmtMes(start)} a ${fmtMes(end)}`
      : "Todo o histórico";

    // ── Worksheet ───────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "ARES — Acerta Express";
    wb.created = hoje;
    const ws = wb.addWorksheet(spec.label, { views: [{ state: "frozen", ySplit: 10 }] });

    const labelStyle: Partial<ExcelJS.Style> = { font: { bold: true, color: { argb: "FF64748B" }, size: 11 } };
    const valueStyle: Partial<ExcelJS.Style> = { font: { size: 11 } };

    ws.getCell("A1").value = "KPI:";       ws.getCell("A1").style = labelStyle;
    ws.getCell("B1").value = spec.label;   ws.getCell("B1").style = { font: { bold: true, size: 14 } };

    ws.getCell("A2").value = "Período:";   ws.getCell("A2").style = labelStyle;
    ws.getCell("B2").value = periodo;      ws.getCell("B2").style = valueStyle;

    ws.getCell("A3").value = spec.b3Label ?? "Total exibido no card:"; ws.getCell("A3").style = labelStyle;
    const totalCell = ws.getCell("B3");
    totalCell.value = total;
    totalCell.style = {
      numFmt,
      font: { bold: true, size: 16, color: { argb: color } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: color.replace(/^FF/, "FF") + "20" } },
      border: {
        top: { style: "thin", color: { argb: color } }, bottom: { style: "thin", color: { argb: color } },
        left: { style: "thin", color: { argb: color } }, right: { style: "thin", color: { argb: color } },
      },
    };

    ws.getCell("A4").value = "Qtd de CTe(s):"; ws.getCell("A4").style = labelStyle;
    ws.getCell("B4").value = data.length;       ws.getCell("B4").style = { font: { bold: true } };

    ws.getCell("A5").value = "Gerado em:";      ws.getCell("A5").style = labelStyle;
    ws.getCell("B5").value = hoje.toLocaleString("pt-BR", { timeZone: TZ }); ws.getCell("B5").style = valueStyle;

    ws.getCell("A6").value = "Fonte:";          ws.getCell("A6").style = labelStyle;
    ws.getCell("B6").value = "custos_operacao_historico + custos_operacao (atalho 147 do Brudam)";
    ws.getCell("B6").style = valueStyle;

    const instrCell = ws.getCell("A8");
    instrCell.value = `Para auditar: rodar atalho 147 no Brudam pelo mesmo período → conferir coluna ${spec.highlightCol}.`;
    instrCell.style = { font: { italic: true, color: { argb: "FF6B7280" }, size: 10 } };
    ws.mergeCells(`A8:${String.fromCharCode(64 + cols.length)}8`);

    // Cabeçalho linha 10
    const headerRow = ws.getRow(10);
    cols.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col;
      cell.style = {
        font: { bold: true, color: { argb: "FFFFFFFF" } },
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } },
        alignment: { horizontal: "center" },
        border: { bottom: { style: "thin", color: { argb: "FF374151" } } },
      };
    });

    const highlightIdx = cols.indexOf(spec.highlightCol);

    // Dados linha 11+
    data.forEach((d, i) => {
      const row = ws.getRow(11 + i);
      cols.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        const raw = d[col];
        const isHighlight = idx === highlightIdx;

        if (col === "FRETE" || col === "VALOR NF" || col === "RESULTADO") {
          const n = parseMonetary(raw);
          cell.value = n;
          cell.numFmt = '"R$" #,##0.00';
          if (isHighlight) {
            cell.style = { font: { bold: true }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } } };
          }
        } else if (col === "PESO" || col === "VOLUMES") {
          const n = parsePeso(raw);
          cell.value = n;
          cell.numFmt = "#,##0.00";
          if (isHighlight) {
            cell.style = { font: { bold: true }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } } };
          }
        } else {
          cell.value = raw == null ? "" : String(raw);
        }
      });
    });

    // Linha de total
    const totalRowIdx = 11 + data.length;
    const totalRow = ws.getRow(totalRowIdx);
    totalRow.getCell(1).value = spec.totalLabel;
    totalRow.getCell(1).style = {
      font: { bold: true, size: 12 },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
    };
    ws.mergeCells(totalRowIdx, 1, totalRowIdx, highlightIdx);
    const sumCell = totalRow.getCell(highlightIdx + 1);
    sumCell.value = total;
    sumCell.style = {
      numFmt,
      font: { bold: true, size: 12, color: { argb: color } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } },
      border: {
        top: { style: "double", color: { argb: color } },
        bottom: { style: "thin", color: { argb: color } },
      },
    };
    totalRow.getCell(1).alignment = { horizontal: "right" };

    ws.getColumn(1).width = 26;
    ws.getColumn(2).width = 26;

    cols.forEach((col, idx) => {
      const c = ws.getColumn(idx + 1);
      if (col === "CLIENTE TOMADOR") c.width = 35;
      else if (col === "DESTINO") c.width = 28;
      else if (col === "MINUTA" || col === "CT-E") c.width = 14;
      else if (["FRETE","VALOR NF","RESULTADO"].includes(col)) c.width = 16;
      else c.width = 12;
    });

    const buf = await wb.xlsx.writeBuffer();
    const brDate = brDateParts(hoje);
    const dateSlug = `${brDate.year}-${String(brDate.month).padStart(2,"0")}-${String(brDate.day).padStart(2,"0")}`;
    const timeSlug = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(hoje).replace(":", "");
    const filename = `resultado-financeiro-${kpiId}-${dateSlug}-${timeSlug}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[resultado-financeiro/export]", err);
    return NextResponse.json({ error: "Falha ao gerar XLSX", detail: String(err) }, { status: 500 });
  }
}

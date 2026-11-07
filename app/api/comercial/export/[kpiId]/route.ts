// Export XLSX dos cards do Painel Comercial — pra auditoria.
//
// XLSX com 1 aba:
//   Linhas 1-6:  Metadados (KPI, período, total destacado, qtd, gerado em, fonte)
//   Linha 8:     Instruções de auditoria
//   Linha 10:    Cabeçalhos das colunas (negrito)
//   Linha 11+:   Rows de emissoes_dia (coluna FRETE TOTAL formatada como R$)
//   Última:      Total da coluna FRETE TOTAL (negrito, destacado)
//
// Auditor: baixa → roda 106 Brudam mesmo período → confere FRETE TOTAL.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { clienteFilterSQL, clienteLabel, lerPeriodo, periodoSQL, isoParaBR } from "@/lib/comercial-filtro";
import ExcelJS from "exceljs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;  // generosa pra dataset do mês (3k+ rows)

const HOJE_BR = `((NOW() AT TIME ZONE 'America/Sao_Paulo')::date)`;
const DATE_VALID = `dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'`;

const EXPORT_COLS = [
  "DATA", "HORA", "MINUTA", "CTE", "CLIENTE", "CNPJ",
  "DESTINO", "UF.1", "CIDADE", "PESO",
  "FRETE PESO", "AD VALOREM", "ICMS", "TOTAL COBRADO", "FRETE TOTAL",
  "TIPO EMISSAO", "COMPROVANTE ENTREGA",
];
const FRETE_TOTAL_IDX = EXPORT_COLS.indexOf("FRETE TOTAL");  // 0-based index

const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const TZ = "America/Sao_Paulo";

// Retorna { year, month (1-12), day } no fuso de Brasília — o `new Date()` do
// server roda em UTC no Dokploy, então usar getMonth/getDate direto pode
// retornar valores errados perto da virada de dia.
function brDateParts(d: Date): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const [year, month, day] = fmt.format(d).split("-").map(Number);
  return { year, month, day };
}

interface KpiSpec {
  label: string;
  whereExtra: string;
  periodoLabel: (hoje: Date) => string;
  filenamePrefix: string;
}

const KPI_SPECS: Record<string, KpiSpec> = {
  "fat-dia": {
    label: "Faturamento do Dia",
    whereExtra: `TO_DATE(dados->>'DATA','DD/MM/YYYY') = ${HOJE_BR}`,
    periodoLabel: (h) => h.toLocaleDateString("pt-BR", { timeZone: TZ }),
    filenamePrefix: "faturamento-dia",
  },
  "fat-mes": {
    label: "Faturamento Mensal",
    whereExtra: `TO_DATE(dados->>'DATA','DD/MM/YYYY') >= DATE_TRUNC('month', ${HOJE_BR})::date
                 AND TO_DATE(dados->>'DATA','DD/MM/YYYY') <= ${HOJE_BR}`,
    periodoLabel: (h) => {
      const { year, month, day } = brDateParts(h);
      return `${MONTHS_PT[month - 1]}/${String(year).slice(2)} (01 a ${String(day).padStart(2,"0")})`;
    },
    filenamePrefix: "faturamento-mensal",
  },
  "fat-dia-ant": {
    label: "Faturamento Ontem",
    whereExtra: `TO_DATE(dados->>'DATA','DD/MM/YYYY') = (
      SELECT DISTINCT TO_DATE(d2.dados->>'DATA','DD/MM/YYYY')
      FROM emissoes_dia d2
      WHERE d2.dados->>'DATA' ~ '^\\d{2}/\\d{2}/\\d{4}$'
      ORDER BY 1 DESC
      OFFSET 1 LIMIT 1
    )`,
    periodoLabel: (_h) => "Penúltimo dia com dados no banco",
    filenamePrefix: "faturamento-ontem",
  },
  // Período livre: exige ?de=YYYY-MM-DD&ate=YYYY-MM-DD (whereExtra montado no GET).
  "periodo": {
    label: "Faturamento no Período",
    whereExtra: "FALSE",
    periodoLabel: (_h) => "",
    filenamePrefix: "faturamento-periodo",
  },
};

function parseNum(raw: unknown): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (!s) return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ kpiId: string }> }) {
  try {
    const { kpiId } = await ctx.params;
    const spec = KPI_SPECS[kpiId];
    if (!spec) {
      return NextResponse.json({ error: `KPI desconhecido: ${kpiId}` }, { status: 404 });
    }

    const clienteId = req.nextUrl.searchParams.get("cliente") ?? "";
    const CNPJ_FILTER = clienteFilterSQL(clienteId);

    const periodoLivre = kpiId === "periodo" ? lerPeriodo(req.nextUrl.searchParams) : null;
    if (kpiId === "periodo" && !periodoLivre) {
      return NextResponse.json({ error: "Informe de=YYYY-MM-DD e ate=YYYY-MM-DD" }, { status: 400 });
    }

    // Mês fechado: ?mes=YYYY-MM re-escopa o fat-mes pro MÊS INTEIRO daquele mês
    // (espelha o seletor da página). Sem mes → janela original (mês corrente).
    const mesParam  = (req.nextUrl.searchParams.get("mes") ?? "").trim();
    const mesValido = kpiId === "fat-mes" && /^\d{4}-\d{2}$/.test(mesParam);
    const whereExtra = periodoLivre
      ? periodoSQL(periodoLivre)
      : mesValido
        ? `TO_CHAR(TO_DATE(dados->>'DATA','DD/MM/YYYY'),'YYYY-MM') = '${mesParam}'`
        : spec.whereExtra;

    const rows = await query<{ dados: Record<string, unknown> }>(`
      SELECT dados FROM emissoes_dia
      WHERE ${DATE_VALID} AND (${whereExtra}) AND ${CNPJ_FILTER}
      ORDER BY TO_DATE(dados->>'DATA','DD/MM/YYYY'),
               COALESCE(dados->>'HORA',''),
               dados->>'MINUTA'
    `);

    const total = rows.reduce((s, r) => s + parseNum(r.dados["FRETE TOTAL"]), 0);
    const hoje = new Date();
    const periodo = periodoLivre
      ? `${isoParaBR(periodoLivre.de)} a ${isoParaBR(periodoLivre.ate)}`
      : mesValido
      ? `${MONTHS_PT[parseInt(mesParam.slice(5, 7)) - 1]}/${mesParam.slice(2, 4)} (mês completo)`
      : spec.periodoLabel(hoje);

    // ── Build worksheet ───────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = "ARES — Acerta Express";
    wb.created = hoje;
    const ws = wb.addWorksheet(spec.label, {
      views: [{ state: "frozen", ySplit: 10 }],
    });

    // Estilo metadados
    const labelStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: "FF64748B" }, size: 11 },
    };
    const valueStyle: Partial<ExcelJS.Style> = {
      font: { size: 11 },
    };

    // Linha 1-6 metadados
    ws.getCell("A1").value = "KPI:";       ws.getCell("A1").style = labelStyle;
    ws.getCell("B1").value = spec.label;   ws.getCell("B1").style = { font: { bold: true, size: 14 } };

    ws.getCell("A2").value = "Período:";   ws.getCell("A2").style = labelStyle;
    ws.getCell("B2").value = periodo;      ws.getCell("B2").style = valueStyle;

    // Total destacado
    ws.getCell("A3").value = "Total exibido no card:"; ws.getCell("A3").style = labelStyle;
    const totalCell = ws.getCell("B3");
    totalCell.value = total;
    totalCell.numFmt = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
    totalCell.style = {
      font: { bold: true, size: 16, color: { argb: "FF059669" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } },
      border: {
        top: { style: "thin", color: { argb: "FF10B981" } },
        bottom: { style: "thin", color: { argb: "FF10B981" } },
        left: { style: "thin", color: { argb: "FF10B981" } },
        right: { style: "thin", color: { argb: "FF10B981" } },
      },
    };

    ws.getCell("A4").value = "Qtd de notas:"; ws.getCell("A4").style = labelStyle;
    ws.getCell("B4").value = rows.length;     ws.getCell("B4").style = { font: { bold: true } };

    ws.getCell("A5").value = "Gerado em:";    ws.getCell("A5").style = labelStyle;
    ws.getCell("B5").value = hoje.toLocaleString("pt-BR", { timeZone: TZ }); ws.getCell("B5").style = valueStyle;

    ws.getCell("A6").value = "Fonte:";        ws.getCell("A6").style = labelStyle;
    ws.getCell("B6").value = "emissoes_dia — snapshot diário do relatório 106 (sem filtro SEM RECEBEDOR)";
    ws.getCell("B6").style = valueStyle;

    ws.getCell("A7").value = "Cliente:";      ws.getCell("A7").style = labelStyle;
    ws.getCell("B7").value = clienteLabel(clienteId); ws.getCell("B7").style = valueStyle;

    // Linha 8 — instruções de auditoria
    const instrCell = ws.getCell("A8");
    instrCell.value = "Para auditar: rodar Brudam 106 no mesmo período → exportar XLSX → conferir coluna FRETE TOTAL linha a linha. Total deve bater.";
    instrCell.style = { font: { italic: true, color: { argb: "FF6B7280" }, size: 10 } };
    ws.mergeCells("A8:R8");

    // Linha 10 — cabeçalho da tabela
    const headerRow = ws.getRow(10);
    EXPORT_COLS.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col;
      cell.style = {
        font: { bold: true, color: { argb: "FFFFFFFF" } },
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } },
        alignment: { horizontal: "center" },
        border: { bottom: { style: "thin", color: { argb: "FF374151" } } },
      };
    });

    // Linhas 11+ — dados
    rows.forEach((r, i) => {
      const row = ws.getRow(11 + i);
      EXPORT_COLS.forEach((col, idx) => {
        const cell = row.getCell(idx + 1);
        const raw = r.dados[col];
        if (col === "FRETE TOTAL" || col === "TOTAL COBRADO") {
          const n = parseNum(raw);
          cell.value = n;
          cell.numFmt = '"R$" #,##0.00';
          if (col === "FRETE TOTAL") {
            cell.style = {
              ...cell.style,
              font: { bold: true },
              fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
            };
          }
        } else if (col === "PESO" || col === "FRETE PESO" || col === "AD VALOREM" || col === "ICMS") {
          cell.value = parseNum(raw);
          cell.numFmt = "#,##0.00";
        } else {
          cell.value = raw == null ? "" : String(raw);
        }
      });
    });

    // Última linha — total da coluna FRETE TOTAL
    const totalRowIdx = 11 + rows.length;
    const totalRow = ws.getRow(totalRowIdx);
    totalRow.getCell(1).value = "TOTAL";
    totalRow.getCell(1).style = {
      font: { bold: true, size: 12 },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
    };
    // Merge da primeira até a antepenúltima coluna
    ws.mergeCells(totalRowIdx, 1, totalRowIdx, FRETE_TOTAL_IDX);
    const totalSumCell = totalRow.getCell(FRETE_TOTAL_IDX + 1);
    totalSumCell.value = total;
    totalSumCell.numFmt = '"R$" #,##0.00';
    totalSumCell.style = {
      font: { bold: true, size: 12, color: { argb: "FF059669" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } },
      border: {
        top: { style: "double", color: { argb: "FF10B981" } },
        bottom: { style: "thin", color: { argb: "FF10B981" } },
      },
    };
    // Total alignment
    totalRow.getCell(1).alignment = { horizontal: "right" };

    // Larguras de coluna
    EXPORT_COLS.forEach((col, idx) => {
      const c = ws.getColumn(idx + 1);
      if (col === "CLIENTE") c.width = 40;
      else if (col === "DESTINO" || col === "CIDADE") c.width = 25;
      else if (col === "CNPJ" || col === "MINUTA" || col === "COMPROVANTE ENTREGA") c.width = 20;
      else if (col === "FRETE TOTAL" || col === "TOTAL COBRADO") c.width = 16;
      else c.width = 12;
    });

    const buf = await wb.xlsx.writeBuffer();

    // Filename usa data + hora de Brasília pra evitar confusão entre fusos.
    const brDate = brDateParts(hoje);
    const dateSlug = `${brDate.year}-${String(brDate.month).padStart(2,"0")}-${String(brDate.day).padStart(2,"0")}`;
    const timeSlug = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(hoje).replace(":", "");
    const filename = `${spec.filenamePrefix}-${dateSlug}-${timeSlug}.xlsx`;

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
    console.error("[export]", err);
    return NextResponse.json(
      { error: "Falha ao gerar XLSX", detail: String(err) },
      { status: 500 }
    );
  }
}

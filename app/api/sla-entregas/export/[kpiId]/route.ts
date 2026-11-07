// Export XLSX dos cards do SLA de Entregas (relatório 106 / emissoes_dia).
// Uma aba: metadados (1-6) + cabeçalho (linha 8) + linhas das entregas do card.
// Regras de SLA (prazo, polo metro/interior) vêm de lib/sla.ts — mesma fonte da API.

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { ENT, VALID, SITUACAO, POLO, isMes, CARD_WHERE, CARD_LABEL } from "@/lib/sla";
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

// Colunas da planilha: chave no SELECT → cabeçalho + largura.
const COLS: { key: string; header: string; width: number }[] = [
  { key: "minuta",     header: "MINUTA",         width: 14 },
  { key: "cte",        header: "CT-E/NFSE",      width: 16 },
  { key: "cliente",    header: "CLIENTE",        width: 34 },
  { key: "destino",    header: "DESTINATÁRIO",   width: 30 },
  { key: "cidade",     header: "CIDADE DESTINO", width: 22 },
  { key: "uf",         header: "UF",             width: 6  },
  { key: "emissao",    header: "EMISSÃO",        width: 12 },
  { key: "prev",       header: "PREV. ENTREGA",  width: 14 },
  { key: "entregue",   header: "DATA ENTREGA",   width: 14 },
  { key: "situacao",   header: "SITUAÇÃO",       width: 16 },
  { key: "polo",       header: "POLO",           width: 12 },
];

export async function GET(req: NextRequest, ctx: { params: Promise<{ kpiId: string }> }) {
  try {
    const { kpiId } = await ctx.params;
    const cardWhere = CARD_WHERE[kpiId];
    if (!cardWhere) {
      return NextResponse.json({ error: `card desconhecido: ${kpiId}` }, { status: 404 });
    }

    const startRaw     = req.nextUrl.searchParams.get("start")       ?? "";
    const endRaw       = req.nextUrl.searchParams.get("end")         ?? "";
    const clienteRaw   = req.nextUrl.searchParams.get("cliente")     ?? "";
    const ufDestinoRaw = req.nextUrl.searchParams.get("uf_destino")  ?? "";

    // Descobre o mês mais recente se não vier período (fallback).
    let start = isMes(startRaw) ? startRaw : "";
    let end   = isMes(endRaw)   ? endRaw   : "";
    if (!start || !end) {
      const [a] = await query(`SELECT TO_CHAR(MAX(${ENT}),'YYYY-MM') AS m FROM emissoes_dia WHERE ${VALID}`) as { m: string }[];
      start = start || a?.m || "";
      end   = end   || a?.m || "";
    }

    const periodoWhere = start && end
      ? `TO_CHAR(${ENT},'YYYY-MM') BETWEEN '${start}' AND '${end}'`
      : "TRUE";
    const clienteWhere = clienteRaw
      ? `TRIM(dados->>'CLIENTE') = '${clienteRaw.replace(/'/g, "''")}'`
      : "TRUE";
    const ufWhere = /^[A-Z]{2}$/.test(ufDestinoRaw)
      ? `dados->>'UF.1' = '${ufDestinoRaw}'`
      : "TRUE";

    const rows = await query<Record<string, unknown>>(`
      SELECT
        dados->>'MINUTA'                     AS minuta,
        dados->>'CTE/NFSE'                   AS cte,
        dados->>'CLIENTE'                    AS cliente,
        dados->>'DESTINO'                    AS destino,
        dados->>'CIDADE.2'                   AS cidade,
        dados->>'UF.1'                       AS uf,
        dados->>'DATA'                       AS emissao,
        SUBSTRING(dados->>'PREV. ENTREGA',1,10)  AS prev,
        SUBSTRING(dados->>'DATA ENTREGA',1,10)   AS entregue,
        ${SITUACAO}                          AS situacao,
        ${POLO}                              AS polo
      FROM emissoes_dia
      WHERE ${VALID} AND ${periodoWhere} AND (${clienteWhere}) AND (${ufWhere}) AND (${cardWhere})
      ORDER BY ${ENT}, dados->>'MINUTA'
    `);

    const hoje = new Date();
    const label = CARD_LABEL[kpiId] ?? kpiId;
    const periodo = start && end
      ? (start === end ? fmtMes(start) : `${fmtMes(start)} a ${fmtMes(end)}`)
      : "Todo o histórico";

    const wb = new ExcelJS.Workbook();
    wb.creator = "ARES — Acerta Express";
    wb.created = hoje;
    const ws = wb.addWorksheet("SLA Entregas", { views: [{ state: "frozen", ySplit: 9 }] });

    const labelStyle: Partial<ExcelJS.Style> = { font: { bold: true, color: { argb: "FF64748B" }, size: 11 } };
    const valueStyle: Partial<ExcelJS.Style> = { font: { size: 11 } };

    ws.getCell("A1").value = "Card:";       ws.getCell("A1").style = labelStyle;
    ws.getCell("B1").value = label;         ws.getCell("B1").style = { font: { bold: true, size: 14 } };
    ws.getCell("A2").value = "Período:";    ws.getCell("A2").style = labelStyle;
    ws.getCell("B2").value = periodo;       ws.getCell("B2").style = valueStyle;
    ws.getCell("A3").value = "Qtd de entregas:"; ws.getCell("A3").style = labelStyle;
    ws.getCell("B3").value = rows.length;   ws.getCell("B3").style = { font: { bold: true, size: 14, color: { argb: "FF38BDF8" } } };
    ws.getCell("A4").value = "Gerado em:";  ws.getCell("A4").style = labelStyle;
    ws.getCell("B4").value = hoje.toLocaleString("pt-BR", { timeZone: TZ }); ws.getCell("B4").style = valueStyle;
    ws.getCell("A5").value = "Fonte:";      ws.getCell("A5").style = labelStyle;
    ws.getCell("B5").value = "emissoes_dia (relatório 106) · período por DATA DE ENTREGA"; ws.getCell("B5").style = valueStyle;

    const instr = ws.getCell("A7");
    instr.value = "Situação: entregou antes / no dia / depois da PREV. ENTREGA. Polo: cidade destino está (ou não) na região metropolitana da sua UF, conforme o cadastro de praças do Brudam.";
    instr.style = { font: { italic: true, color: { argb: "FF6B7280" }, size: 10 } };
    ws.mergeCells(`A7:${String.fromCharCode(64 + COLS.length)}7`);

    // Cabeçalho (linha 8)
    const headerRow = ws.getRow(8);
    COLS.forEach((c, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = c.header;
      cell.style = {
        font: { bold: true, color: { argb: "FFFFFFFF" } },
        fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } },
        alignment: { horizontal: "center" },
        border: { bottom: { style: "thin", color: { argb: "FF374151" } } },
      };
    });

    // Dados (linha 9+)
    rows.forEach((d, i) => {
      const row = ws.getRow(9 + i);
      COLS.forEach((c, idx) => {
        const cell = row.getCell(idx + 1);
        const raw = d[c.key];
        cell.value = raw == null ? "" : String(raw);
        if (c.key === "situacao") {
          const v = String(raw ?? "");
          const color = v === "Fora do prazo" ? "FFEF4444" : v === "No prazo" ? "FF06B6D4" : "FF10B981";
          cell.style = { font: { color: { argb: color }, bold: true } };
        }
      });
    });

    COLS.forEach((c, idx) => { ws.getColumn(idx + 1).width = c.width; });
    ws.getColumn(1).width = Math.max(ws.getColumn(1).width ?? 14, 14);

    const buf = await wb.xlsx.writeBuffer();
    const slug = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(hoje);
    const filename = `sla-entregas-${kpiId}-${slug}.xlsx`;

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
    console.error("[sla-entregas/export]", err);
    return NextResponse.json({ error: "Falha ao gerar XLSX", detail: String(err) }, { status: 500 });
  }
}

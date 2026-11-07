"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Users, X, Database, MapPin, AlertTriangle,
  Clock, CalendarDays, Thermometer, CalendarCheck, Star, RotateCcw,
  Download, ChevronDown, TrendingUp,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, Legend,
  LineChart, Line,
} from "recharts";
import dynamic from "next/dynamic";
import { EmptyState } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "@/components/FilterBar";
import { RESPONSAVEIS } from "@/lib/sac-ufs";

const BrazilMapChart = dynamic(() => import("@/components/BrazilMapChart"), { ssr: false });

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PerfKPIs {
  entregas_30d: number; em_movimento: number; atraso: number;
  entregas_dia: number; no_prazo: number; entregues_hoje: number;
  sac_aberto: number; pontualidade: number; tempo_medio_dias: number;
  pereciveis: number; agendamentos: number; prioridades: number; devolucoes: number;
}
interface UFRow    { uf: string; atraso: number; em_movimento: number; entregas_dia: number; pontualidade: number }
interface UFSimple { uf: string; total: number }
interface ProjRow  { data: string; total: number }
interface RespRow  { nome: string; em_movimento: number; atraso: number; entregas_dia: number; entregues_hoje: number; no_prazo: number }
interface SACRow   { atendente: string; total: number }
interface PerfCTE  {
  minuta: string; servico: string; cte_nfse: string; nf_doc: string;
  emissao: string; prev_entrega: string;
  valor: string; peso: string; vol: string;
  cliente: string; origem: string; uf_origem: string;
  destinatario: string; destino: string; uf: string;
  resp_entrega: string; awb: string; cia_transferencia: string;
}
interface PerfData {
  kpis: PerfKPIs;
  por_uf: UFRow[];
  por_uf_atraso: UFSimple[];
  por_uf_dia: UFSimple[];
  projecao_7d: ProjRow[];
  responsaveis: RespRow[];
  sac_atendente: SACRow[];
  clientes?: string[];
  cte?: PerfCTE[];
  periodo: { desde: string; ate: string };
}

function fmtDate(iso: string) {
  if (!iso || iso === "NaT") return "—";
  const s = iso.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  const [y, m, d] = s.split("-");
  if (!d) return "—";
  return `${d}/${m}/${y}`;
}

function fmtShort(iso: string) {
  if (!iso) return "";
  const d = iso.slice(8, 10);
  const m = iso.slice(5, 7);
  return `${d}/${m}`;
}

/* ─── Top KPI (Power BI style) ───────────────────────────────────────────── */
function TopKpi({ title, value, icon, color, loading }: {
  title: string; value: number; icon: React.ReactNode; color: string; loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-ares bg-ares-panel p-5 relative min-h-[120px] overflow-hidden flex flex-col gap-2 min-w-0">
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${color}cc, ${color}44, transparent)` }} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest">{title}</span>
        <span style={{ color }} className="opacity-60">{icon}</span>
      </div>
      {loading ? <Skeleton className="h-9 w-20 bg-white/5" /> : (
        <span className="text-[2rem] font-bold tabular-nums" style={{ color, fontFamily: "var(--font-display)" }}>
          {value.toLocaleString("pt-BR")}
        </span>
      )}
    </div>
  );
}

/* ─── Main Performance Donut ─────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: payload[0].payload.fill }} />
        <span className="text-ares-3">{payload[0].name}:</span>
        <span className="font-mono font-bold text-ares-1">{payload[0].value.toLocaleString("pt-BR")}</span>
      </span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieInsideLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
  if (percent < 0.03) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={11} fontWeight="bold" style={{ pointerEvents: "none" }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

function PerformanceDonut({ kpis, loading }: { kpis: PerfKPIs | undefined; loading: boolean }) {
  const total   = kpis?.em_movimento ?? 0;
  const atraso  = kpis?.atraso       ?? 0;
  const diahoje = kpis?.entregas_dia  ?? 0;
  const noPrazo = kpis?.no_prazo     ?? 0;

  const slices = total > 0
    ? [
        { name: "No Prazo",        value: noPrazo, fill: "#10b981" },
        { name: "Entregas do Dia", value: diahoje,  fill: "#06b6d4" },
        { name: "Atraso",          value: atraso,   fill: "#ef4444" },
      ].filter(s => s.value > 0)
    : [{ name: "—", value: 1, fill: "rgba(255,255,255,0.05)" }];

  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-4 px-4 shrink-0">
        <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">
          Performance Diária — Notas em Movimentação
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center px-3 pb-3 pt-2 gap-2 min-h-0">
        {loading ? <Skeleton className="w-44 h-44 rounded-full bg-white/5" /> : (
          <>
            <div className="text-center shrink-0">
              <span className="text-4xl font-black tabular-nums text-ares-1">{total.toLocaleString("pt-BR")}</span>
              <span className="text-[9px] text-ares-4 block uppercase tracking-widest mt-0.5">em movimento</span>
            </div>
            <div className="w-full flex-1 min-h-[140px] max-h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} cx="50%" cy="50%" innerRadius={0} outerRadius="80%"
                    dataKey="value" strokeWidth={0} paddingAngle={total > 0 ? 2 : 0}
                    isAnimationActive={false} labelLine={false} label={PieInsideLabel}>
                    {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<DonutTip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1 w-full px-1 shrink-0">
              {[
                { label: "No Prazo",        val: noPrazo, color: "#10b981" },
                { label: "Entregas do Dia", val: diahoje,  color: "#06b6d4" },
                { label: "Atraso",          val: atraso,   color: "#ef4444" },
              ].map(l => (
                <div key={l.label} className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} />
                    <span className="text-ares-4">{l.label}</span>
                  </span>
                  <span className="font-mono font-bold" style={{ color: l.color }}>{l.val.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Gauge por Responsável ──────────────────────────────────────────────── */
function RespGauge({ data, loading, onSelect, selected }: {
  data: RespRow; loading: boolean;
  onSelect: (nome: string) => void;
  selected: boolean;
}) {
  const total = data.em_movimento;
  const accentColor = RESP_COLOR[data.nome] ?? "#f59e0b";
  const slices = total > 0
    ? [
        { name: "No Prazo",        value: data.no_prazo,    fill: "#10b981" },
        { name: "Entregas do Dia", value: data.entregas_dia, fill: "#06b6d4" },
        { name: "Atraso",          value: data.atraso,      fill: "#ef4444" },
      ].filter(s => s.value > 0)
    : [{ name: "—", value: 1, fill: "rgba(255,255,255,0.06)" }];

  return (
    <button
      onClick={() => onSelect(data.nome)}
      className={`rounded-xl border bg-ares-panel p-3 flex flex-col items-center gap-1 w-full text-left transition-all cursor-pointer hover:scale-[1.02] ${
        selected ? "border-2 shadow-lg" : "border-ares hover:border-white/20"
      }`}
      style={selected ? { borderColor: accentColor, boxShadow: `0 0 16px ${accentColor}30` } : {}}
    >
      <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: accentColor }}>{data.nome}</span>
      <span className="text-lg font-black tabular-nums text-ares-1">{total.toLocaleString("pt-BR")}</span>
      {loading ? <Skeleton className="w-28 h-28 rounded-full bg-white/5 my-1" /> : (
        <>
          <PieChart width={130} height={110}>
            <Pie data={slices} cx={65} cy={55} innerRadius={0} outerRadius={50}
              dataKey="value" strokeWidth={0} paddingAngle={total > 0 ? 2 : 0}
              isAnimationActive={false} labelLine={false} label={PieInsideLabel}>
              {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
            </Pie>
            <Tooltip content={<DonutTip />} />
          </PieChart>
          <div className="flex flex-col gap-0.5 text-[10px] w-full px-1">
            {[
              { label: "No Prazo",    val: data.no_prazo,    color: "#10b981" },
              { label: "Entrega Dia", val: data.entregas_dia, color: "#06b6d4" },
              { label: "Atraso",      val: data.atraso,      color: "#ef4444" },
            ].map(l => (
              <div key={l.label} className="flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: l.color }} />
                  <span className="text-ares-4">{l.label}</span>
                </span>
                <span className="font-mono font-bold" style={{ color: l.color }}>{l.val.toLocaleString("pt-BR")}</span>
              </div>
            ))}
          </div>
          <span className="text-[9px] text-ares-4 mt-1 opacity-60">clique para detalhes</span>
        </>
      )}
    </button>
  );
}

/* ─── Bar charts (Dia / Atraso por UF) ──────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTopLabel({ x, y, width, value }: any) {
  if (!value) return null;
  const w = 22;
  return (
    <g>
      <rect x={x + width / 2 - w / 2} y={y - 17} width={w} height={13} rx={2} fill="white" />
      <text x={x + width / 2} y={y - 7} textAnchor="middle" fill="#111827" fontSize={8} fontWeight="bold">{value}</text>
    </g>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl">
      <p className="font-bold text-ares-1 mb-1">{label}</p>
      <p className="font-mono" style={{ color: payload[0].fill }}>{payload[0].value}</p>
    </div>
  );
}

function UFBarsSmall({ data, color, title, loading }: { data: UFSimple[]; color: string; title: string; loading: boolean }) {
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-3 px-4 shrink-0">
        <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-1 pb-2 pt-1">
        {loading && !data.length ? <Skeleton className="h-24 w-full bg-white/5" /> :
         data.length === 0 ? <EmptyState label="Sem dados hoje" /> : (
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={data} margin={{ left: 0, right: 4, top: 20, bottom: 14 }} barCategoryGap="20%" barSize={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="uf" tick={{ fill: "#555566", fontSize: 9 }} angle={-40} textAnchor="end"
                axisLine={false} tickLine={false} interval={0} dy={3} />
              <YAxis hide />
              <Tooltip content={<BarTip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
              <Bar dataKey="total" radius={[2,2,0,0]} fill={color} fillOpacity={0.85}
                label={<BarTopLabel />} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LineLabel({ x, y, value }: any) {
  if (value == null || value === "") return null;
  const txt = String(value);
  const w = txt.length * 6 + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y - 22} width={w} height={15} rx={3}
        fill="white" stroke="#3b82f6" strokeWidth={0.8} />
      <text x={x} y={y - 11} textAnchor="middle"
        fill="#1e3a5f" fontSize={9} fontWeight="bold">{txt}</text>
    </g>
  );
}

/* ─── Projeção 7 dias ────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LineTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-ares-3 mb-1">{label}</p>
      <p className="font-mono font-bold text-blue-400">{payload[0].value} notas</p>
    </div>
  );
}

function ProjecaoChart({ data, loading }: { data: ProjRow[]; loading: boolean }) {
  const formatted = data.map(r => ({ ...r, label: fmtShort(r.data) }));
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-3 px-4 shrink-0">
        <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">
          Projeção Entregas — Próximos 7 Dias
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-2 pb-2 pt-1">
        {loading && !data.length ? <Skeleton className="h-24 w-full bg-white/5" /> :
         data.length === 0 ? <EmptyState label="Sem projeção disponível" /> : (
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={formatted} margin={{ left: 24, right: 24, top: 26, bottom: 14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#555566", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<LineTip />} />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 3 }} isAnimationActive={false}
                label={LineLabel} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── SAC Pizza ──────────────────────────────────────────────────────────── */
const SAC_COLORS = ["#3b82f6","#8b5cf6","#f59e0b","#ec4899","#14b8a6","#f97316","#eab308","#06b6d4"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SACTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: payload[0].payload.fill }} />
        <span className="text-ares-3">{payload[0].name}:</span>
        <span className="font-mono font-bold text-ares-1">{payload[0].value}</span>
      </span>
    </div>
  );
}

function SACPizzaChart({ data, loading }: { data: SACRow[]; loading: boolean }) {
  const total  = data.reduce((s, r) => s + r.total, 0);
  const slices = data.map((r, i) => ({ name: r.atendente, value: r.total, fill: SAC_COLORS[i % SAC_COLORS.length] }));
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-4 px-4 shrink-0">
        <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest flex items-center justify-between">
          Atendimentos SAC em Aberto
          {total > 0 && <span className="font-mono font-bold text-ares-1 text-sm normal-case">{total}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center px-1 pb-2 pt-0">
        {loading && !data.length ? <Skeleton className="h-36 w-36 rounded-full bg-white/5" /> :
         data.length === 0 ? <EmptyState label="Sem SAC em aberto" /> : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={slices} cx="50%" cy="44%" innerRadius={62} outerRadius={100}
                dataKey="value" strokeWidth={0} paddingAngle={2}
                label={({ percent }: { percent?: number }) => (percent ?? 0) > 0.04 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""}
                labelLine={false}>
                {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
              </Pie>
              <Tooltip content={<SACTip />} />
              <Legend iconType="circle" iconSize={7}
                formatter={v => <span className="text-[9px] text-ares-3">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Delivery status helpers ────────────────────────────────────────────── */
function parsePrevEntrega(raw: string): Date | null {
  if (!raw || raw === "NaT") return null;
  // ISO: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw.slice(0, 10) + "T12:00:00-03:00");
    return isNaN(d.getTime()) ? null : d;
  }
  // BR: DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [dd, mm, yyyy] = raw.slice(0, 10).split("/");
    const d = new Date(`${yyyy}-${mm}-${dd}T12:00:00-03:00`);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function deliveryStatus(prev_entrega: string): "atraso" | "hoje" | "no_prazo" | null {
  const dt = parsePrevEntrega(prev_entrega);
  if (!dt) return null;
  const now = new Date();
  // Today in Brazil time
  const todayBR = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  todayBR.setHours(0, 0, 0, 0);
  const tomorrowBR = new Date(todayBR); tomorrowBR.setDate(todayBR.getDate() + 1);
  dt.setHours(0, 0, 0, 0);
  if (dt < todayBR)    return "atraso";
  if (dt < tomorrowBR) return "hoje";
  return "no_prazo";
}

function diasAtraso(prev_entrega: string): number {
  const dt = parsePrevEntrega(prev_entrega);
  if (!dt) return 0;
  const now = new Date();
  const todayBR = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  todayBR.setHours(0, 0, 0, 0);
  dt.setHours(0, 0, 0, 0);
  const diff = Math.floor((todayBR.getTime() - dt.getTime()) / 86400000);
  return Math.max(0, diff);
}

function fmtMoney(v: string | number | null | undefined) {
  if (!v) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* ─── Export helpers ─────────────────────────────────────────────────────── */
const EXPORT_HEADERS = [
  "Minuta","Tipo Emissão","CTE/NFSE","NF/DOC","Emissão","Prev. Entrega",
  "Valor","Peso Real","Volume","Cliente","Origem","UF Origem",
  "Destino","Cidade Destino","UF Destino","Resp. Entrega","AWB","CIA Transferência",
];

function toExportRows(data: PerfCTE[]) {
  return data.map(r => [
    r.minuta || "",
    r.servico || "",
    r.cte_nfse || "",
    r.nf_doc || "",
    fmtDate(r.emissao?.slice(0, 10)),
    fmtDate(r.prev_entrega),
    r.valor ? Number(r.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
    r.peso ? Number(r.peso).toLocaleString("pt-BR") : "",
    r.vol || "",
    r.cliente || "",
    r.origem || "",
    r.uf_origem || "",
    r.destinatario || "",
    r.destino || "",
    r.uf || "",
    r.resp_entrega || "",
    r.awb || "",
    r.cia_transferencia || "",
  ]);
}

function exportCSV(data: PerfCTE[]) {
  const rows = [EXPORT_HEADERS, ...toExportRows(data)];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "relacao-entregas.csv"; a.click();
  URL.revokeObjectURL(url);
}

async function exportXLSX(data: PerfCTE[]) {
  const { utils, writeFile } = await import("xlsx");
  const ws = utils.aoa_to_sheet([EXPORT_HEADERS, ...toExportRows(data)]);
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Entregas");
  writeFile(wb, "relacao-entregas.xlsx");
}

async function exportPDF(data: PerfCTE[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFontSize(11);
  doc.text("Relação de Entregas — ARES Intelligence / Acerta Express", 14, 14);
  doc.setFontSize(7);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}  |  ${data.length} registros`, 14, 19);
  autoTable(doc, {
    head: [EXPORT_HEADERS],
    body: toExportRows(data),
    startY: 23,
    styles: { fontSize: 6, cellPadding: 1.5 },
    headStyles: { fillColor: [20, 20, 30], textColor: [180, 180, 180] },
    alternateRowStyles: { fillColor: [245, 245, 250] },
  });
  doc.save("relacao-entregas.pdf");
}

function ExportMenu({ data, fetchFull }: { data: PerfCTE[]; fetchFull?: () => Promise<PerfCTE[]> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);  // formato em curso ou null
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Resolve o dataset: se fetchFull existe, busca todas as entregas (sem
  // LIMIT 300 e ignorando search local) — é o uso correto pra auditoria.
  // Caso contrário cai no dataset que já está na tela.
  async function resolveData(): Promise<PerfCTE[]> {
    if (fetchFull) {
      try {
        return await fetchFull();
      } catch (e) {
        console.error("[export] fetchFull falhou, usando dataset em tela", e);
        return data;
      }
    }
    return data;
  }

  async function runExport(label: string, fn: (rows: PerfCTE[]) => void | Promise<void>) {
    setBusy(label);
    try {
      const rows = await resolveData();
      await fn(rows);
    } finally {
      setBusy(null);
      setOpen(false);
    }
  }

  const options = [
    { label: "CSV",  fn: exportCSV  },
    { label: "XLSX", fn: exportXLSX },
    { label: "PDF",  fn: exportPDF  },
  ];

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy !== null}
        className="flex items-center gap-1.5 text-xs bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-3 hover:text-ares-1 hover:border-amber-500/50 transition-colors disabled:opacity-60"
      >
        <Download className="w-3.5 h-3.5" />
        {busy ? `Gerando ${busy}…` : "Exportar"}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-ares-panel border border-ares rounded-lg shadow-2xl overflow-hidden min-w-[110px]">
          {options.map(opt => (
            <button
              key={opt.label}
              onClick={() => runExport(opt.label, opt.fn)}
              disabled={busy !== null}
              className="flex items-center gap-2 w-full px-4 py-2 text-xs text-ares-3 hover:bg-ares-surface hover:text-ares-1 transition-colors text-left disabled:opacity-50"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const RESPONSAVEIS_LIST = RESPONSAVEIS;

const selectCls = "text-xs bg-ares-surface border border-ares-input rounded-lg px-2.5 py-1.5 text-ares-2 outline-none focus:border-amber-500/50 transition-colors cursor-pointer appearance-none pr-6 bg-no-repeat";

/* ─── CTE Table ──────────────────────────────────────────────────────────── */
const PERF_COLS: { label: string; sortKey: string | null; align: "left" | "right" | "center" }[] = [
  { label: "",               sortKey: null,           align: "left"   },
  { label: "Minuta",         sortKey: "minuta",        align: "left"   },
  { label: "Tipo Emissão",   sortKey: null,            align: "left"   },
  { label: "CTE/NFSE",       sortKey: null,            align: "left"   },
  { label: "NF/DOC",         sortKey: null,            align: "left"   },
  { label: "Emissão",        sortKey: "emissao",       align: "left"   },
  { label: "Prev. Entrega",  sortKey: "prev_entrega",  align: "left"   },
  { label: "Atraso",         sortKey: "atraso",        align: "center" },
  { label: "Valor",          sortKey: "valor",         align: "right"  },
  { label: "Peso Real",      sortKey: "peso",          align: "right"  },
  { label: "Volume",         sortKey: "vol",           align: "right"  },
  { label: "Cliente",        sortKey: "cliente",       align: "left"   },
  { label: "Origem",         sortKey: null,            align: "left"   },
  { label: "UF Orig.",       sortKey: null,            align: "center" },
  { label: "Destino",        sortKey: null,            align: "left"   },
  { label: "Cidade Destino", sortKey: null,            align: "left"   },
  { label: "UF Dest.",       sortKey: null,            align: "center" },
  { label: "Resp. Entrega",  sortKey: null,            align: "left"   },
  { label: "AWB",            sortKey: null,            align: "left"   },
  { label: "CIA Transferência", sortKey: null,         align: "left"   },
];

function perfSortVal(r: PerfCTE, key: string): number | string {
  if (key === "minuta")       return Number(r.minuta) || 0;
  if (key === "emissao")      return r.emissao ?? "";
  if (key === "prev_entrega") return r.prev_entrega ?? "";
  if (key === "atraso")       return deliveryStatus(r.prev_entrega) === "atraso" ? diasAtraso(r.prev_entrega) : 0;
  if (key === "valor")        return Number(r.valor) || 0;
  if (key === "peso")         return Number(r.peso) || 0;
  if (key === "vol")          return Number(r.vol) || 0;
  if (key === "cliente")      return r.cliente ?? "";
  return "";
}

function PerfCTETable({ data, loading, fetchFull }: { data: PerfCTE[]; loading: boolean; fetchFull?: () => Promise<PerfCTE[]> }) {
  const [search, setSearch]       = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [sortCol, setSortCol]     = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("asc");

  function handleSort(key: string) {
    if (sortCol === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(key); setSortDir("asc"); }
  }

  const filtered = (() => {
    let rows = search
      ? data.filter(r => {
          const q = search.toLowerCase();
          return [r.minuta, r.cte_nfse, r.nf_doc, r.cliente, r.origem, r.destinatario, r.destino, r.uf].some(v => v?.toLowerCase().includes(q));
        })
      : data;
    if (showAlert) rows = rows.filter(r => deliveryStatus(r.prev_entrega) === "atraso");
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const va = perfSortVal(a, sortCol), vb = perfSortVal(b, sortCol);
        return (va < vb ? -1 : va > vb ? 1 : 0) * (sortDir === "asc" ? 1 : -1);
      });
    }
    return rows;
  })();

  const atrasadosCount = data.filter(r => deliveryStatus(r.prev_entrega) === "atraso").length;
  const hojeCount      = data.filter(r => deliveryStatus(r.prev_entrega) === "hoje").length;

  return (
    <Card className="panel border-0">
      <CardHeader className="pb-3 pt-4 px-4 flex flex-row items-center gap-3 flex-wrap">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest flex items-center gap-2 shrink-0">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          Relação de Entregas
          <span className="font-mono font-normal text-ares-4 normal-case text-[10px]">({data.length} registros)</span>
        </CardTitle>

        {/* Alert counters */}
        <div className="flex items-center gap-2">
          {atrasadosCount > 0 && (
            <button
              onClick={() => setShowAlert(v => !v)}
              className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md border transition-colors ${
                showAlert
                  ? "bg-red-500/20 border-red-500/50 text-red-300"
                  : "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20"
              }`}
            >
              <AlertTriangle className="w-3 h-3" />
              {atrasadosCount} em atraso
            </button>
          )}
          {hojeCount > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md border bg-amber-500/10 border-amber-500/30 text-amber-400">
              <Clock className="w-3 h-3" />
              {hojeCount} vencem hoje
            </span>
          )}
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar minuta, CTE, destino..."
          className="text-xs bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-2 placeholder:text-ares-4 outline-none focus:border-amber-500/50 w-64 transition-colors ml-auto" />
        <ExportMenu data={filtered} fetchFull={fetchFull} />
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-4"><Skeleton className="h-48 w-full bg-white/5" /></div> :
         filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-ares-4">
            <Database className="w-6 h-6 opacity-30" />
            <span className="text-[11px] uppercase tracking-widest">{search ? "Nenhum resultado" : "Nenhum dado no período"}</span>
          </div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ares-panel z-10">
                <tr className="border-b border-ares">
                  {PERF_COLS.map(col => (
                    <th
                      key={col.label}
                      onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                      className={`py-2.5 px-3 text-ares-4 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap text-${col.align} ${col.sortKey ? "cursor-pointer select-none hover:text-ares-2 transition-colors" : ""}`}
                    >
                      {col.label}
                      {col.sortKey && sortCol === col.sortKey && (
                        <span className="ml-1 text-amber-400">{sortDir === "asc" ? "▲" : "▼"}</span>
                      )}
                      {col.sortKey && sortCol !== col.sortKey && col.label && (
                        <span className="ml-1 opacity-20">⇅</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r, i) => {
                  const status = deliveryStatus(r.prev_entrega);
                  const dias   = status === "atraso" ? diasAtraso(r.prev_entrega) : 0;
                  const isLate3 = dias >= 3;

                  const rowCls = status === "atraso"
                    ? "border-b border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors"
                    : status === "hoje"
                    ? "border-b border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                    : "border-b border-ares hover:bg-ares-surface transition-colors";

                  return (
                    <tr key={i} className={rowCls}>
                      {/* Status indicator dot */}
                      <td className="py-2 pl-3 pr-1 w-4">
                        {status === "atraso" && (
                          <span className={`block w-2 h-2 rounded-full bg-red-500 ${isLate3 ? "animate-pulse" : ""}`} title={`${dias}d atraso`} />
                        )}
                        {status === "hoje" && (
                          <span className="block w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Vence hoje" />
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-amber-400 whitespace-nowrap">{r.minuta || "—"}</td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap">{r.servico || "—"}</td>
                      <td className="py-2 px-3 font-mono text-ares-3 whitespace-nowrap text-[10px]">{r.cte_nfse || "—"}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap text-[10px]" title={r.nf_doc || undefined}>
                        {r.nf_doc ? (() => { const parts = r.nf_doc.split(","); return parts.length > 3 ? parts.slice(0,3).join(",") + "…" : r.nf_doc; })() : "—"}
                      </td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap">{fmtDate(r.emissao?.slice(0,10))}</td>
                      <td className={`py-2 px-3 whitespace-nowrap font-semibold ${
                        status === "atraso" ? "text-red-400" :
                        status === "hoje"   ? "text-amber-400" :
                        "text-ares-3"
                      }`}>{fmtDate(r.prev_entrega)}</td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {status === "atraso" ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLate3 ? "text-red-300 bg-red-500/20" : "text-red-400"}`}>
                            {dias}d
                          </span>
                        ) : status === "hoje" ? (
                          <span className="text-[10px] font-bold text-amber-400">hoje</span>
                        ) : (
                          <span className="text-[10px] text-ares-4">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-emerald-400">{fmtMoney(r.valor)}</td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-ares-2">{r.peso ? Number(r.peso).toLocaleString("pt-BR") : "—"}</td>
                      <td className="py-2 px-3 text-center tabular-nums text-ares-2">{r.vol || "—"}</td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap max-w-[9rem] truncate" title={r.cliente || undefined}>{r.cliente || "—"}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap max-w-[10rem] truncate" title={r.origem || undefined}>{r.origem || "—"}</td>
                      <td className="py-2 px-3 text-center"><Badge variant="outline" className="text-[10px] border-ares text-ares-3 px-1.5">{r.uf_origem || "—"}</Badge></td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap max-w-[10rem] truncate" title={r.destinatario || undefined}>{r.destinatario || "—"}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap">{r.destino || "—"}</td>
                      <td className="py-2 px-3 text-center"><Badge variant="outline" className="text-[10px] border-ares text-ares-3 px-1.5">{r.uf || "—"}</Badge></td>
                      <td className="py-2 px-3 text-ares-4 whitespace-nowrap max-w-[9rem] truncate text-[10px]" title={r.resp_entrega || undefined}>{r.resp_entrega || "—"}</td>
                      <td className="py-2 px-3 font-mono text-ares-3 whitespace-nowrap text-[10px]">{r.awb || "—"}</td>
                      <td className="py-2 px-3 text-ares-4 whitespace-nowrap max-w-[10rem] truncate text-[10px]" title={r.cia_transferencia || undefined}>
                        {r.cia_transferencia ? (() => { const parts = r.cia_transferencia.split(","); return parts.length > 3 ? parts.slice(0,3).join(",") + "…" : r.cia_transferencia; })() : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 300 && (
              <div className="px-4 py-2.5 text-[11px] text-ares-4 border-t border-ares">
                Exibindo 300 de {filtered.length} registros — use os filtros para refinar
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Responsável Drawer ─────────────────────────────────────────────────── */
interface RespDetail {
  nome: string;
  ufs: { uf: string; nome: string }[];
  kpis: { em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number; pontualidade: number };
  por_uf: { uf: string; em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number; pontualidade: number }[];
  atrasados: { minuta: string; cliente: string; destino: string; uf: string; prev_entrega: string; servico: string; dias_atraso: number }[];
  projecao: { data: string; total: number }[];
}

const RESP_COLOR: Record<string, string> = {
  ACSA:      "#3b82f6",
  SABRINA:   "#ef4444",
  KAMILLA:   "#8b5cf6",
  LAIS:      "#ec4899",
  LUANY:     "#06b6d4",
  RANYERI:   "#10b981",
  TAYLON:    "#f59e0b",
};

function RespDetailDrawer({ nome, onClose }: { nome: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RespDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/performance/responsavel?nome=${encodeURIComponent(nome)}`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .finally(() => setLoading(false));
  }, [nome]);

  const pont = detail?.kpis.pontualidade ?? 0;
  const pontColor = pont >= 80 ? "#10b981" : pont >= 60 ? "#f59e0b" : "#ef4444";
  const accentColor = RESP_COLOR[nome] ?? "#f59e0b";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="fixed right-0 top-0 h-full z-50 w-[420px] bg-ares-panel border-l border-ares shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "slideIn 0.22s cubic-bezier(.4,0,.2,1)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ares shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center border"
              style={{ background: `${accentColor}20`, borderColor: `${accentColor}40` }}>
              <Users className="w-4 h-4" style={{ color: accentColor }} />
            </div>
            <div>
              <div className="text-lg font-bold text-ares-1 tracking-widest">{nome}</div>
              <div className="text-xs text-ares-4">SAC Responsável</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-ares-4 hover:text-ares-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* KPIs globais */}
          <div className="px-5 py-4 border-b border-ares space-y-3">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Em Movimento", val: detail?.kpis.em_movimento ?? 0, color: "#3b82f6" },
                    { label: "Em Atraso",    val: detail?.kpis.atraso ?? 0,       color: "#ef4444" },
                    { label: "Entregas Hoje",val: detail?.kpis.entregas_dia ?? 0, color: "#f59e0b" },
                    { label: "No Prazo",     val: detail?.kpis.no_prazo ?? 0,     color: "#10b981" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg bg-white/5 border border-ares px-3 py-2.5 text-center">
                      <div className="text-[9px] text-ares-4 uppercase tracking-wider mb-1">{s.label}</div>
                      <div className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Pontualidade */}
                <div className="rounded-lg bg-white/5 border border-ares px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-ares-4 uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-3 h-3" /> Pontualidade Geral
                    </span>
                    <span className="text-base font-bold tabular-nums" style={{ color: pontColor }}>{pont}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pont}%`, background: pontColor }} />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* UFs por performance */}
          <div className="px-5 py-4 border-b border-ares">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-3" style={{ color: accentColor }}>
              <MapPin className="w-3.5 h-3.5" />
              UFs — Breakdown
            </div>
            {loading ? (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded bg-white/5 animate-pulse" />)}</div>
            ) : !detail?.por_uf.length ? (
              <div className="text-center py-4 text-xs text-ares-4">Sem dados</div>
            ) : (
              <div className="space-y-1.5">
                {detail.por_uf.map((row, i) => {
                  const ufPont = row.pontualidade;
                  const ufColor = ufPont >= 80 ? "#10b981" : ufPont >= 60 ? "#f59e0b" : "#ef4444";
                  return (
                    <div key={i} className="rounded-lg bg-white/5 border border-ares px-3 py-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-ares-1">{row.uf}</span>
                          {row.atraso > 0 && (
                            <span className="text-[9px] font-semibold bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5">
                              {row.atraso} atraso
                            </span>
                          )}
                          {row.entregas_dia > 0 && (
                            <span className="text-[9px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">
                              {row.entregas_dia} hoje
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-ares-4">{row.em_movimento} mov</span>
                          <span className="text-[10px] font-bold tabular-nums" style={{ color: ufColor }}>{ufPont}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${ufPont}%`, background: ufColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CTes em atraso */}
          <div className="px-5 py-3 border-b border-ares">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 uppercase tracking-widest mb-3">
              <AlertTriangle className="w-3.5 h-3.5" />
              CTes em Atraso
              {detail && <span className="ml-auto text-ares-4 normal-case font-normal">{detail.atrasados.length} registros</span>}
            </div>
            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-white/5 animate-pulse" />)}</div>
            ) : !detail?.atrasados.length ? (
              <div className="text-center py-4 text-xs text-ares-4">Nenhum CTe em atraso</div>
            ) : (
              <div className="space-y-1.5">
                {detail.atrasados.map((r, i) => (
                  <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-400">{r.minuta}</span>
                      <Badge variant="outline" className="text-[9px] border-ares text-ares-4 px-1 py-0">{r.uf}</Badge>
                      <span className={`text-[10px] font-semibold ml-auto ${r.dias_atraso >= 3 ? "text-red-300 bg-red-500/20 px-1.5 py-0.5 rounded" : "text-red-400"}`}>
                        {r.dias_atraso}d atraso
                      </span>
                    </div>
                    <div className="text-[11px] text-ares-3 truncate">{r.cliente || "—"}</div>
                    <div className="text-[10px] text-ares-4 truncate">{r.destino} · Prev: {r.prev_entrega?.slice(0,10)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projeção */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-3">
              <CalendarDays className="w-3.5 h-3.5" />
              Projeção — Próximos 5 dias
            </div>
            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded bg-white/5 animate-pulse" />)}</div>
            ) : !detail?.projecao.length ? (
              <div className="text-center py-4 text-xs text-ares-4">Sem entregas previstas</div>
            ) : (
              <div className="space-y-1.5">
                {detail.projecao.map((r, i) => {
                  const max = Math.max(...detail.projecao.map(x => x.total));
                  const pct = max > 0 ? (r.total / max) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-ares-4 w-10 shrink-0">{fmtDateShort(r.data)}</span>
                      <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                        <div className="h-full rounded flex items-center px-2 transition-all"
                          style={{ width: `${Math.max(pct, 8)}%`, background: `${accentColor}80` }}>
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">{r.total}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </aside>
    </>
  );
}

/* ─── UF Drawer ──────────────────────────────────────────────────────────── */
interface UFDetail {
  uf: string; nome: string; regiao: string; responsavel: string;
  kpis: { em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number; pontualidade: number };
  atrasados: { minuta: string; cliente: string; destino: string; prev_entrega: string; servico: string; dias_atraso: number }[];
  projecao: { data: string; total: number }[];
}

function fmtDateShort(iso: string) {
  if (!iso) return "—";
  const d = iso.slice(8, 10), m = iso.slice(5, 7);
  return `${d}/${m}`;
}

function UFDetailDrawer({ uf, onClose }: { uf: string; onClose: () => void }) {
  const [detail, setDetail] = useState<UFDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/performance/uf?uf=${uf}`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .finally(() => setLoading(false));
  }, [uf]);

  const pont = detail?.kpis.pontualidade ?? 0;
  const pontColor = pont >= 80 ? "#10b981" : pont >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside
        className="fixed right-0 top-0 h-full z-50 w-96 bg-ares-panel border-l border-ares shadow-2xl flex flex-col overflow-hidden"
        style={{ animation: "slideIn 0.22s cubic-bezier(.4,0,.2,1)" }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ares shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <MapPin className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-ares-1 tracking-widest">{uf}</span>
                {detail && <span className="text-[10px] text-ares-4 bg-white/5 border border-ares rounded px-1.5 py-0.5">{detail.regiao}</span>}
              </div>
              <div className="text-xs text-ares-3">{detail?.nome ?? "Carregando..."}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-ares-4 hover:text-ares-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Responsável */}
          {detail && (
            <div className="px-5 py-3 border-b border-ares flex items-center gap-2">
              <Users className="w-3.5 h-3.5 text-blue-400 shrink-0" />
              <span className="text-[11px] text-ares-4">SAC Responsável:</span>
              <span className="text-sm font-semibold text-blue-400">{detail.responsavel}</span>
            </div>
          )}

          {/* KPIs */}
          <div className="px-5 py-4 border-b border-ares space-y-3">
            {loading ? (
              <div className="grid grid-cols-2 gap-2">
                {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-lg bg-white/5 animate-pulse" />)}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Em Movimento", val: detail?.kpis.em_movimento ?? 0, color: "#3b82f6" },
                    { label: "Em Atraso",    val: detail?.kpis.atraso ?? 0,       color: "#ef4444" },
                    { label: "Entregas Hoje",val: detail?.kpis.entregas_dia ?? 0, color: "#f59e0b" },
                    { label: "No Prazo",     val: detail?.kpis.no_prazo ?? 0,     color: "#10b981" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg bg-white/5 border border-ares px-3 py-2.5 text-center">
                      <div className="text-[9px] text-ares-4 uppercase tracking-wider mb-1">{s.label}</div>
                      <div className="text-xl font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>

                {/* Pontualidade */}
                <div className="rounded-lg bg-white/5 border border-ares px-4 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-ares-4 uppercase tracking-wider">Pontualidade</span>
                    <span className="text-base font-bold tabular-nums" style={{ color: pontColor }}>{pont}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pont}%`, background: pontColor }} />
                  </div>
                  <div className="flex justify-between text-[9px] text-ares-4 mt-1">
                    <span>0%</span><span>50%</span><span>100%</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* CTes em atraso */}
          <div className="px-5 py-3 border-b border-ares">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 uppercase tracking-widest mb-3">
              <AlertTriangle className="w-3.5 h-3.5" />
              CTes em Atraso
              {detail && <span className="ml-auto text-ares-4 normal-case font-normal">{detail.atrasados.length} registros</span>}
            </div>
            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-10 rounded bg-white/5 animate-pulse" />)}</div>
            ) : !detail?.atrasados.length ? (
              <div className="text-center py-4 text-xs text-ares-4">Nenhum CTe em atraso</div>
            ) : (
              <div className="space-y-1.5">
                {detail.atrasados.map((r, i) => (
                  <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-400">{r.minuta}</span>
                      <span className="text-[10px] text-red-400 font-semibold ml-auto">{r.dias_atraso}d atraso</span>
                    </div>
                    <div className="text-[11px] text-ares-3 truncate">{r.cliente || "—"}</div>
                    <div className="text-[10px] text-ares-4 truncate">{r.destino} · Prev: {r.prev_entrega?.slice(0,10)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projeção próximos dias */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-3">
              <CalendarDays className="w-3.5 h-3.5" />
              Projeção — Próximos 5 dias
            </div>
            {loading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded bg-white/5 animate-pulse" />)}</div>
            ) : !detail?.projecao.length ? (
              <div className="text-center py-4 text-xs text-ares-4">Sem entregas previstas</div>
            ) : (
              <div className="space-y-1.5">
                {detail.projecao.map((r, i) => {
                  const max = Math.max(...detail.projecao.map(x => x.total));
                  const pct = max > 0 ? (r.total / max) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-xs text-ares-4 w-10 shrink-0">{fmtDateShort(r.data)}</span>
                      <div className="flex-1 h-5 bg-white/5 rounded overflow-hidden">
                        <div className="h-full rounded bg-blue-500/60 flex items-center px-2 transition-all"
                          style={{ width: `${Math.max(pct, 8)}%` }}>
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">{r.total}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      </aside>
      <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
    </>
  );
}

const UFS_BR = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function PerformanceDiaria() {
  const [selectedUF,   setSelectedUF]   = useState<string | null>(null);
  const [selectedResp, setSelectedResp] = useState<string | null>(null);
  const [data, setData]                 = useState<PerfData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync]     = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterResp,    setFilterResp]    = useState("");
  const [filterTipo,    setFilterTipo]    = useState("");
  const [filterUF,      setFilterUF]      = useState("");

  // Ref sempre atual — permite fetchData estável sem re-criar no useCallback
  const filtersRef = useRef({ cliente: "", tipo: "", resp: "", uf: "" });

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const { cliente, tipo, resp, uf } = filtersRef.current;
      const p = new URLSearchParams();
      if (cliente) p.set("cliente", cliente);
      if (tipo)    p.set("tipo",    tipo);
      if (resp)    p.set("resp",    resp);
      if (uf)      p.set("uf",      uf);
      const qs = p.toString();
      const json = await fetch(`/api/performance${qs ? "?" + qs : ""}`).then(r => r.json()) as PerfData;
      setData(json);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Busca TODAS as entregas em movimento (sem LIMIT 300) — usado só pelo
  // ExportMenu pra auditoria. Reusa os filtros atuais (cliente/tipo/resp/uf).
  const fetchAllCtes = useCallback(async (): Promise<PerfCTE[]> => {
    const { cliente, tipo, resp, uf } = filtersRef.current;
    const p = new URLSearchParams();
    if (cliente) p.set("cliente", cliente);
    if (tipo)    p.set("tipo",    tipo);
    if (resp)    p.set("resp",    resp);
    if (uf)      p.set("uf",      uf);
    p.set("full", "1");
    const json = await fetch(`/api/performance?${p.toString()}`).then(r => r.json()) as PerfData;
    return json.cte ?? [];
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useEffect(() => {
    const id = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const kpis       = data?.kpis;
  const ufData     = data?.por_uf ?? [];
  const filteredCte = data?.cte ?? [];

  // Lista de clientes vem da API (sem LIMIT) para incluir todos, mesmo sem CTes no top 300
  const clientes = data?.clientes ?? Array.from(new Set(filteredCte.map(r => r.cliente).filter(Boolean))).sort();

  function handleFilter(key: "cliente" | "resp" | "tipo" | "uf", val: string) {
    filtersRef.current = { ...filtersRef.current, [key]: val };
    if (key === "cliente") setFilterCliente(val);
    if (key === "resp")    setFilterResp(val);
    if (key === "tipo")    setFilterTipo(val);
    if (key === "uf")      setFilterUF(val);
    fetchData();
  }

  const headerExtras = data?.periodo ? (
    <div className="hidden md:flex items-center gap-2">
      <CalendarDays className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <span className="text-xs text-ares-3 bg-ares-surface border border-ares-input rounded-lg px-2.5 py-1 tabular-nums">
        {fmtDate(data.periodo.desde)} – {fmtDate(data.periodo.ate)}
      </span>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden relative">

      {selectedResp && (
        <RespDetailDrawer
          nome={selectedResp}
          onClose={() => setSelectedResp(null)}
        />
      )}

      {selectedUF && !selectedResp && (
        <UFDetailDrawer
          uf={selectedUF}
          onClose={() => setSelectedUF(null)}
        />
      )}

      <PageHeader
        title={<>Performance <span className="text-amber-400">·</span> Diária</>}
        onRefresh={fetchData}
        refreshing={refreshing}
        lastSync={lastSync}
      >
        {headerExtras}
      </PageHeader>

      <FilterBar
        filters={[
          { key: "cliente" as const, label: "Cliente:", value: filterCliente, options: [["", "Todos"], ...clientes.map(c => [c, c])] as [string, string][] },
          { key: "resp" as const, label: "SAC Responsável:", value: filterResp, options: [["", "Todos"], ...RESPONSAVEIS_LIST.map(r => [r, r])] as [string, string][] },
          { key: "tipo" as const, label: "Tipo Emissão:", value: filterTipo, options: [["", "Todos"], ...["ENTREGA","DEVOLUCAO","CORTESIA","REENTREGA","GAIOLAS"].map(t => [t, t])] as [string, string][] },
          { key: "uf" as const, label: "UF Destino:", value: filterUF, options: [["", "Todas"], ...UFS_BR.map(u => [u, u])] as [string, string][] },
        ]}
        onChange={handleFilter}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">

        {/* ── Row 1: 4 KPI cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <TopKpi title="Perecíveis"  value={kpis?.pereciveis ?? 0}  icon={<Thermometer className="w-5 h-5" />}  color="#f59e0b" loading={loading} />
          <TopKpi title="Agendamentos" value={kpis?.agendamentos ?? 0} icon={<CalendarCheck className="w-5 h-5" />} color="#3b82f6" loading={loading} />
          <TopKpi title="Prioridades"  value={kpis?.prioridades ?? 0} icon={<Star className="w-5 h-5" />}         color="#ec4899" loading={loading} />
          <TopKpi title="Devoluções"   value={kpis?.devolucoes ?? 0}  icon={<RotateCcw className="w-5 h-5" />}   color="#8b5cf6" loading={loading} />
        </div>

        {/* ── Row 2: Donut | Mapa | Charts direita ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr_1.6fr] gap-3 items-stretch">
          <PerformanceDonut kpis={kpis} loading={loading} />

          <BrazilMapChart
            data={ufData.map(d => ({ uf: d.uf, total: d.em_movimento }))}
            loading={loading && !ufData.length}
            onSelect={uf => setSelectedUF(prev => prev === uf ? null : uf)}
            selectedUF={selectedUF}
          />

          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex-1">
              <UFBarsSmall data={data?.por_uf_dia ?? []} color="#06b6d4" title="Entregas do Dia por UF" loading={loading} />
            </div>
            <div className="flex-1">
              <UFBarsSmall data={data?.por_uf_atraso ?? []} color="#ef4444" title="Entregas em Atraso por UF" loading={loading} />
            </div>
            <div className="flex-1">
              <ProjecaoChart data={data?.projecao_7d ?? []} loading={loading} />
            </div>
          </div>
        </div>

        {/* ── Row 3: Gauges responsáveis | SAC pizza ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] 2xl:grid-cols-[1fr_460px] gap-3 items-stretch">
          <Card className="panel border-0">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                Entregas por Responsável
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {(data?.responsaveis ?? []).map(r => (
                  <RespGauge
                    key={r.nome}
                    data={r}
                    loading={loading}
                    onSelect={nome => setSelectedResp(prev => prev === nome ? null : nome)}
                    selected={selectedResp === r.nome}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <SACPizzaChart data={data?.sac_atendente ?? []} loading={loading} />
        </div>

        {/* ── Row 4: CTE Table ── */}
        <PerfCTETable data={filteredCte} loading={loading} fetchFull={fetchAllCtes} />

        <div className="border-t border-ares pt-3 pb-1 flex items-center justify-between text-[11px] text-ares-4">
          <span>ARES Intelligence © {new Date().getFullYear()} — Acerta Express</span>
          <span className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />Atualização automática a cada 5 minutos
          </span>
        </div>
      </main>
    </div>
  );
}

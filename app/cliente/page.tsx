"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, X, Database, MapPin, AlertTriangle,
  Clock, CalendarDays, Thermometer, CalendarCheck, Star, RotateCcw,
  Download, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
  LineChart, Line,
} from "recharts";
import dynamic from "next/dynamic";
import { EmptyState } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";
import { FilterBar } from "@/components/FilterBar";

const BrazilMapChart = dynamic(() => import("@/components/BrazilMapChart"), { ssr: false });

interface PerfKPIs {
  em_movimento: number; atraso: number;
  entregas_dia: number; no_prazo: number; pontualidade: number;
  pereciveis: number; agendamentos: number; prioridades: number; devolucoes: number;
}
interface UFRow    { uf: string; atraso: number; em_movimento: number; entregas_dia: number; pontualidade: number }
interface UFSimple { uf: string; total: number }
interface ProjRow  { data: string; total: number }
interface PerfCTE  {
  minuta: string; servico: string; cte_nfse: string; nf_doc: string;
  emissao: string; prev_entrega: string; valor: string; peso: string; vol: string;
  cliente: string; origem: string; uf_origem: string;
  destinatario: string; destino: string; uf: string;
  resp_entrega: string; awb: string; cia_transferencia: string;
}
interface PerfData {
  kpis: PerfKPIs; por_uf: UFRow[];
  por_uf_atraso: UFSimple[]; por_uf_dia: UFSimple[];
  projecao_7d: ProjRow[]; cte?: PerfCTE[];
  periodo: { desde: string; ate: string };
}

function fmtDate(iso: string) {
  if (!iso || iso === "NaT") return "—";
  const s = iso.slice(0, 10);
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  const [y, m, d] = s.split("-"); if (!d) return "—";
  return `${d}/${m}/${y}`;
}
function fmtShort(iso: string) { if (!iso) return ""; return `${iso.slice(8,10)}/${iso.slice(5,7)}`; }
function fmtMoney(v: string | number | null | undefined) {
  if (!v) return "—"; const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function parsePrevEntrega(raw: string): Date | null {
  if (!raw || raw === "NaT") return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(raw.slice(0, 10) + "T12:00:00-03:00");
    return isNaN(d.getTime()) ? null : d;
  }
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
  return Math.max(0, Math.floor((todayBR.getTime() - dt.getTime()) / 86400000));
}

function TopKpi({ title, value, icon, color, loading }: { title: string; value: number; icon: React.ReactNode; color: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-ares bg-ares-panel p-5 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">{title}</span>
        <span style={{ color }} className="opacity-60">{icon}</span>
      </div>
      {loading ? <Skeleton className="h-9 w-20 bg-white/5" /> : (
        <span className="text-4xl font-black tabular-nums" style={{ color }}>{value.toLocaleString("pt-BR")}</span>
      )}
    </div>
  );
}

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
  if (percent < 0.07) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * (Math.PI / 180));
  const y = cy + r * Math.sin(-midAngle * (Math.PI / 180));
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="bold" style={{ pointerEvents: "none" }}>{`${(percent * 100).toFixed(0)}%`}</text>;
}

function PerformanceDonut({ kpis, loading }: { kpis: PerfKPIs | undefined; loading: boolean }) {
  const total = kpis?.em_movimento ?? 0; const atraso = kpis?.atraso ?? 0;
  const diahoje = kpis?.entregas_dia ?? 0; const noPrazo = kpis?.no_prazo ?? 0;
  const slices = total > 0
    ? [{ name: "No Prazo", value: noPrazo, fill: "#10b981" }, { name: "Entregas do Dia", value: diahoje, fill: "#06b6d4" }, { name: "Atraso", value: atraso, fill: "#ef4444" }].filter(s => s.value > 0)
    : [{ name: "—", value: 1, fill: "rgba(255,255,255,0.05)" }];
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-4 px-4 shrink-0">
        <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">Performance Diária — Notas em Movimentação</CardTitle>
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
                  <Pie data={slices} cx="50%" cy="50%" innerRadius={0} outerRadius="80%" dataKey="value" strokeWidth={0} paddingAngle={total > 0 ? 2 : 0} isAnimationActive={false} labelLine={false} label={PieInsideLabel}>
                    {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<DonutTip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-1 w-full px-1 shrink-0">
              {[{ label: "No Prazo", val: noPrazo, color: "#10b981" }, { label: "Entregas do Dia", val: diahoje, color: "#06b6d4" }, { label: "Atraso", val: atraso, color: "#ef4444" }].map(l => (
                <div key={l.label} className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} /><span className="text-ares-4">{l.label}</span></span>
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTopLabel({ x, y, width, value }: any) {
  if (!value) return null;
  const w = 22;
  return <g><rect x={x + width / 2 - w / 2} y={y - 17} width={w} height={13} rx={2} fill="white" /><text x={x + width / 2} y={y - 7} textAnchor="middle" fill="#111827" fontSize={8} fontWeight="bold">{value}</text></g>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl"><p className="font-bold text-ares-1 mb-1">{label}</p><p className="font-mono" style={{ color: payload[0].fill }}>{payload[0].value}</p></div>;
}

function UFBarsSmall({ data, color, title, loading }: { data: UFSimple[]; color: string; title: string; loading: boolean }) {
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-3 px-4 shrink-0"><CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">{title}</CardTitle></CardHeader>
      <CardContent className="flex-1 px-1 pb-2 pt-1">
        {loading && !data.length ? <Skeleton className="h-24 w-full bg-white/5" /> : data.length === 0 ? <EmptyState label="Sem dados hoje" /> : (
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={data} margin={{ left: 0, right: 4, top: 20, bottom: 14 }} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="uf" tick={{ fill: "#555566", fontSize: 9 }} angle={-40} textAnchor="end" axisLine={false} tickLine={false} interval={0} dy={3} />
              <YAxis hide />
              <Tooltip content={<BarTip />} cursor={{ fill: "rgba(255,255,255,0.02)" }} />
              <Bar dataKey="total" radius={[2,2,0,0]} maxBarSize={16} fill={color} fillOpacity={0.85} label={<BarTopLabel />} />
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
  const txt = String(value); const w = txt.length * 6 + 12;
  return <g><rect x={x - w / 2} y={y - 22} width={w} height={15} rx={3} fill="white" stroke="#3b82f6" strokeWidth={0.8} /><text x={x} y={y - 11} textAnchor="middle" fill="#1e3a5f" fontSize={9} fontWeight="bold">{txt}</text></g>;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function LineTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl"><p className="text-ares-3 mb-1">{label}</p><p className="font-mono font-bold text-blue-400">{payload[0].value} notas</p></div>;
}

function ProjecaoChart({ data, loading }: { data: ProjRow[]; loading: boolean }) {
  const formatted = data.map(r => ({ ...r, label: fmtShort(r.data) }));
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-3 px-4 shrink-0"><CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest">Projeção Entregas — Próximos 7 Dias</CardTitle></CardHeader>
      <CardContent className="flex-1 px-2 pb-2 pt-1">
        {loading && !data.length ? <Skeleton className="h-24 w-full bg-white/5" /> : data.length === 0 ? <EmptyState label="Sem projeção disponível" /> : (
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={formatted} margin={{ left: 24, right: 24, top: 26, bottom: 14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#555566", fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<LineTip />} />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6", r: 3 }} isAnimationActive={false} label={LineLabel} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

const EXPORT_HEADERS = ["CTE/NFSE","NF/DOC","Tipo Emissão / Serviço","Emissão","Prev. Entrega","Atraso","Destinatário","Cidade Destino","UF Destino","Qtd. Volumes","Peso Real (kg)"];
function toExportRows(data: PerfCTE[]) {
  return data.map(r => {
    const status = deliveryStatus(r.prev_entrega);
    const dias   = status === "atraso" ? diasAtraso(r.prev_entrega) : 0;
    return [
      r.cte_nfse||"",
      r.nf_doc||"",
      r.servico||"",
      fmtDate(r.emissao?.slice(0,10)),
      fmtDate(r.prev_entrega),
      status === "atraso" ? `${dias}d` : status === "hoje" ? "hoje" : "",
      r.destinatario||"",
      r.destino||"",
      r.uf||"",
      r.vol||"",
      r.peso?Number(r.peso).toLocaleString("pt-BR"):"",
    ];
  });
}
function exportCSV(data: PerfCTE[]) {
  const rows = [EXPORT_HEADERS, ...toExportRows(data)];
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob = new Blob(["﻿"+csv],{type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download="relacao-entregas.csv"; a.click(); URL.revokeObjectURL(url);
}
async function exportXLSX(data: PerfCTE[]) {
  const { utils, writeFile } = await import("xlsx");
  const ws = utils.aoa_to_sheet([EXPORT_HEADERS,...toExportRows(data)]); const wb = utils.book_new();
  utils.book_append_sheet(wb,ws,"Entregas"); writeFile(wb,"relacao-entregas.xlsx");
}
async function exportPDF(data: PerfCTE[]) {
  const { default: jsPDF } = await import("jspdf"); const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({orientation:"landscape",unit:"mm",format:"a4"});
  doc.setFontSize(11); doc.text("Relação de Entregas — ARES Intelligence / Acerta Express",14,14);
  doc.setFontSize(7); doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}  |  ${data.length} registros`,14,19);
  autoTable(doc,{head:[EXPORT_HEADERS],body:toExportRows(data),startY:23,styles:{fontSize:6,cellPadding:1.5},headStyles:{fillColor:[20,20,30],textColor:[180,180,180]},alternateRowStyles:{fillColor:[245,245,250]}});
  doc.save("relacao-entregas.pdf");
}

function ExportMenu({ data }: { data: PerfCTE[] }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onOut(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onOut); return () => document.removeEventListener("mousedown", onOut);
  }, []);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 text-xs bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-3 hover:text-ares-1 hover:border-amber-500/50 transition-colors">
        <Download className="w-3.5 h-3.5" />Exportar<ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-ares-panel border border-ares rounded-lg shadow-2xl overflow-hidden min-w-[110px]">
          {[{label:"CSV",action:()=>{exportCSV(data);setOpen(false);}},{label:"XLSX",action:()=>{exportXLSX(data);setOpen(false);}},{label:"PDF",action:()=>{exportPDF(data);setOpen(false);}}].map(opt => (
            <button key={opt.label} onClick={opt.action} className="flex items-center gap-2 w-full px-4 py-2 text-xs text-ares-3 hover:bg-ares-surface hover:text-ares-1 transition-colors text-left">{opt.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function UFDetailDrawer({ uf, ufStats, onClose }: { uf: string; ufStats: UFRow | undefined; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full z-50 w-80 bg-ares-panel border-l border-ares shadow-2xl flex flex-col" style={{ animation: "slideIn 0.22s cubic-bezier(.4,0,.2,1)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-ares">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><MapPin className="w-4 h-4 text-amber-400" /></div>
            <div><div className="text-base font-bold text-ares-1 tracking-widest">{uf}</div><div className="text-[10px] text-ares-4 uppercase tracking-widest">Resumo Diário</div></div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-white/10 text-ares-4 hover:text-ares-1 transition-colors"><X className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 px-5 py-4">
          {[{label:"Em Movimento",val:ufStats?.em_movimento??0,color:"#3b82f6"},{label:"Em Atraso",val:ufStats?.atraso??0,color:"#ef4444"},{label:"Prev. Hoje",val:ufStats?.entregas_dia??0,color:"#06b6d4"},{label:"Pontualidade",val:`${ufStats?.pontualidade??0}%`,color:(ufStats?.pontualidade??0)>=80?"#10b981":(ufStats?.pontualidade??0)>=60?"#f59e0b":"#ef4444"}].map(s => (
            <div key={s.label} className="rounded-lg bg-white/5 border border-ares px-3 py-2.5 text-center">
              <div className="text-[9px] text-ares-4 uppercase tracking-wider mb-1">{s.label}</div>
              <div className="text-lg font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      </aside>
      <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
    </>
  );
}


const CLIENTE_COLS: { label: string; sortKey: string | null; align: "left" | "right" | "center" }[] = [
  { label: "",                        sortKey: null,           align: "left"   },
  { label: "CTE/NFSE",               sortKey: "cte_nfse",     align: "left"   },
  { label: "NF",                      sortKey: null,           align: "left"   },
  { label: "Tipo Emissão / Serviço",  sortKey: null,           align: "left"   },
  { label: "Emissão",                 sortKey: "emissao",      align: "left"   },
  { label: "Prev. Entrega",           sortKey: "prev_entrega", align: "left"   },
  { label: "Atraso",                  sortKey: "atraso",       align: "center" },
  { label: "Destinatário",            sortKey: "destinatario", align: "left"   },
  { label: "Cidade Destino",          sortKey: null,           align: "left"   },
  { label: "UF",                      sortKey: null,           align: "center" },
  { label: "Volumes",                 sortKey: "vol",          align: "right"  },
  { label: "Peso (kg)",               sortKey: "peso",         align: "right"  },
];

function clienteSortVal(r: PerfCTE, key: string): number | string {
  if (key === "cte_nfse")     return r.cte_nfse ?? "";
  if (key === "emissao")      return r.emissao ?? "";
  if (key === "prev_entrega") return r.prev_entrega ?? "";
  if (key === "atraso")       return deliveryStatus(r.prev_entrega) === "atraso" ? diasAtraso(r.prev_entrega) : 0;
  if (key === "destinatario") return r.destinatario ?? "";
  if (key === "vol")          return Number(r.vol) || 0;
  if (key === "peso")         return Number(r.peso) || 0;
  return "";
}

function PerfCTETable({ data, loading }: { data: PerfCTE[]; loading: boolean }) {
  const [search, setSearch]     = useState("");
  const [showAlert, setShowAlert] = useState(false);
  const [sortCol, setSortCol]   = useState<string | null>(null);
  const [sortDir, setSortDir]   = useState<"asc" | "desc">("asc");

  function handleSort(key: string) {
    if (sortCol === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(key); setSortDir("asc"); }
  }

  const filtered = (() => {
    let rows = search
      ? data.filter(r => { const q = search.toLowerCase(); return [r.cte_nfse,r.nf_doc,r.servico,r.destinatario,r.destino,r.uf].some(v=>v?.toLowerCase().includes(q)); })
      : data;
    if (showAlert) rows = rows.filter(r => deliveryStatus(r.prev_entrega) === "atraso");
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const va = clienteSortVal(a, sortCol), vb = clienteSortVal(b, sortCol);
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
          <FileText className="w-3.5 h-3.5 text-blue-400" />Relação de Entregas
          <span className="font-mono font-normal text-ares-4 normal-case text-[10px]">({data.length} registros)</span>
        </CardTitle>

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

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar CTE, serviço, destinatário, cidade..."
          className="text-xs bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-2 placeholder:text-ares-4 outline-none focus:border-amber-500/50 w-64 transition-colors ml-auto" />
        <ExportMenu data={filtered} />
      </CardHeader>
      <CardContent className="p-0">
        {loading ? <div className="p-4"><Skeleton className="h-48 w-full bg-white/5" /></div> : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-ares-4"><Database className="w-6 h-6 opacity-30" /><span className="text-[11px] uppercase tracking-widest">{search?"Nenhum resultado":"Nenhum dado no período"}</span></div>
        ) : (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-ares-panel z-10">
                <tr className="border-b border-ares">
                  {CLIENTE_COLS.map(col => (
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
                  const status  = deliveryStatus(r.prev_entrega);
                  const dias    = status === "atraso" ? diasAtraso(r.prev_entrega) : 0;
                  const isLate3 = dias >= 3;
                  const rowCls  = status === "atraso"
                    ? "border-b border-red-500/20 bg-red-500/5 hover:bg-red-500/10 transition-colors"
                    : status === "hoje"
                    ? "border-b border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-colors"
                    : "border-b border-ares hover:bg-ares-surface transition-colors";
                  return (
                    <tr key={i} className={rowCls}>
                      <td className="py-2 pl-3 pr-1 w-4">
                        {status === "atraso" && (
                          <span className={`block w-2 h-2 rounded-full bg-red-500 ${isLate3 ? "animate-pulse" : ""}`} title={`${dias}d atraso`} />
                        )}
                        {status === "hoje" && (
                          <span className="block w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Vence hoje" />
                        )}
                      </td>
                      <td className="py-2 px-3 font-mono text-amber-400 whitespace-nowrap text-[10px]">{r.cte_nfse||"—"}</td>
                      <td className="py-2 px-3 font-mono text-ares-3 whitespace-nowrap text-[10px] max-w-[10rem] truncate" title={r.nf_doc||undefined}>{r.nf_doc||"—"}</td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap">{r.servico||"—"}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap">{fmtDate(r.emissao?.slice(0,10))}</td>
                      <td className={`py-2 px-3 whitespace-nowrap font-semibold ${
                        status === "atraso" ? "text-red-400" :
                        status === "hoje"   ? "text-amber-400" :
                        "text-ares-3"
                      }`}>{fmtDate(r.prev_entrega)}</td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        {status === "atraso" ? (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isLate3 ? "text-red-300 bg-red-500/20" : "text-red-400"}`}>{dias}d</span>
                        ) : status === "hoje" ? (
                          <span className="text-[10px] font-bold text-amber-400">hoje</span>
                        ) : (
                          <span className="text-[10px] text-ares-4">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap max-w-[14rem] truncate" title={r.destinatario||undefined}>{r.destinatario||"—"}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap">{r.destino||"—"}</td>
                      <td className="py-2 px-3 text-center"><Badge variant="outline" className="text-[10px] border-ares text-ares-3 px-1.5">{r.uf||"—"}</Badge></td>
                      <td className="py-2 px-3 text-center tabular-nums text-ares-2">{r.vol||"—"}</td>
                      <td className="py-2 px-3 text-right tabular-nums whitespace-nowrap text-ares-2">{r.peso?Number(r.peso).toLocaleString("pt-BR"):"—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 300 && <div className="px-4 py-2.5 text-[11px] text-ares-4 border-t border-ares">Exibindo 300 de {filtered.length} registros — use os filtros para refinar</div>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PortalCliente() {
  const [selectedUF, setSelectedUF]       = useState<string | null>(null);
  const [data, setData]                   = useState<PerfData | null>(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [lastSync, setLastSync]           = useState("");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterTipo, setFilterTipo]       = useState("");
  const [isClienteRole, setIsClienteRole] = useState(false);
  const filtersRef = useRef({ cliente: "", tipo: "" });

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    try {
      const { cliente, tipo } = filtersRef.current;
      const p = new URLSearchParams();
      if (cliente) p.set("cliente", cliente);
      if (tipo)    p.set("tipo", tipo);
      const qs = p.toString();
      const json = await fetch(`/api/performance${qs ? "?" + qs : ""}`).then(r => r.json()) as PerfData;
      setData(json); setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.role === "cliente") setIsClienteRole(true);
    });
  }, []);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);
  useEffect(() => { const id = setInterval(() => fetchData(), 5*60*1000); return () => clearInterval(id); }, [fetchData]);

  const kpis = data?.kpis; const ufData = data?.por_uf ?? []; const filteredCte = data?.cte ?? [];
  const clientes = Array.from(new Set(filteredCte.map(r => r.cliente).filter(Boolean))).sort();

  function handleFilter(key: "cliente"|"tipo", val: string) {
    filtersRef.current = { ...filtersRef.current, [key]: val };
    if (key === "cliente") setFilterCliente(val);
    if (key === "tipo")    setFilterTipo(val);
    fetchData();
  }

  const headerExtras = data?.periodo ? (
    <div className="hidden md:flex items-center gap-2">
      <CalendarDays className="w-3.5 h-3.5 text-amber-500 shrink-0" />
      <span className="text-xs text-ares-3 bg-ares-surface border border-ares-input rounded-lg px-2.5 py-1 tabular-nums">{fmtDate(data.periodo.desde)} – {fmtDate(data.periodo.ate)}</span>
    </div>
  ) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {selectedUF && <UFDetailDrawer uf={selectedUF} ufStats={ufData.find(d => d.uf === selectedUF)} onClose={() => setSelectedUF(null)} />}

      <PageHeader title={<>Portal <span className="text-amber-400">·</span> Cliente</>} onRefresh={fetchData} refreshing={refreshing} lastSync={lastSync}>{headerExtras}</PageHeader>

      <FilterBar
        filters={[
          ...(isClienteRole ? [] : [{ key: "cliente" as const, label: "Cliente:", value: filterCliente, options: [["", "Todos"], ...clientes.map(c => [c, c])] as [string, string][] }]),
          { key: "tipo" as const, label: "Tipo Emissão:", value: filterTipo, options: [["", "Todos"], ...["ENTREGA","DEVOLUCAO","CORTESIA","REENTREGA","GAIOLAS"].map(t => [t, t])] as [string, string][] },
        ]}
        onChange={handleFilter}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <TopKpi title="Perecíveis"   value={kpis?.pereciveis   ?? 0} icon={<Thermometer className="w-5 h-5" />}  color="#f59e0b" loading={loading} />
          <TopKpi title="Agendamentos" value={kpis?.agendamentos ?? 0} icon={<CalendarCheck className="w-5 h-5" />} color="#3b82f6" loading={loading} />
          <TopKpi title="Prioridades"  value={kpis?.prioridades  ?? 0} icon={<Star className="w-5 h-5" />}          color="#ec4899" loading={loading} />
          <TopKpi title="Devoluções"   value={kpis?.devolucoes   ?? 0} icon={<RotateCcw className="w-5 h-5" />}    color="#8b5cf6" loading={loading} />
        </div>

        <div className="grid grid-cols-[260px_1fr_420px] gap-3 items-stretch">
          <PerformanceDonut kpis={kpis} loading={loading} />
          <BrazilMapChart data={ufData.map(d => ({ uf: d.uf, total: d.em_movimento }))} loading={loading && !ufData.length} onSelect={uf => setSelectedUF(prev => prev === uf ? null : uf)} selectedUF={selectedUF} />
          <div className="flex flex-col gap-2 min-h-0">
            <div className="flex-1"><UFBarsSmall data={data?.por_uf_dia    ?? []} color="#06b6d4" title="Entregas do Dia por UF"    loading={loading} /></div>
            <div className="flex-1"><UFBarsSmall data={data?.por_uf_atraso ?? []} color="#ef4444" title="Entregas em Atraso por UF" loading={loading} /></div>
            <div className="flex-1"><ProjecaoChart data={data?.projecao_7d ?? []} loading={loading} /></div>
          </div>
        </div>

        <PerfCTETable data={filteredCte} loading={loading} />

        <div className="border-t border-ares pt-3 pb-1 flex items-center justify-between text-[11px] text-ares-4">
          <span>ARES Intelligence © {new Date().getFullYear()} — Acerta Express</span>
          <span className="flex items-center gap-1.5"><Clock className="w-3 h-3" />Atualização automática a cada 5 minutos</span>
        </div>
      </main>
    </div>
  );
}

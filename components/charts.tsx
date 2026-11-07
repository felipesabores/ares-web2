"use client";

import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
  LineChart, Line,
} from "recharts";
import {
  Activity, AlertTriangle, Calendar, CheckCircle2,
  ChevronLeft, ChevronRight, Database, FileText, Timer, Download,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

export const COLORS = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#f97316","#06b6d4","#ec4899","#84cc16"];

/* ─── Date helpers ─────────────────────────────────────────────────────────── */
export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function prevMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function nextMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(ym: string) {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${months[parseInt(m) - 1]} / ${y}`;
}
export function formatDateBR(iso: string | null) {
  if (!iso) return "—";
  const parts = iso.split("-");
  if (parts.length !== 3) return iso;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/* ─── CSV Export ───────────────────────────────────────────────────────────── */
export function exportToCsv(filename: string, columns: TableColumn[], data: Record<string, string | number | null>[]) {
  const header = columns.map(c => `"${c.label}"`).join(";");
  const rows = data.map(row =>
    columns.map(c => {
      const v = row[c.key];
      if (v == null) return "";
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(";")
  );
  const bom = "﻿";
  const csv = bom + [header, ...rows].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Types ────────────────────────────────────────────────────────────────── */
export interface ChartItem { [key: string]: string | number }

export interface TableColumn {
  key: string;
  label: string;
  className?: string;
  render?: (value: string | number | null | undefined, row: Record<string, string | number | null>) => React.ReactNode;
}

/* ─── Live Clock ───────────────────────────────────────────────────────────── */
export function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleString("pt-BR", {
      day:"2-digit", month:"2-digit", year:"numeric",
      hour:"2-digit", minute:"2-digit", second:"2-digit",
    }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm tabular-nums text-amber-400">{time}</span>;
}

/* ─── Empty State ──────────────────────────────────────────────────────────── */
export function EmptyState({ label = "Sem dados para o período" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-52 gap-3 text-ares-4">
      <Database className="w-7 h-7 opacity-40" />
      <span className="text-[11px] uppercase tracking-widest">{label}</span>
    </div>
  );
}

/* ─── Month Picker ─────────────────────────────────────────────────────────── */
export function MonthPicker({ value, onChange }: { value: string; onChange: (m: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => value && onChange(prevMonth(value))}
        disabled={!value}
        className="p-1 rounded-md hover:bg-white/10 text-ares-4 hover:text-ares-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <div className="relative">
        {value ? (
          <button
            onClick={() => inputRef.current?.showPicker?.()}
            className="text-xs bg-ares-surface border border-ares-input rounded-lg px-2.5 py-1 text-ares-2 min-w-[7rem] text-left transition-colors hover:border-amber-500/50"
          >
            {monthLabel(value)}
          </button>
        ) : (
          <span
            onClick={() => { onChange(currentMonth()); setTimeout(() => inputRef.current?.showPicker?.(), 50); }}
            className="text-xs text-ares-3 px-3 py-1 rounded-lg bg-ares-surface border border-ares-input cursor-pointer hover:border-amber-500/50 transition-colors inline-block"
          >
            Todos os dados
          </span>
        )}
        <input
          ref={inputRef} type="month" value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 pointer-events-none w-full" tabIndex={-1}
        />
      </div>
      <button
        onClick={() => value && onChange(nextMonth(value))}
        disabled={!value}
        className="p-1 rounded-md hover:bg-white/10 text-ares-4 hover:text-ares-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ─── KPI Card ─────────────────────────────────────────────────────────────── */
interface KpiCardProps {
  title: React.ReactNode; value: number | string; icon: React.ReactNode;
  color: string; sub?: React.ReactNode; loading?: boolean;
  exportId?: string;       // se setado, renderiza botão de download em /api/comercial/export/{exportId}
  exportLabel?: string;    // texto do tooltip (default genérico se não informado)
  exportParams?: string;   // query string extra (ex: "cliente=medlevensohn")
}
export function KpiCard({ title, value, icon, color, sub, loading, exportId, exportLabel, exportParams }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-ares bg-ares-panel p-6 relative cursor-default min-h-[120px] overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${color}cc, ${color}44, transparent)` }} />
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest leading-tight pr-2">{title}</div>
        <div className="flex items-start gap-1.5 shrink-0">
          {exportId && !loading && (
            <div className="relative group">
              <a
                href={`/api/comercial/export/${exportId}${exportParams ? `?${exportParams}` : ""}`}
                aria-label={exportLabel || "Baixar dados deste KPI"}
                className="block p-1.5 rounded-md text-ares-4 hover:text-ares-1 hover:bg-white/10 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <div
                role="tooltip"
                className="absolute right-0 top-full mt-2 w-56 px-3 py-2 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50"
              >
                <span className="block font-semibold mb-1">Baixar planilha (XLSX)</span>
                <span className="text-zinc-400 text-[10px] leading-snug">
                  {exportLabel || "Dados que compõem este KPI"}
                </span>
              </div>
            </div>
          )}
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
            style={{ background: `${color}15`, boxShadow: `0 0 0 1px ${color}20` }}>
            <div style={{ color }}>{icon}</div>
          </div>
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-24 mt-4 mb-1" style={{ background: `${color}15` }} />
      ) : (
        <div className="text-[2rem] font-bold tabular-nums tracking-tight mt-4 mb-1"
          style={{ color, fontFamily: "var(--font-display)" }}>
          {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
        </div>
      )}
      {sub && <span className="text-[11px] text-ares-4 mt-1 block">{sub}</span>}
    </div>
  );
}

/* ─── Performance Gauge ────────────────────────────────────────────────────── */
export function PerformanceGauge({ value, loading }: { value: number; loading: boolean }) {
  const { theme } = useTheme();
  const gaugeBg = theme === "dark" ? "#3f3f46" : "#e2e8f0";
  const color = value >= 90 ? "#10b981" : value >= 70 ? "#f59e0b" : "#ef4444";
  const displayVal = value || 0;
  const data = [
    { name: "Realizadas", value: displayVal, fill: displayVal > 0 ? color : gaugeBg },
    { name: "bg", value: 100 - displayVal, fill: gaugeBg },
  ];
  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-amber-400" />Performance Geral
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center flex-1 pb-5">
        {loading ? <Skeleton className="w-52 h-52 rounded-full bg-white/5" /> : (
          <div className="relative">
            <RadialBarChart width={220} height={220} innerRadius={72} outerRadius={98}
              data={data} startAngle={225} endAngle={-45} cx={110} cy={110}>
              <RadialBar dataKey="value" cornerRadius={10} />
            </RadialBarChart>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              {displayVal === 0
                ? <span className="text-3xl font-bold text-ares-4">—</span>
                : <span className="text-5xl font-bold tabular-nums" style={{ color, fontFamily: "var(--font-display)" }}>{value}%</span>
              }
              <span className="text-xs text-ares-3 mt-1 tracking-wider">entregas realizadas</span>
            </div>
          </div>
        )}
        <div className="flex gap-4 mt-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-emerald-400"><CheckCircle2 className="w-3 h-3" />≥90%</span>
          <span className="flex items-center gap-1.5 text-amber-400"><Timer className="w-3 h-3" />≥70%</span>
          <span className="flex items-center gap-1.5 text-red-400"><AlertTriangle className="w-3 h-3" />&lt;70%</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Chart color hook ─────────────────────────────────────────────────────── */
function useChartColors() {
  const { theme } = useTheme();
  return {
    grid:       theme === "dark" ? "#3f3f46" : "#e2e8f0",
    tooltip:    { bg: theme === "dark" ? "#27272a" : "#ffffff", border: theme === "dark" ? "#3f3f46" : "#e2e8f0" },
    labelColor: theme === "dark" ? "#fafafa"  : "#0f172a",
    itemColor:  theme === "dark" ? "#d4d4d8"  : "#475569",
    tickMajor:  theme === "dark" ? "#a1a1aa"  : "#64748b",
    tickMinor:  theme === "dark" ? "#71717a"  : "#94a3b8",
  };
}

/* ─── Vertical Bar Chart ───────────────────────────────────────────────────── */
export function VBarChart({ data, xKey, barKey, label, loading }: {
  data: ChartItem[]; xKey: string; barKey: string; label: React.ReactNode; loading: boolean;
}) {
  const c = useChartColors();
  return (
    <Card className="panel border-0 h-full">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4 pt-2">
        {loading ? <Skeleton className="h-64 w-full bg-white/5" /> :
         data.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 52 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey={xKey} tick={{ fill: c.tickMajor, fontSize: 10, fontFamily: "inherit" }} angle={-40} textAnchor="end" axisLine={false} tickLine={false} interval={0} dy={4} />
              <YAxis tick={{ fill: c.tickMinor, fontSize: 10, fontFamily: "inherit" }} axisLine={false} tickLine={false} width={44}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip contentStyle={{ background: c.tooltip.bg, border: `1px solid ${c.tooltip.border}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}
                labelStyle={{ color: c.labelColor, fontWeight: 600 }} itemStyle={{ color: c.itemColor }} cursor={{ fill:"#ffffff04" }} />
              <Bar dataKey={barKey} radius={[4,4,0,0]} maxBarSize={36}>
                {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.9} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Horizontal Bar Chart ─────────────────────────────────────────────────── */
export function HBarChart({ data, xKey, barKey, color, label, loading }: {
  data: ChartItem[]; xKey: string; barKey: string; color: string; label: React.ReactNode; loading: boolean;
}) {
  const c = useChartColors();
  return (
    <Card className="panel border-0 h-full">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4 pt-2">
        {loading ? <Skeleton className="h-64 w-full bg-white/5" /> :
         data.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} layout="vertical" margin={{ left: 4, right: 28, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} horizontal={false} />
              <XAxis type="number" tick={{ fill: c.tickMinor, fontSize: 10, fontFamily: "inherit" }} axisLine={false} tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <YAxis type="category" dataKey={xKey} tick={{ fill: c.tickMajor, fontSize: 10, fontFamily: "inherit" }} width={108} axisLine={false} tickLine={false}
                tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 14) + "…" : v} />
              <Tooltip contentStyle={{ background: c.tooltip.bg, border: `1px solid ${c.tooltip.border}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}
                labelStyle={{ color: c.labelColor, fontWeight: 600 }} cursor={{ fill:"#ffffff04" }} />
              <Bar dataKey={barKey} fill={color} radius={[0,4,4,0]} maxBarSize={20} fillOpacity={0.85} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Donut Chart ──────────────────────────────────────────────────────────── */
export function DonutChart({ data, nameKey, valueKey, label, loading, totalFormatter, totalLabel }: {
  data: ChartItem[]; nameKey: string; valueKey: string; label: React.ReactNode; loading: boolean;
  totalFormatter?: (n: number) => string;
  totalLabel?: string;  // texto sob o número no centro do donut (default: "total")
}) {
  const total = data.reduce((s, d) => s + (d[valueKey] as number), 0);
  const totalStr = totalFormatter
    ? totalFormatter(total)
    : (total >= 1000 ? `${(total/1000).toFixed(1)}k` : String(total));
  return (
    <Card className="panel border-0 h-full">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-3">
        {loading ? <Skeleton className="h-52 w-full bg-white/5" /> :
         data.length === 0 ? <EmptyState /> : (
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <PieChart width={148} height={148}>
                <Pie data={data} cx={74} cy={74} innerRadius={44} outerRadius={66}
                  dataKey={valueKey} nameKey={nameKey} paddingAngle={3} strokeWidth={0}>
                  {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-base font-bold tabular-nums text-ares-1">{totalStr}</span>
                <span className={`text-[9px] text-ares-4 uppercase text-center leading-tight max-w-[60px] break-words ${totalLabel ? "tracking-normal" : "tracking-wider"}`}>{totalLabel ?? "total"}</span>
              </div>
            </div>
            <div className="flex-1 space-y-2 min-w-0">
              {data.slice(0, 7).map((d, i) => {
                const pct = total > 0 ? Math.round(((d[valueKey] as number) / total) * 100) : 0;
                return (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-ares-3 truncate">{String(d[nameKey]).slice(0, 16)}</span>
                      </div>
                      <span className="font-mono text-ares-2 shrink-0 ml-2 text-[10px]">{pct}%</span>
                    </div>
                    <div className="h-0.5 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background:COLORS[i % COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Timeline (Line) Chart ────────────────────────────────────────────────── */
export function TimelineChart({ data, xKey, yKey, color, label, loading }: {
  data: ChartItem[]; xKey: string; yKey: string; color: string; label: React.ReactNode; loading: boolean;
}) {
  const c = useChartColors();
  const formatted = data.map(d => ({
    ...d,
    _label: d[xKey] ? String(d[xKey]).slice(5) : "",
  }));
  return (
    <Card className="panel border-0 h-full">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest">{label}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-4 pt-2">
        {loading ? <Skeleton className="h-64 w-full bg-white/5" /> :
         data.length === 0 ? <EmptyState /> : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={formatted} margin={{ left: 0, right: 16, top: 4, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
              <XAxis dataKey="_label" tick={{ fill: c.tickMinor, fontSize: 9, fontFamily: "inherit" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: c.tickMinor, fontSize: 10, fontFamily: "inherit" }} axisLine={false} tickLine={false} width={36}
                tickFormatter={(v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
              <Tooltip contentStyle={{ background: c.tooltip.bg, border: `1px solid ${c.tooltip.border}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}
                labelStyle={{ color: c.labelColor, fontWeight: 600 }} cursor={{ stroke: color + "44" }} />
              <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: color }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Simple Table ─────────────────────────────────────────────────────────── */
export function SimpleTable({
  columns, data, loading, searchKeys = [], title, maxHeight = "24rem", exportFilename,
}: {
  columns: TableColumn[];
  data: Record<string, string | number | null>[];
  loading: boolean;
  searchKeys?: string[];
  title?: React.ReactNode;
  maxHeight?: string;
  exportFilename?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = searchKeys.length > 0
    ? data.filter(r => searchKeys.some(k => String(r[k] ?? "").toLowerCase().includes(search.toLowerCase())))
    : data;

  return (
    <Card className="panel border-0">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4 flex-wrap">
        {title && (
          <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest flex items-center gap-2 shrink-0">
            {title}
          </CardTitle>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {searchKeys.length > 0 && (
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="text-xs bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-2 placeholder:text-ares-4 outline-none focus:border-amber-500/50 w-48 sm:w-64 transition-colors"
            />
          )}
          {exportFilename && data.length > 0 && (
            <button
              onClick={() => exportToCsv(exportFilename, columns, filtered)}
              title="Exportar CSV"
              className="flex items-center gap-1.5 text-[11px] text-ares-4 hover:text-amber-400 border border-ares hover:border-amber-400/40 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">CSV</span>
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {loading
          ? <div className="p-4"><Skeleton className="h-48 w-full bg-white/5" /></div>
          : data.length === 0
          ? <EmptyState label="Sem registros encontrados" />
          : (
            <div className="overflow-auto" style={{ maxHeight }}>
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ares-panel z-10">
                  <tr className="border-b border-ares">
                    {columns.map(col => (
                      <th key={col.key} className={`text-left py-2.5 px-3 text-ares-4 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap ${col.className ?? ""}`}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((row, i) => (
                    <tr key={i} className="border-b border-ares hover-ares transition-colors">
                      {columns.map(col => (
                        <td key={col.key} className={`py-2 px-3 text-ares-3 whitespace-nowrap ${col.className ?? ""}`}>
                          {col.render
                            ? col.render(row[col.key], row)
                            : (row[col.key] != null ? String(row[col.key]) : "—")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 text-[11px] text-ares-4 border-t border-ares">
                Exibindo {Math.min(filtered.length, 500)} de {filtered.length} registros
              </div>
            </div>
          )
        }
      </CardContent>
    </Card>
  );
}

/* ─── CTE Table (specialised) ──────────────────────────────────────────────── */
export interface CTERow {
  minuta: string; servico: string; emissao: string; prev_entrega: string;
  cliente: string; remetente: string; destinatario: string; destino: string;
  uf: string; peso: string; total: string; status: string;
}
export function CTETable({ data, loading }: { data: CTERow[]; loading: boolean }) {
  const [search, setSearch] = useState("");
  const filtered = data.filter(r =>
    [r.minuta, r.cliente, r.destinatario, r.destino, r.uf].some(v =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );
  const cols = ["Minuta","Serviço","Emissão","Prev. Entrega","Cliente","Destinatário","Destino","UF","Peso","Total","Status"];
  return (
    <Card className="panel border-0">
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-4">
        <CardTitle className="text-xs font-semibold text-ares-3 uppercase tracking-widest flex items-center gap-2 shrink-0">
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          Relação de CTe — Emissões do Período
        </CardTitle>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar minuta, cliente, destino..."
          className="text-xs bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-2 placeholder:text-ares-4 outline-none focus:border-amber-500/50 w-72 transition-colors ml-auto"
        />
      </CardHeader>
      <CardContent className="p-0">
        {loading
          ? <div className="p-4"><Skeleton className="h-48 w-full bg-white/5" /></div>
          : data.length === 0
          ? <EmptyState label="Nenhuma emissão encontrada para o período selecionado" />
          : (
            <div className="overflow-auto max-h-80">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-ares-panel z-10">
                  <tr className="border-b border-ares">
                    {cols.map(h => <th key={h} className="text-left py-2.5 px-3 text-ares-4 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-b border-ares hover-ares transition-colors">
                      <td className="py-2 px-3 font-mono text-amber-400 whitespace-nowrap">
                        {r.minuta ? String(parseFloat(r.minuta)).replace(".0","") : "—"}
                      </td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap">{r.servico}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap">{r.emissao}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap">{r.prev_entrega}</td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap max-w-[9rem] truncate">{r.cliente}</td>
                      <td className="py-2 px-3 text-ares-3 whitespace-nowrap max-w-[9rem] truncate">{r.destinatario}</td>
                      <td className="py-2 px-3 text-ares-2 whitespace-nowrap">{r.destino}</td>
                      <td className="py-2 px-3 text-center">
                        <Badge variant="outline" className="text-[10px] border-ares text-ares-3 px-1.5">{r.uf}</Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-ares-3">{r.peso}</td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-400">{r.total}</td>
                      <td className="py-2 px-3">
                        <Badge variant="outline" className={`text-[10px] px-2 ${r.status === "Entregue"
                          ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                          : "border-amber-500/40 text-amber-400 bg-amber-500/10"}`}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2.5 text-[11px] text-ares-4 border-t border-ares">
                Exibindo {Math.min(filtered.length, 200)} de {filtered.length} registros
              </div>
            </div>
          )
        }
      </CardContent>
    </Card>
  );
}

/* ─── Status Badge ─────────────────────────────────────────────────────────── */
export function StatusBadge({ value, map }: {
  value: string | null | undefined;
  map?: Record<string, { color: string; bg: string; border: string }>;
}) {
  const v = value ?? "—";
  const style = map?.[v];
  if (!style) return (
    <Badge variant="outline" className="text-[10px] border-ares text-ares-3 px-1.5">{v}</Badge>
  );
  return (
    <Badge variant="outline" className="text-[10px] px-2"
      style={{ color: style.color, background: style.bg, borderColor: style.border }}>
      {v}
    </Badge>
  );
}

// Re-export Button for convenience in page headers
export { Button };
export { Calendar };

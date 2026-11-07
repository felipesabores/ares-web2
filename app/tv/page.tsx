"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, CartesianGrid, Legend,
} from "recharts";
import {
  Truck, AlertTriangle, CalendarCheck, CalendarDays, CheckCircle2,
  RefreshCw, Thermometer, Star, RotateCcw, MapPin, Users, X, TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

const BrazilMapChart = dynamic(() => import("@/components/BrazilMapChart"), { ssr: false });

/* ─── Viewport scale hook ────────────────────────────────────────────────────
   Retorna 1% da largura do viewport em px.
   1920px → vw = 19.2  |  3840px → vw = 38.4
   Use vw * N para tamanhos que precisam escalar com a resolução da TV.
─────────────────────────────────────────────────────────────────────────── */
function useVW() {
  const [vw, setVw] = useState(19.2);
  useEffect(() => {
    const update = () => setVw(window.innerWidth / 100);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return vw;
}

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface PerfKPIs {
  em_movimento: number; atraso: number;
  entregas_dia: number; no_prazo: number; sac_aberto: number;
  pontualidade: number; pereciveis: number; agendamentos: number;
  prioridades: number; devolucoes: number;
}
interface UFRow   { uf: string; atraso: number; em_movimento: number; entregas_dia: number; pontualidade: number }
interface ProjRow { data: string; total: number }
interface RespRow { nome: string; em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number }
interface SACRow  { atendente: string; total: number }

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtShort(iso: string) {
  if (!iso) return "—";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/* ─── Relógio ─────────────────────────────────────────────────────────────── */
function Clock({ vw }: { vw: number }) {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setDate(now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="text-right">
      <div className="font-bold text-white font-mono tracking-widest" style={{ fontSize: vw * 3.6 }}>{time}</div>
      <div className="text-gray-400 capitalize" style={{ fontSize: vw * 0.9, marginTop: vw * 0.2 }}>{date}</div>
    </div>
  );
}

/* ─── KPI Card ────────────────────────────────────────────────────────────── */
function KpiCard({ title, value, icon, color, vw }: {
  title: string; value: number; icon: React.ReactNode; color: string; vw: number;
}) {
  return (
    <div className="rounded-2xl border flex flex-col justify-between min-w-0 overflow-hidden"
      style={{ borderColor: color + "33", background: color + "0d", padding: `${vw * 0.8}px` }}>
      <div className="flex items-center justify-between" style={{ marginBottom: vw * 0.3 }}>
        <span className="font-semibold uppercase tracking-widest leading-tight" style={{ color: color + "cc", fontSize: vw * 0.65 }}>{title}</span>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="font-black text-white leading-none tabular-nums" style={{ fontSize: vw * 3.2 }}>
        {value.toLocaleString("pt-BR")}
      </div>
    </div>
  );
}

/* ─── Performance Donut ──────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieInsideLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent, vw }: any) {
  if (percent < 0.07) return null;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * Math.PI / 180);
  const y = cy + r * Math.sin(-midAngle * Math.PI / 180);
  return <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={vw * 0.9} fontWeight="bold" style={{ pointerEvents: "none" }}>{`${(percent * 100).toFixed(0)}%`}</text>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DonutTip({ active, payload, vw }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#111] border border-white/20 rounded-lg shadow-xl" style={{ padding: `${vw * 0.5}px ${vw * 0.8}px`, fontSize: vw * 0.8 }}>
      <span className="flex items-center" style={{ gap: vw * 0.4 }}>
        <span className="rounded-full shrink-0" style={{ width: vw * 0.5, height: vw * 0.5, background: payload[0].payload.fill }} />
        <span className="text-gray-300">{payload[0].name}:</span>
        <span className="font-mono font-bold text-white">{payload[0].value.toLocaleString("pt-BR")}</span>
      </span>
    </div>
  );
}

function PerformanceDonut({ kpis, vw }: { kpis: PerfKPIs | null; vw: number }) {
  const total   = kpis?.em_movimento ?? 0;
  const atraso  = kpis?.atraso       ?? 0;
  const diahoje = kpis?.entregas_dia  ?? 0;
  const noPrazo = kpis?.no_prazo     ?? 0;
  const pont    = kpis?.pontualidade  ?? 0;
  const pontColor = pont >= 80 ? "#10b981" : pont >= 60 ? "#f59e0b" : "#ef4444";
  const slices = total > 0
    ? [
        { name: "No Prazo",        value: noPrazo, fill: "#10b981" },
        { name: "Entregas do Dia", value: diahoje,  fill: "#06b6d4" },
        { name: "Atraso",          value: atraso,   fill: "#ef4444" },
      ].filter(s => s.value > 0)
    : [{ name: "—", value: 1, fill: "rgba(255,255,255,0.05)" }];

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 flex flex-col h-full" style={{ padding: vw * 1.1 }}>
      <div className="font-semibold text-gray-400 uppercase tracking-widest shrink-0" style={{ fontSize: vw * 0.75, marginBottom: vw * 0.6 }}>Performance Diária</div>
      <div className="text-center shrink-0">
        <span className="font-black text-white tabular-nums" style={{ fontSize: vw * 3.8 }}>{total.toLocaleString("pt-BR")}</span>
        <span className="text-gray-500 block uppercase tracking-widest" style={{ fontSize: vw * 0.6, marginTop: vw * 0.1 }}>em movimento</span>
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} cx="50%" cy="50%" innerRadius={0} outerRadius="75%"
              dataKey="value" strokeWidth={0} paddingAngle={total > 0 ? 2 : 0}
              isAnimationActive={false} labelLine={false}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              label={(props: any) => <PieInsideLabel {...props} vw={vw} />}>
              {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
            </Pie>
            <Tooltip content={(props) => <DonutTip {...props} vw={vw} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0" style={{ marginTop: vw * 0.4 }}>
        {[
          { label: "No Prazo",        val: noPrazo, color: "#10b981" },
          { label: "Entregas do Dia", val: diahoje,  color: "#06b6d4" },
          { label: "Atraso",          val: atraso,   color: "#ef4444" },
        ].map(l => (
          <div key={l.label} className="flex items-center justify-between" style={{ fontSize: vw * 0.8, marginBottom: vw * 0.2 }}>
            <span className="flex items-center" style={{ gap: vw * 0.35 }}>
              <span className="rounded-full shrink-0" style={{ width: vw * 0.5, height: vw * 0.5, background: l.color }} />
              <span className="text-gray-400">{l.label}</span>
            </span>
            <span className="font-mono font-bold" style={{ color: l.color }}>{l.val.toLocaleString("pt-BR")}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-white/10" style={{ paddingTop: vw * 0.4, marginTop: vw * 0.3, fontSize: vw * 0.8 }}>
          <span className="text-gray-500">Pontualidade</span>
          <span className="font-mono font-black" style={{ color: pontColor, fontSize: vw * 1.4 }}>{pont}%</span>
        </div>
      </div>
    </div>
  );
}

/* ─── SAC Pizza ──────────────────────────────────────────────────────────── */
const SAC_COLORS = ["#3b82f6","#8b5cf6","#f59e0b","#ec4899","#14b8a6","#f97316"];

function SACPizza({ data, vw }: { data: SACRow[]; vw: number }) {
  const total  = data.reduce((s, r) => s + r.total, 0);
  const slices = data.map((r, i) => ({ name: r.atendente, value: r.total, fill: SAC_COLORS[i % SAC_COLORS.length] }));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 flex flex-col h-full" style={{ padding: vw * 1 }}>
      <div className="flex items-center justify-between shrink-0" style={{ marginBottom: vw * 0.3 }}>
        <span className="font-semibold text-gray-400 uppercase tracking-widest" style={{ fontSize: vw * 0.75 }}>SAC em Aberto</span>
        {total > 0 && <span className="font-mono font-bold text-white" style={{ fontSize: vw * 1.4 }}>{total}</span>}
      </div>
      {data.length === 0
        ? <div className="flex-1 flex items-center justify-center text-gray-500" style={{ fontSize: vw * 0.85 }}>Sem SAC em aberto</div>
        : (
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={slices} cx="50%" cy="40%" innerRadius="22%" outerRadius="52%"
                  dataKey="value" strokeWidth={0} paddingAngle={2}
                  label={({ percent }: { percent?: number }) => (percent ?? 0) > 0.05 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""}
                  labelLine={false}>
                  {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: vw * 0.75 }} />
                <Legend iconType="circle" iconSize={vw * 0.5} formatter={v => <span style={{ fontSize: vw * 0.7, color: "#d1d5db" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
    </div>
  );
}

/* ─── Projeção ───────────────────────────────────────────────────────────── */
function Projecao({ data, vw }: { data: ProjRow[]; vw: number }) {
  const formatted = data.map(r => ({ ...r, label: fmtShort(r.data) }));
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 flex flex-col h-full" style={{ padding: vw * 1 }}>
      <div className="font-semibold text-gray-400 uppercase tracking-widest shrink-0" style={{ fontSize: vw * 0.75, marginBottom: vw * 0.5 }}>Projeção 7 Dias</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={formatted} margin={{ top: vw * 1.2, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: vw * 0.75 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#6b7280", fontSize: vw * 0.75 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, color: "#fff", fontSize: vw * 0.75 }} formatter={(v) => [v, "Entregas"]} />
            <Bar dataKey="total" radius={[5, 5, 0, 0]}>
              {data.map((_, i) => <Cell key={i} fill="#f59e0b" fillOpacity={0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ─── Responsável Card ───────────────────────────────────────────────────── */
const RESP_COLOR: Record<string, string> = {
  ACSA:      "#3b82f6",
  SABRINA:   "#ef4444",
  KAMILLA:   "#8b5cf6",
  LAIS:      "#ec4899",
  LUANY:     "#06b6d4",
  RANYERI:   "#10b981",
  TAYLON:    "#f59e0b",
};

function RespCard({ data, selected, onSelect, vw }: { data: RespRow; selected: boolean; onSelect: () => void; vw: number }) {
  const color = RESP_COLOR[data.nome] ?? "#f59e0b";
  return (
    <button
      onClick={onSelect}
      className={`rounded-xl border w-full text-left transition-all hover:scale-[1.01] cursor-pointer ${
        selected ? "border-2" : "border-white/10 bg-white/5 hover:border-white/20"
      }`}
      style={{
        padding: `${vw * 0.7}px ${vw * 0.9}px`,
        ...(selected ? { borderColor: color, boxShadow: `0 0 ${vw}px ${color}40`, background: `${color}10` } : {}),
      }}
    >
      <div className="flex items-center justify-between" style={{ marginBottom: vw * 0.3 }}>
        <span className="font-bold uppercase tracking-widest" style={{ color, fontSize: vw * 0.9 }}>{data.nome}</span>
        <span className="font-black text-white tabular-nums" style={{ fontSize: vw * 2 }}>{data.em_movimento.toLocaleString("pt-BR")}</span>
      </div>
      <div className="grid grid-cols-3 text-center" style={{ gap: vw * 0.4 }}>
        {[
          { val: data.no_prazo,    color: "#10b981", label: "no prazo" },
          { val: data.entregas_dia, color: "#06b6d4", label: "hoje" },
          { val: data.atraso,      color: data.atraso > 0 ? "#f87171" : "#4b5563", label: "atraso" },
        ].map(s => (
          <div key={s.label}>
            <div className="font-black tabular-nums" style={{ color: s.color, fontSize: vw * 1.2 }}>{s.val}</div>
            <div className="text-gray-500 uppercase tracking-wider" style={{ fontSize: vw * 0.5 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </button>
  );
}

/* ─── UF Drawer (fixed px — lido de perto) ──────────────────────────────── */
interface UFDetail {
  uf: string; nome: string; regiao: string; responsavel: string;
  kpis: { em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number; pontualidade: number };
  atrasados: { minuta: string; cliente: string; destino: string; prev_entrega: string; servico: string; dias_atraso: number }[];
  projecao: { data: string; total: number }[];
}

function UFDetailDrawer({ uf, onClose }: { uf: string; onClose: () => void }) {
  const [detail, setDetail] = useState<UFDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/performance/uf?uf=${uf}`).then(r => r.json()).then(d => setDetail(d)).finally(() => setLoading(false));
  }, [uf]);
  const pont = detail?.kpis.pontualidade ?? 0;
  const pontColor = pont >= 80 ? "#10b981" : pont >= 60 ? "#f59e0b" : "#ef4444";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full z-50 w-[480px] bg-[#0e0e1a] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden" style={{ animation: "slideIn 0.22s cubic-bezier(.4,0,.2,1)" }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center"><MapPin className="w-5 h-5 text-amber-400" /></div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white tracking-widest">{uf}</span>
                {detail && <span className="text-xs text-gray-400 bg-white/5 border border-white/10 rounded px-2 py-0.5">{detail.regiao}</span>}
              </div>
              <div className="text-sm text-gray-400">{detail?.nome ?? "Carregando..."}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {detail && (
            <div className="px-6 py-3 border-b border-white/10 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-sm text-gray-400">SAC Responsável:</span>
              <span className="text-base font-semibold text-blue-400">{detail.responsavel}</span>
            </div>
          )}
          <div className="px-6 py-5 border-b border-white/10 space-y-4">
            {loading
              ? <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-white/5 animate-pulse" />)}</div>
              : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Em Movimento", val: detail?.kpis.em_movimento ?? 0, color: "#3b82f6" },
                      { label: "Em Atraso",    val: detail?.kpis.atraso ?? 0,       color: "#ef4444" },
                      { label: "Entregas Hoje",val: detail?.kpis.entregas_dia ?? 0, color: "#f59e0b" },
                      { label: "No Prazo",     val: detail?.kpis.no_prazo ?? 0,     color: "#10b981" },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-center">
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
                        <div className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400 uppercase tracking-wider">Pontualidade</span>
                      <span className="text-xl font-bold tabular-nums" style={{ color: pontColor }}>{pont}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pont}%`, background: pontColor }} />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>0%</span><span>50%</span><span>100%</span></div>
                  </div>
                </>
              )}
          </div>
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-400 uppercase tracking-widest mb-3">
              <AlertTriangle className="w-4 h-4" />CTes em Atraso
              {detail && <span className="ml-auto text-gray-400 normal-case font-normal">{detail.atrasados.length} registros</span>}
            </div>
            {loading
              ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-white/5 animate-pulse" />)}</div>
              : !detail?.atrasados.length
              ? <div className="text-center py-4 text-sm text-gray-500">Nenhum CTe em atraso</div>
              : (
                <div className="space-y-2">
                  {detail.atrasados.map((r, i) => (
                    <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-amber-400">{r.minuta}</span>
                        <span className="text-sm text-red-400 font-semibold ml-auto">{r.dias_atraso}d atraso</span>
                      </div>
                      <div className="text-sm text-gray-300 truncate">{r.cliente || "—"}</div>
                      <div className="text-xs text-gray-500 truncate">{r.destino} · Prev: {r.prev_entrega?.slice(0,10)}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">
              <CalendarDays className="w-4 h-4" />Projeção — Próximos 5 dias
            </div>
            {loading
              ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded bg-white/5 animate-pulse" />)}</div>
              : !detail?.projecao.length
              ? <div className="text-center py-4 text-sm text-gray-500">Sem entregas previstas</div>
              : (
                <div className="space-y-2">
                  {detail.projecao.map((r, i) => {
                    const max = Math.max(...detail.projecao.map(x => x.total));
                    const pct = max > 0 ? (r.total / max) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm text-gray-400 w-12 shrink-0">{fmtShort(r.data)}</span>
                        <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                          <div className="h-full rounded bg-blue-500/60 flex items-center px-2 transition-all" style={{ width: `${Math.max(pct, 8)}%` }}>
                            <span className="text-xs font-bold text-white whitespace-nowrap">{r.total}</span>
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

/* ─── Resp Drawer (fixed px — lido de perto) ─────────────────────────────── */
interface RespDetail {
  nome: string;
  kpis: { em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number; pontualidade: number };
  por_uf: { uf: string; em_movimento: number; atraso: number; entregas_dia: number; no_prazo: number; pontualidade: number }[];
  atrasados: { minuta: string; cliente: string; destino: string; uf: string; prev_entrega: string; servico: string; dias_atraso: number }[];
  projecao: { data: string; total: number }[];
}

function RespDetailDrawer({ nome, onClose }: { nome: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RespDetail | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    fetch(`/api/performance/responsavel?nome=${encodeURIComponent(nome)}`).then(r => r.json()).then(d => setDetail(d)).finally(() => setLoading(false));
  }, [nome]);
  const pont = detail?.kpis.pontualidade ?? 0;
  const pontColor  = pont >= 80 ? "#10b981" : pont >= 60 ? "#f59e0b" : "#ef4444";
  const accentColor = RESP_COLOR[nome] ?? "#f59e0b";
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full z-50 w-[480px] bg-[#0e0e1a] border-l border-white/10 shadow-2xl flex flex-col overflow-hidden" style={{ animation: "slideIn 0.22s cubic-bezier(.4,0,.2,1)" }}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg border flex items-center justify-center" style={{ background: `${accentColor}20`, borderColor: `${accentColor}40` }}>
              <Users className="w-5 h-5" style={{ color: accentColor }} />
            </div>
            <div>
              <div className="text-2xl font-bold tracking-widest" style={{ color: accentColor }}>{nome}</div>
              <div className="text-sm text-gray-400">SAC Responsável</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 border-b border-white/10 space-y-4">
            {loading
              ? <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-lg bg-white/5 animate-pulse" />)}</div>
              : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Em Movimento", val: detail?.kpis.em_movimento ?? 0, color: "#3b82f6" },
                      { label: "Em Atraso",    val: detail?.kpis.atraso ?? 0,       color: "#ef4444" },
                      { label: "Entregas Hoje",val: detail?.kpis.entregas_dia ?? 0, color: "#f59e0b" },
                      { label: "No Prazo",     val: detail?.kpis.no_prazo ?? 0,     color: "#10b981" },
                    ].map(s => (
                      <div key={s.label} className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 text-center">
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">{s.label}</div>
                        <div className="text-3xl font-bold tabular-nums" style={{ color: s.color }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400 uppercase tracking-wider flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" />Pontualidade</span>
                      <span className="text-xl font-bold" style={{ color: pontColor }}>{pont}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pont}%`, background: pontColor }} />
                    </div>
                  </div>
                </>
              )}
          </div>
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: accentColor }}>
              <MapPin className="w-4 h-4" />UFs — Breakdown
            </div>
            {loading
              ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-12 rounded bg-white/5 animate-pulse" />)}</div>
              : !detail?.por_uf.length
              ? <div className="text-center py-4 text-sm text-gray-500">Sem dados</div>
              : (
                <div className="space-y-2">
                  {detail.por_uf.map((row, i) => {
                    const ufPont = row.pontualidade;
                    const ufColor = ufPont >= 80 ? "#10b981" : ufPont >= 60 ? "#f59e0b" : "#ef4444";
                    return (
                      <div key={i} className="rounded-lg bg-white/5 border border-white/10 px-3 py-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-sm text-white">{row.uf}</span>
                            {row.atraso > 0 && <span className="text-xs font-semibold bg-red-500/15 text-red-400 border border-red-500/30 rounded px-1.5 py-0.5">{row.atraso} atraso</span>}
                            {row.entregas_dia > 0 && <span className="text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">{row.entregas_dia} hoje</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">{row.em_movimento} mov</span>
                            <span className="text-sm font-bold" style={{ color: ufColor }}>{ufPont}%</span>
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
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-400 uppercase tracking-widest mb-3">
              <AlertTriangle className="w-4 h-4" />CTes em Atraso
              {detail && <span className="ml-auto text-gray-400 normal-case font-normal">{detail.atrasados.length} registros</span>}
            </div>
            {loading
              ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-12 rounded bg-white/5 animate-pulse" />)}</div>
              : !detail?.atrasados.length
              ? <div className="text-center py-4 text-sm text-gray-500">Nenhum CTe em atraso</div>
              : (
                <div className="space-y-2">
                  {detail.atrasados.map((r, i) => (
                    <div key={i} className="rounded-lg bg-red-500/5 border border-red-500/20 px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-amber-400">{r.minuta}</span>
                        <Badge variant="outline" className="text-xs border-white/10 text-gray-400 px-1">{r.uf}</Badge>
                        <span className={`text-sm font-semibold ml-auto ${r.dias_atraso >= 3 ? "text-red-300 bg-red-500/20 px-2 py-0.5 rounded" : "text-red-400"}`}>{r.dias_atraso}d atraso</span>
                      </div>
                      <div className="text-sm text-gray-300 truncate">{r.cliente || "—"}</div>
                      <div className="text-xs text-gray-500 truncate">{r.destino} · Prev: {r.prev_entrega?.slice(0,10)}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
          <div className="px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-400 uppercase tracking-widest mb-3">
              <CalendarDays className="w-4 h-4" />Projeção — Próximos 5 dias
            </div>
            {loading
              ? <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-8 rounded bg-white/5 animate-pulse" />)}</div>
              : !detail?.projecao.length
              ? <div className="text-center py-4 text-sm text-gray-500">Sem entregas previstas</div>
              : (
                <div className="space-y-2">
                  {detail.projecao.map((r, i) => {
                    const max = Math.max(...detail.projecao.map(x => x.total));
                    const pct = max > 0 ? (r.total / max) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-sm text-gray-400 w-12 shrink-0">{fmtShort(r.data)}</span>
                        <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                          <div className="h-full rounded flex items-center px-2 transition-all" style={{ width: `${Math.max(pct, 8)}%`, background: `${accentColor}80` }}>
                            <span className="text-xs font-bold text-white whitespace-nowrap">{r.total}</span>
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

/* ─── Página TV ──────────────────────────────────────────────────────────── */
export default function TVPage() {
  const vw = useVW();

  const [kpis,      setKpis]      = useState<PerfKPIs | null>(null);
  const [porUf,     setPorUf]     = useState<UFRow[]>([]);
  const [proj,      setProj]      = useState<ProjRow[]>([]);
  const [resps,     setResps]     = useState<RespRow[]>([]);
  const [sacData,   setSacData]   = useState<SACRow[]>([]);
  const [lastSync,  setLastSync]  = useState("—");
  const [loading,   setLoading]   = useState(true);
  const [selectedUF,   setSelectedUF]   = useState<string | null>(null);
  const [selectedResp, setSelectedResp] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [perf, sync] = await Promise.all([
        fetch("/api/performance").then(r => r.json()),
        fetch("/api/sync-status").then(r => r.json()),
      ]);
      setKpis(perf.kpis);
      setPorUf(perf.por_uf ?? []);
      setProj(perf.projecao_7d ?? []);
      setResps(perf.responsaveis ?? []);
      setSacData(perf.sac_atendente ?? []);
      if (sync.last) {
        const d = new Date(sync.last);
        setLastSync(d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchData]);

  const iconSize = Math.round(vw * 0.9);

  return (
    <div
      className="w-screen h-screen bg-[#080810] text-white flex flex-col overflow-hidden"
      style={{ padding: vw * 1.3, gap: vw * 0.7 }}
    >
      {selectedResp && <RespDetailDrawer nome={selectedResp} onClose={() => setSelectedResp(null)} />}
      {selectedUF && !selectedResp && <UFDetailDrawer uf={selectedUF} onClose={() => setSelectedUF(null)} />}

      {/* ── Header ── */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <div className="font-bold tracking-widest text-amber-400" style={{ fontSize: vw * 2.6 }}>ARES · Performance Diária</div>
          <div className="text-gray-500 flex items-center" style={{ fontSize: vw * 0.85, marginTop: vw * 0.2, gap: vw * 0.4 }}>
            <RefreshCw style={{ width: vw * 0.9, height: vw * 0.9 }} />
            Último sync: {lastSync}
            {loading && <span className="text-amber-400 animate-pulse" style={{ marginLeft: vw * 0.5 }}>Carregando...</span>}
          </div>
        </div>
        <Clock vw={vw} />
      </div>

      {/* ── 8 KPIs ── */}
      <div className="grid grid-cols-8 shrink-0" style={{ gap: vw * 0.7 }}>
        <KpiCard title="Em Movimento"  value={kpis?.em_movimento  ?? 0} icon={<Truck         size={iconSize} />} color="#f59e0b" vw={vw} />
        <KpiCard title="Em Atraso"     value={kpis?.atraso        ?? 0} icon={<AlertTriangle size={iconSize} />} color="#ef4444" vw={vw} />
        <KpiCard title="Entregas Hoje" value={kpis?.entregas_dia  ?? 0} icon={<CalendarDays  size={iconSize} />} color="#3b82f6" vw={vw} />
        <KpiCard title="No Prazo"      value={kpis?.no_prazo      ?? 0} icon={<CheckCircle2  size={iconSize} />} color="#10b981" vw={vw} />
        <KpiCard title="Perecíveis"    value={kpis?.pereciveis    ?? 0} icon={<Thermometer   size={iconSize} />} color="#f97316" vw={vw} />
        <KpiCard title="Agendamentos"  value={kpis?.agendamentos  ?? 0} icon={<CalendarCheck size={iconSize} />} color="#06b6d4" vw={vw} />
        <KpiCard title="Prioridades"   value={kpis?.prioridades   ?? 0} icon={<Star          size={iconSize} />} color="#ec4899" vw={vw} />
        <KpiCard title="Devoluções"    value={kpis?.devolucoes    ?? 0} icon={<RotateCcw     size={iconSize} />} color="#8b5cf6" vw={vw} />
      </div>

      {/* ── Corpo ── */}
      <div
        className="flex-1 grid min-h-0"
        style={{ gridTemplateColumns: "20% 1fr 30%", gap: vw * 0.7 }}
      >
        {/* Coluna esquerda: Donut + SAC */}
        <div className="flex flex-col min-h-0" style={{ gap: vw * 0.7 }}>
          <div className="flex-[3] min-h-0">
            <PerformanceDonut kpis={kpis} vw={vw} />
          </div>
          <div className="flex-[2] min-h-0">
            <SACPizza data={sacData} vw={vw} />
          </div>
        </div>

        {/* Centro: Mapa */}
        <BrazilMapChart
          data={porUf.map(r => ({ uf: r.uf, total: r.em_movimento }))}
          loading={loading && !porUf.length}
          onSelect={uf => setSelectedUF(prev => prev === uf ? null : uf)}
          selectedUF={selectedUF}
        />

        {/* Coluna direita: Responsáveis + Projeção */}
        <div className="flex flex-col min-h-0" style={{ gap: vw * 0.7 }}>
          <div className="rounded-2xl border border-white/10 bg-white/5 flex flex-col flex-[3] min-h-0" style={{ padding: vw * 1 }}>
            <div className="font-semibold text-gray-400 uppercase tracking-widest shrink-0" style={{ fontSize: vw * 0.75, marginBottom: vw * 0.5 }}>Responsáveis</div>
            <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: vw * 0.5 }}>
              {resps.map(r => (
                <RespCard
                  key={r.nome}
                  data={r}
                  vw={vw}
                  selected={selectedResp === r.nome}
                  onSelect={() => setSelectedResp(prev => prev === r.nome ? null : r.nome)}
                />
              ))}
            </div>
          </div>
          <div className="flex-[2] min-h-0">
            <Projecao data={proj} vw={vw} />
          </div>
        </div>
      </div>
    </div>
  );
}

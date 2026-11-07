"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar,
  ComposedChart, Line, ReferenceLine, ReferenceDot, Customized, Label,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  DollarSign, Calendar, Clock, Package, Percent,
  Receipt, Truck, Trophy, Crown, Medal, Award, ChevronDown, Search, Check,
} from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { KpiCard, DonutChart } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";

const BrazilMapChart = dynamic(() => import("@/components/BrazilMapChart"), { ssr: false });

/* ─── Types ─────────────────────────────────────────────────────────────────── */
interface KPI {
  bruto: number; liquido: number; icms: number;
  frete_peso: number; ad_valorem: number; redespacho: number;
  exc_coleta: number; exc_entrega: number; total: number;
  delta_bruto?: number | null;
  delta_total?: number | null;
  ticket?: number;
}
interface KpisComercial {
  fat_dia_ant: number;
  fat_dia_ant_label: string;
  fat_dia: number;
  fat_dia_delta: number | null;
  fat_mes: number;
  fat_mes_delta: number | null;
  fat_mes_anterior: number;
  fat_medio_3m: number;
  fat_medio_3m_meses: string[];
  qtd_entregas_mes: number;
  qtd_entregas_mes_delta: number | null;
  valor_carga_mes: number;
}
interface FinData {
  kpis:         KpisComercial;
  periodo:      { mes: string; ano: string; max_date: string; is_closed?: boolean; meses_disponiveis?: string[] };
  hoje:         KPI & { delta_bruto: number | null };
  ontem:        KPI;
  mes_atual:    KPI & { delta_bruto: number | null; ticket: number };
  mes_anterior: KPI & { ticket: number };
  ano_atual:    KPI & { delta_bruto: number | null };
  ano_anterior: KPI;
  ticket:       { atual: number; anterior: number; delta: number | null };
  componentes:  { frete_peso: number; ad_valorem: number; redespacho: number; exc_coleta: number; exc_entrega: number; icms: number; bruto: number };
  timeline_mensal:  { mes: string; bruto: number; liquido: number; icms: number; receita: number; total: number }[];
  timeline_comparativo: { mes: string; receita: number }[];
  timeline_diaria:  { dia: string; bruto: number; liquido: number; total: number }[];
  por_uf:           { uf: string; bruto: number; liquido: number; total: number }[];
  por_servico:      { servico: string; bruto: number; liquido: number; total: number }[];
  por_modal:        { modal: string; qtd: number }[];
  top_clientes:     { cliente: string; bruto: number; total: number }[];
  grupos:           { id: string; label: string }[];
  clientes:         { id: string; label: string }[];
  cliente_ativo:    string | null;
  periodo_livre:    {
    de: string; ate: string;
    fat: number; fat_delta: number | null;
    qtd: number; qtd_delta: number | null;
    carga: number; ticket: number;
  } | null;
}

type Opcao = { id: string; label: string };

/* ─── Filtro de cliente com busca (grupos + todos os clientes do 106) ─────── */
function ClientePicker({ grupos, clientes, value, onChange }: {
  grupos: Opcao[]; clientes: Opcao[]; value: string; onChange: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const esc  = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    inputRef.current?.focus();
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const filtra = (l: Opcao[]) => busca ? l.filter(o => norm(o.label).includes(norm(busca))) : l;
  const g = filtra(grupos), c = filtra(clientes);
  const atual = [...grupos, ...clientes].find(o => o.id === value)?.label ?? "Todos os clientes";

  const escolher = (id: string) => { onChange(id); setAberto(false); setBusca(""); };
  const item = (o: Opcao) => (
    <li key={o.id}>
      <button
        type="button"
        onClick={() => escolher(o.id)}
        className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[12px] rounded-md transition-colors
          ${o.id === value ? "text-amber-400 bg-amber-500/10" : "text-ares-1 hover:bg-white/5"}`}
      >
        <span className="flex-1 truncate" title={o.label}>{o.label}</span>
        {o.id === value && <Check className="w-3.5 h-3.5 shrink-0" />}
      </button>
    </li>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setAberto(a => !a)}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-label={`Cliente: ${atual}`}
        className="flex items-center gap-2 max-w-[260px] text-[12px] bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-1 focus:outline-none focus:border-amber-500/60 transition-colors"
      >
        <span className="truncate">{atual}</span>
        <ChevronDown className="w-3.5 h-3.5 text-ares-4 shrink-0" />
      </button>
      {aberto && (
        <div className="absolute z-50 left-0 top-full mt-1 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-ares bg-ares-panel shadow-2xl p-2">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg bg-ares-surface border border-ares-input">
            <Search className="w-3.5 h-3.5 text-ares-4 shrink-0" />
            <input
              ref={inputRef}
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={`Buscar entre ${grupos.length + clientes.length} clientes`}
              className="flex-1 min-w-0 bg-transparent text-[12px] text-ares-1 placeholder:text-ares-4 focus:outline-none"
            />
          </div>
          <ul className="max-h-[320px] overflow-y-auto space-y-0.5" role="listbox">
            {!busca && item({ id: "", label: "Todos os clientes" })}
            {g.length > 0 && <li className="px-3 pt-2 pb-1 text-[9px] text-ares-4 uppercase tracking-widest">Grupos (filiais somadas)</li>}
            {g.map(item)}
            {c.length > 0 && <li className="px-3 pt-2 pb-1 text-[9px] text-ares-4 uppercase tracking-widest">Clientes</li>}
            {c.map(item)}
            {g.length + c.length === 0 && <li className="px-3 py-4 text-center text-[11px] text-ares-4">Nenhum cliente encontrado</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ─── Delta fill between two lines (green=above avg, red=below) ─────────────── */
const DeltaFill = (props: any) => {
  const xAxis = props.xAxisMap?.[0];
  const yAxis = props.yAxisMap?.[0];
  if (!xAxis?.scale || !yAxis?.scale) return null;
  const pts = (props.data ?? []).filter((d: any) => d.media_trim != null);
  if (pts.length < 2) return null;
  const xOf = (d: any): number => (xAxis.scale(d.mes) ?? 0) + (xAxis.bandSize ?? 0) / 2;
  const yOf = (v: number): number => yAxis.scale(v) ?? 0;
  type Seg = { above: boolean; pts: { x: number; yr: number; ym: number }[] };
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  for (let i = 0; i < pts.length; i++) {
    const d = pts[i];
    const x = xOf(d), yr = yOf(d.receita), ym = yOf(d.media_trim);
    const above = yr <= ym;
    if (i > 0) {
      const prev = pts[i - 1];
      const px = xOf(prev), pyr = yOf(prev.receita), pym = yOf(prev.media_trim);
      const prevAbove = pyr <= pym;
      if (prevAbove !== above) {
        const dx = x - px, dr = yr - pyr, dm = ym - pym;
        const denom = dr - dm;
        const t = Math.abs(denom) > 0.001 ? (pym - pyr) / denom : 0.5;
        const xi = px + t * dx, yi = pyr + t * dr;
        cur!.pts.push({ x: xi, yr: yi, ym: yi });
        segs.push(cur!);
        cur = { above, pts: [{ x: xi, yr: yi, ym: yi }] };
      }
    }
    if (!cur) cur = { above, pts: [] };
    cur.pts.push({ x, yr, ym });
  }
  if (cur) segs.push(cur);
  return (
    <g>
      {segs.map((seg, i) => {
        if (seg.pts.length < 2) return null;
        const top = seg.pts.map(p => `${p.x},${p.yr}`).join(" L ");
        const bot = [...seg.pts].reverse().map(p => `${p.x},${p.ym}`).join(" L ");
        return <path key={i} d={`M ${top} L ${bot} Z`}
          fill={seg.above ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)"} />;
      })}
    </g>
  );
};

/* ─── Formatters ────────────────────────────────────────────────────────────── */
const BRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const BRLShort = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `R$ ${(v / 1_000).toFixed(0)}K`;
  return BRL(v);
};

const fmtDelta = (d: number | null | undefined): string => {
  if (d == null) return "";
  return `${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)}%`;
};

const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const mesLabel = (mes: string) => {
  const [y, m] = mes.split("-");
  return `${MONTHS[parseInt(m) - 1]}/${y.slice(2)}`;
};

const mesLabelFull = (mes: string) => {
  const [y, m] = mes.split("-");
  return `${MONTHS[parseInt(m) - 1]} ${y}`;
};

const isoBR = (iso: string) => iso.split("-").reverse().join("/");
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000) + 1;

// Delta contra os N dias imediatamente anteriores ao período (mesma duração).
const vsAnterior = (d: number | null, de: string, ate: string) =>
  d == null ? "Sem dados antes do período para comparar" : `${fmtDelta(d)} vs ${diasEntre(de, ate)} dias anteriores`;

const diaLabel = (dia: string) =>
  String(new Date(dia + "T00:00:00").getDate()).padStart(2, "0");

/* ─── Revenue Component Bar ─────────────────────────────────────────────────── */
function ComponenteBar({ label, value, total, color }: {
  label: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-ares-3">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-ares-4 text-[10px]">{pct.toFixed(1)}%</span>
          <span className="text-ares-2 font-semibold tabular-nums">{BRLShort(value)}</span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-white/10">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

/* ─── Clientes Leaderboard (gamificação) ───────────────────────────────────── */
function getInitials(name: string): string {
  const clean = name.replace(/\s+(LTDA|S\.?A\.?|EIRELI|ME|EPP|COMERCIO|COMÉRCIO|INDUSTR.*|DISTRIBU.*|TRANSPORTES?)\s*.*/i, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Hash do nome → cor estável (paleta de 8 cores vibrantes)
function avatarColor(name: string): string {
  const palette = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

const PODIUM_STYLE: Record<number, { ring: string; bg: string; medal: string; icon: React.ReactNode; label: string }> = {
  1: {
    ring: "ring-2 ring-yellow-400/60",
    bg: "bg-gradient-to-r from-yellow-500/15 via-amber-500/10 to-transparent",
    medal: "text-yellow-400",
    icon: <Crown className="w-4 h-4" />,
    label: "OURO",
  },
  2: {
    ring: "ring-2 ring-slate-300/50",
    bg: "bg-gradient-to-r from-slate-400/15 via-slate-400/8 to-transparent",
    medal: "text-ares-3",
    icon: <Trophy className="w-4 h-4" />,
    label: "PRATA",
  },
  3: {
    ring: "ring-2 ring-orange-500/50",
    bg: "bg-gradient-to-r from-orange-600/15 via-orange-600/8 to-transparent",
    medal: "text-orange-400",
    icon: <Medal className="w-4 h-4" />,
    label: "BRONZE",
  },
};

function ClientesLeaderboard({
  data, loading, fmt, totalFaturamento, titulo,
}: {
  titulo?: string;
  data: { cliente: string; bruto: number }[];
  loading: boolean;
  fmt: (v: number) => string;
  totalFaturamento: number;   // faturamento geral do mês (kpis.fat_mes) — denominador do % de participação
}) {
  const top10 = data.slice(0, 10);
  const max = top10[0]?.bruto ?? 1;
  const fmtShare = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-ares-4 uppercase tracking-widest flex items-center gap-2">
          <Award className="w-3.5 h-3.5 text-violet-400" />
          {titulo ?? "Top 10 Clientes — Ranking do Mês"}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 pb-4 pt-3 flex-1">
        {loading ? (
          <Skeleton className="h-64 w-full bg-white/5" />
        ) : top10.length === 0 ? (
          <div className="text-center text-xs text-ares-4 py-8">Sem dados</div>
        ) : (
          <ol className="space-y-1.5">
            {top10.map((d, i) => {
              const rank = i + 1;
              const pct = max > 0 ? (d.bruto / max) * 100 : 0;
              const share = totalFaturamento > 0 ? (d.bruto / totalFaturamento) * 100 : 0;
              const podium = PODIUM_STYLE[rank];
              const isPodium = rank <= 3;
              const color = avatarColor(d.cliente);

              return (
                <li
                  key={d.cliente + i}
                  className={`relative flex items-center gap-3 rounded-lg px-2.5 py-2 transition
                    ${isPodium ? podium.bg : "hover:bg-white/5"}`}
                >
                  {/* Rank / Medalha */}
                  <div className="w-9 flex flex-col items-center justify-center shrink-0">
                    {isPodium ? (
                      <div className={`flex flex-col items-center ${podium.medal}`}>
                        {podium.icon}
                        <span className="text-[9px] font-bold mt-0.5 tracking-wider">{podium.label}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-base font-bold text-ares-4 tabular-nums">
                        #{rank}
                      </span>
                    )}
                  </div>

                  {/* Avatar com iniciais */}
                  <div
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0
                      ${isPodium ? podium.ring : ""}`}
                    style={{ background: color }}
                  >
                    {getInitials(d.cliente)}
                  </div>

                  {/* Nome + barra de progresso */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <span className="text-[12px] font-semibold text-ares-1 truncate" title={d.cliente}>
                        {d.cliente}
                      </span>
                      <span className="text-[12px] font-bold text-ares-1 tabular-nums shrink-0">
                        {fmt(d.bruto)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          background: isPodium
                            ? `linear-gradient(to right, ${color}, ${color}cc)`
                            : color,
                          opacity: isPodium ? 1 : 0.7,
                        }}
                      />
                    </div>
                  </div>

                  {/* Participação no faturamento geral (novo) + referência ao líder */}
                  <div className="shrink-0 w-20 text-right leading-tight">
                    <div className="text-[11px] font-bold text-violet-300 tabular-nums" title="Participação no faturamento do mês">
                      {fmtShare(share)}% do total
                    </div>
                    <div className="text-[9px] tabular-nums mt-0.5">
                      {rank === 1 ? (
                        <span className="font-bold text-yellow-400">LÍDER</span>
                      ) : (
                        <span className="text-ares-4">{pct.toFixed(0)}% do #1</span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Page ──────────────────────────────────────────────────────────────────── */
export default function ComercialPage() {
  const [data, setData] = useState<FinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clienteId, setClienteId] = useState("");
  const [mesSel, setMesSel] = useState("");   // "" = mês atual (ao vivo); "YYYY-MM" = mês fechado
  // Período livre aplicado ({de, ate} em YYYY-MM-DD) e o rascunho dos campos De/Até.
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const [deRasc, setDeRasc]   = useState("");
  const [ateRasc, setAteRasc] = useState("");
  const { theme } = useTheme();

  const grid      = theme === "dark" ? "#3f3f46" : "#e2e8f0";
  const tooltipBg = theme === "dark" ? "#27272a" : "#ffffff";
  const tooltipBd = theme === "dark" ? "#3f3f46" : "#e2e8f0";
  const tick      = theme === "dark" ? "#a1a1aa" : "#64748b";
  const ttStyle   = { background: tooltipBg, border: `1px solid ${tooltipBd}`, borderRadius: 8, fontSize: 12, fontFamily: "inherit" };

  const load = async (cliente = "", mes = "", per: { de: string; ate: string } | null = null) => {
    setRefreshing(true);
    try {
      const qs = new URLSearchParams();
      if (cliente) qs.set("cliente", cliente);
      if (mes)     qs.set("mes", mes);
      if (per)     { qs.set("de", per.de); qs.set("ate", per.ate); }
      const url = `/api/comercial${qs.toString() ? `?${qs}` : ""}`;
      const r = await fetch(url);
      setData(await r.json());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(clienteId, mesSel, periodo); }, [clienteId, mesSel, periodo]);

  const aplicarPeriodo = () => {
    if (!deRasc || !ateRasc) return;
    setPeriodo(deRasc <= ateRasc ? { de: deRasc, ate: ateRasc } : { de: ateRasc, ate: deRasc });
  };
  const limparPeriodo = () => { setPeriodo(null); setDeRasc(""); setAteRasc(""); };

  const pl = data?.periodo_livre ?? null;
  const periodoTxt = pl ? `${isoBR(pl.de)} a ${isoBR(pl.ate)}` : "";
  // Query string do cliente para os botões de exportar (nome pode ter espaço/acentos).
  const clienteQS = clienteId ? `cliente=${encodeURIComponent(clienteId)}` : "";
  const opcoesClientes = useMemo(() => ({ grupos: data?.grupos ?? [], clientes: data?.clientes ?? [] }), [data?.grupos, data?.clientes]);

  // Revenue components for breakdown
  const compTotal = data ? (
    data.componentes.frete_peso +
    data.componentes.ad_valorem +
    data.componentes.redespacho +
    data.componentes.exc_coleta +
    data.componentes.exc_entrega
  ) : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title="Comercial — Rel. 106"
        onRefresh={() => load(clienteId, mesSel, periodo)}
        refreshing={refreshing}
        lastSync={data ? new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : ""}
      >
        {data?.periodo && (
          <span className="hidden md:inline text-[11px] text-ares-4 bg-ares-surface border border-ares-input rounded px-2 py-1">
            Ref.: {mesLabelFull(data.periodo.mes)}
          </span>
        )}
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Filtros: mês + cliente ───────────────────────────────────────── */}
        {data?.periodo && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Seletor de mês (últimos 6). 1º item = mês atual (ao vivo). */}
            {(data.periodo.meses_disponiveis?.length ?? 0) > 0 && (
              <>
                <span className="text-[10px] text-ares-4 uppercase tracking-wider shrink-0">Mês:</span>
                <select
                  value={mesSel}
                  onChange={e => setMesSel(e.target.value)}
                  className="text-[12px] bg-ares-surface border border-ares-input rounded-lg px-3 py-1.5 text-ares-1 focus:outline-none focus:border-amber-500/60 transition-colors cursor-pointer"
                >
                  {data.periodo.meses_disponiveis!.map((m, i) => (
                    <option key={m} value={i === 0 ? "" : m}>
                      {mesLabelFull(m)}{i === 0 ? " (atual)" : ""}
                    </option>
                  ))}
                </select>
                {data.periodo.is_closed && (
                  <button
                    onClick={() => setMesSel("")}
                    className="text-[11px] text-ares-4 hover:text-amber-400 transition-colors"
                  >
                    ↩ Voltar ao mês atual
                  </button>
                )}
              </>
            )}

            {/* Filtro por cliente */}
            {data?.grupos && data.grupos.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-ares-4 uppercase tracking-wider shrink-0 sm:ml-2">Cliente:</span>
                <ClientePicker
                  grupos={opcoesClientes.grupos}
                  clientes={opcoesClientes.clientes}
                  value={clienteId}
                  onChange={setClienteId}
                />
                {clienteId && (
                  <button
                    onClick={() => setClienteId("")}
                    className="text-[11px] text-ares-4 hover:text-amber-400 transition-colors"
                  >
                    ✕ Limpar
                  </button>
                )}
              </div>
            )}

            {/* Período livre: vale para totais, rankings, mapa, modal, composição e evolução */}
            <form
              onSubmit={e => { e.preventDefault(); aplicarPeriodo(); }}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-[10px] text-ares-4 uppercase tracking-wider shrink-0 sm:ml-2">Período:</span>
              <label className="flex items-center gap-1.5 text-[11px] text-ares-4">
                De
                <input
                  type="date"
                  value={deRasc}
                  min="2026-01-01"
                  max={data.periodo.max_date}
                  onChange={e => setDeRasc(e.target.value)}
                  className="text-[12px] bg-ares-surface border border-ares-input rounded-lg px-2 py-1 text-ares-1 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-ares-4">
                Até
                <input
                  type="date"
                  value={ateRasc}
                  min="2026-01-01"
                  max={data.periodo.max_date}
                  onChange={e => setAteRasc(e.target.value)}
                  className="text-[12px] bg-ares-surface border border-ares-input rounded-lg px-2 py-1 text-ares-1 focus:outline-none focus:border-amber-500/60 transition-colors"
                />
              </label>
              <button
                type="submit"
                disabled={!deRasc || !ateRasc}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Aplicar
              </button>
              {periodo && (
                <button
                  type="button"
                  onClick={limparPeriodo}
                  className="text-[11px] text-ares-4 hover:text-amber-400 transition-colors"
                >
                  ✕ Limpar período
                </button>
              )}
            </form>
          </div>
        )}

        {/* ── Totais do período livre ─────────────────────────────────────── */}
        {pl && (
          <div className="space-y-2">
            <div className="text-[10px] text-ares-4 uppercase tracking-widest">
              Período selecionado · {periodoTxt}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                title="Faturamento no Período"
                value={loading ? "—" : BRL(pl.fat)}
                icon={<Calendar className="w-5 h-5" />}
                color="#3b82f6"
                sub={loading ? "" : vsAnterior(pl.fat_delta, pl.de, pl.ate)}
                loading={loading}
                exportId="periodo"
                exportLabel={`Todas as notas emitidas de ${periodoTxt} + total — pra reconciliar contra o relatório 106 do Brudam.`}
                exportParams={[clienteQS, `de=${pl.de}`, `ate=${pl.ate}`].filter(Boolean).join("&")}
              />
              <KpiCard
                title="Entregas no Período"
                value={loading ? "—" : pl.qtd.toLocaleString("pt-BR")}
                icon={<Truck className="w-5 h-5" />}
                color="#ef4444"
                sub={loading ? "" : `${vsAnterior(pl.qtd_delta, pl.de, pl.ate)} · ticket médio ${BRL(pl.ticket)}`}
                loading={loading}
              />
              <KpiCard
                title="Carga Movimentada no Período"
                value={loading ? "—" : BRL(pl.carga)}
                icon={<Package className="w-5 h-5" />}
                color="#a855f7"
                sub={loading ? "" : "Valor total NF das cargas"}
                loading={loading}
              />
              <KpiCard
                title="% Frete no Período"
                value={loading ? "—" : (pl.carga > 0 ? `${(pl.fat / pl.carga * 100).toFixed(2)}%` : "—")}
                icon={<Percent className="w-5 h-5" />}
                color="#14b8a6"
                sub={loading ? "" : "Faturamento ÷ Valor de Carga"}
                loading={loading}
              />
            </div>
          </div>
        )}

        {/* ── KPIs ────────────────────────────────────────────────────────── */}
        {(() => {
          const k = data?.kpis;
          const INT = (v: number) => new Intl.NumberFormat("pt-BR").format(v);
          const isClosed = data?.periodo?.is_closed ?? false;
          // Mês de referência (âncora) vem da API: ao vivo = mês atual; fechado = mês escolhido.
          // Os labels derivam DELE, não de new Date(), pra refletirem o mês selecionado.
          const [ay, am] = (data?.periodo?.mes ?? "").split("-").map(Number);
          const refDate = ay && am ? new Date(ay, am - 1, 1) : new Date();
          const mesLabelHoje = `${MONTHS[refDate.getMonth()]}/${String(refDate.getFullYear()).slice(2)}`;
          const mesAnt = new Date(refDate.getFullYear(), refDate.getMonth() - 1, 1);
          const mesLabelAnterior = `${MONTHS[mesAnt.getMonth()]}/${String(mesAnt.getFullYear()).slice(2)}`;
          const janelaSub = isClosed
            ? `vs ${mesLabelAnterior} — mês completo`
            : `vs ${mesLabelAnterior} (1–${new Date().getDate()})`;
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Fileira 1 — faturamento diário (só no modo AO VIVO) e mensal */}
              {!isClosed && (
                <KpiCard
                  title={<>
                    <span className="sm:hidden">Fat. Ontem{k?.fat_dia_ant_label ? ` — ${k.fat_dia_ant_label}` : ""}</span>
                    <span className="hidden sm:inline">Faturamento Ontem{k?.fat_dia_ant_label ? ` — ${k.fat_dia_ant_label}` : ""}</span>
                  </>}
                  value={loading ? "—" : BRL(k?.fat_dia_ant ?? 0)}
                  icon={<Clock className="w-5 h-5" />}
                  color="#8b5cf6"
                  sub={loading ? "" : "Último dia anterior com dados"}
                  loading={loading}
                  exportId="fat-dia-ant"
                  exportLabel="Todas as notas do penúltimo dia com dados + total — pra reconciliar contra o relatório 106 do Brudam."
                  exportParams={clienteQS || undefined}
                />
              )}
              {!isClosed && (
                <KpiCard
                  title="Faturamento Hoje"
                  value={loading ? "—" : BRL(k?.fat_dia ?? 0)}
                  icon={<DollarSign className="w-5 h-5" />}
                  color="#10b981"
                  sub={loading ? "" : `${fmtDelta(k?.fat_dia_delta)} vs dia anterior`}
                  loading={loading}
                  exportId="fat-dia"
                  exportLabel="Todas as notas emitidas hoje + total — pra reconciliar contra o relatório 106 do Brudam."
                  exportParams={clienteQS || undefined}
                />
              )}
              <KpiCard
                title={`Faturamento ${mesLabelHoje}`}
                value={loading ? "—" : BRL(k?.fat_mes ?? 0)}
                icon={<Calendar className="w-5 h-5" />}
                color="#3b82f6"
                sub={loading ? "" : `${fmtDelta(k?.fat_mes_delta)} ${janelaSub}`}
                loading={loading}
                exportId="fat-mes"
                exportLabel={`Todas as notas emitidas em ${mesLabelHoje}${isClosed ? " (mês completo)" : " (1 até hoje)"} + total — pra reconciliar contra o relatório 106 do Brudam.`}
                exportParams={[clienteQS, mesSel && `mes=${mesSel}`].filter(Boolean).join("&") || undefined}
              />
              {/* Fileira 2 — volume, mês anterior e média */}
              <KpiCard
                title={`Entregas ${mesLabelHoje}`}
                value={loading ? "—" : INT(k?.qtd_entregas_mes ?? 0)}
                icon={<Truck className="w-5 h-5" />}
                color="#ef4444"
                sub={loading ? "" : `${fmtDelta(k?.qtd_entregas_mes_delta)} ${janelaSub}`}
                loading={loading}
              />
              <KpiCard
                title={`Faturamento ${mesLabelAnterior}`}
                value={loading ? "—" : BRL(k?.fat_mes_anterior ?? 0)}
                icon={<Calendar className="w-5 h-5" />}
                color="#06b6d4"
                sub={loading ? "" : `${mesLabelAnterior} — mês completo`}
                loading={loading}
              />
              <KpiCard
                title="Fat. Médio — Últ. 3 Meses"
                value={loading ? "—" : BRL(k?.fat_medio_3m ?? 0)}
                icon={<Receipt className="w-5 h-5" />}
                color="#f59e0b"
                sub={loading ? "" : (k?.fat_medio_3m_meses?.length
                  ? `Média: ${k.fat_medio_3m_meses.map(m => mesLabel(m)).join(", ")}`
                  : "Sem histórico"
                )}
                loading={loading}
              />
              {/* Fileira 3 — valor de carga + % frete */}
              <KpiCard
                title={`Carga Movimentada ${mesLabelHoje}`}
                value={loading ? "—" : BRL(k?.valor_carga_mes ?? 0)}
                icon={<Package className="w-5 h-5" />}
                color="#a855f7"
                sub={loading ? "" : `Valor total NF das cargas do mês`}
                loading={loading}
              />
              <KpiCard
                title={`% Frete ${mesLabelHoje}`}
                value={loading ? "—" : (
                  (k?.valor_carga_mes ?? 0) > 0
                    ? `${((k?.fat_mes ?? 0) / (k?.valor_carga_mes ?? 1) * 100).toFixed(2)}%`
                    : "—"
                )}
                icon={<Percent className="w-5 h-5" />}
                color="#14b8a6"
                sub={loading ? "" : `Faturamento ÷ Valor de Carga`}
                loading={loading}
              />
            </div>
          );
        })()}

        {/* ── Charts Row 1 ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Receita do Trimestre vs Média Trimestral Anterior */}
          <Card className="panel border-0 lg:col-span-2">
            <CardHeader className="pb-0 pt-5 px-5">
              <CardTitle className="text-xs font-semibold text-ares-4 uppercase tracking-widest">
                Receita do Trimestre Atual vs Média do Trimestre Anterior
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-2 pt-3">
              {loading ? <Skeleton className="h-48 w-full bg-white/5" /> : (() => {
                const tm = data?.timeline_comparativo ?? [];
                const _hojeChart = new Date();
                const mesAtualStr = `${_hojeChart.getFullYear()}-${String(_hojeChart.getMonth() + 1).padStart(2, "0")}`;
                // Mostra apenas os 3 meses do trimestre atual
                const _cutoff = new Date(_hojeChart.getFullYear(), _hojeChart.getMonth() - 2, 1);
                const VISIBLE_FROM = `${_cutoff.getFullYear()}-${String(_cutoff.getMonth() + 1).padStart(2, "0")}`;
                const chartData = tm
                  .map((row, i, arr) => ({
                    mes: row.mes,
                    receita: row.receita,
                    media_trim: i >= 3
                      ? (tm[i - 3].receita + tm[i - 2].receita + tm[i - 1].receita) / 3
                      : null,
                    receita_completo: row.mes < mesAtualStr ? row.receita : null,
                    receita_parcial: row.mes >= (arr[Math.max(0, arr.length - 2)]?.mes ?? mesAtualStr) ? row.receita : null,
                  }))
                  .filter(d => d.mes >= VISIBLE_FROM);
                const last = chartData[chartData.length - 1];
                return (
                  <div>
                    <ResponsiveContainer width="100%" height={175}>
                      <ComposedChart data={chartData} margin={{ top: 16, right: 48, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="gradReceitaMes" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.15} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                        <XAxis dataKey="mes" tickFormatter={mesLabel} tick={{ fontSize: 11, fill: tick }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={BRLShort} tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} width={72} />
                        <Tooltip
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const receitaEntry = payload.find(p => p.name === "receita_completo" || p.name === "receita_parcial");
                            const mediaEntry   = payload.find(p => p.name === "media_trim");
                            return (
                              <div style={ttStyle} className="px-3 py-2 space-y-1">
                                <p className="text-xs text-ares-4 mb-1">{mesLabelFull(String(label))}</p>
                                {receitaEntry && <p className="text-xs text-blue-400">Receita do mês: <span className="font-semibold">{BRL(Number(receitaEntry.value))}</span></p>}
                                {mediaEntry   && <p className="text-xs text-emerald-400">Média trim. anterior: <span className="font-semibold">{BRL(Number(mediaEntry.value))}</span></p>}
                              </div>
                            );
                          }}
                        />
                        <Area type="monotone" dataKey="receita" stroke="none" fill="url(#gradReceitaMes)" legendType="none" dot={false} activeDot={false} />
                        <Customized component={DeltaFill} />
                        <Line type="monotone" dataKey="receita_completo" stroke="#3b82f6" strokeWidth={2.5} dot={false} connectNulls legendType="none" name="receita_completo" />
                        <Line type="monotone" dataKey="receita_parcial" stroke="#3b82f6" strokeWidth={2.5} strokeDasharray="6 4" dot={false} connectNulls legendType="none" name="receita_parcial" />
                        <Line type="monotone" dataKey="media_trim" stroke="#10b981" strokeWidth={2} strokeDasharray="4 3" dot={false} connectNulls={false} name="media_trim" legendType="none" />
                        <ReferenceLine x={mesAtualStr} stroke="#475569" strokeDasharray="2 3" />
                        {last && (
                          <ReferenceDot x={last.mes} y={last.receita} r={4} fill="#3b82f6" stroke="white" strokeWidth={1.5}>
                            <Label value={BRLShort(last.receita)} position="right" fontSize={11} fill="#60a5fa" fontWeight={600} offset={8} />
                          </ReferenceDot>
                        )}
                        {last?.media_trim != null && (
                          <ReferenceDot x={last.mes} y={last.media_trim} r={4} fill="#10b981" stroke="white" strokeWidth={1.5}>
                            <Label value={BRLShort(last.media_trim)} position="right" fontSize={11} fill="#34d399" fontWeight={600} offset={8} />
                          </ReferenceDot>
                        )}
                      </ComposedChart>
                    </ResponsiveContainer>
                    {/* Legenda manual */}
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 mt-2 text-[11px] text-ares-4">
                      <span className="flex items-center gap-1.5">
                        <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#3b82f6" strokeWidth="2.5"/></svg>
                        Receita do mês
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#3b82f6" strokeWidth="2.5" strokeDasharray="6 4"/></svg>
                        Mês em curso
                      </span>
                      <span className="flex items-center gap-1.5">
                        <svg width="24" height="10"><line x1="0" y1="5" x2="24" y2="5" stroke="#10b981" strokeWidth="2" strokeDasharray="4 3"/></svg>
                        Média trim. anterior
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(16,185,129,0.35)" }} />
                        Acima da média
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "rgba(239,68,68,0.35)" }} />
                        Abaixo da média
                      </span>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Por modal de transferência — fonte: coluna MODAL (K) do relatório 106.
              Métrica: COUNT de notas (não receita) — distribuição operacional.
              Consolida em 2 fatias:
                Rodoviário  = MODAL Rodoviario
                Aéreo       = MODAL Multimodal + Aereo (ambos têm trecho aéreo). */}
          <DonutChart
            data={(() => {
              const buckets = { "Rodoviário": 0, "Aéreo": 0 };
              for (const d of data?.por_modal ?? []) {
                const m = (d.modal || "").toLowerCase();
                if (m === "rodoviario") buckets["Rodoviário"] += d.qtd;
                else if (m === "multimodal" || m === "aereo") buckets["Aéreo"] += d.qtd;
              }
              return Object.entries(buckets)
                .filter(([, v]) => v > 0)
                .map(([name, value]) => ({ name, value }));
            })()}
            nameKey="name"
            valueKey="value"
            label={`Qtd Entregas por Modal de Transferência${pl ? ` — ${periodoTxt}` : ""}`}
            loading={loading}
            totalFormatter={(n) => n.toLocaleString("pt-BR")}
            totalLabel="Total de entregas"
          />
        </div>

        {/* ── Row 2: Rankings (mapa + clientes) ────────────────────────────── */}
        <div className={`grid grid-cols-1 gap-3 ${!clienteId ? "lg:grid-cols-2" : ""}`}>
          <BrazilMapChart
            data={(data?.por_uf ?? []).map(d => ({ uf: d.uf, total: d.bruto }))}
            loading={loading}
            title={`Receita por UF Destino — ${pl ? periodoTxt : data?.periodo?.is_closed ? mesLabelFull(data.periodo.mes) : "Mês Atual"}`}
            valueLabel="em receita"
            valueFormatter={BRLShort}
          />
          {!clienteId && (
            <ClientesLeaderboard
              data={data?.top_clientes ?? []}
              loading={loading}
              fmt={BRL}
              totalFaturamento={pl ? pl.fat : (data?.kpis?.fat_mes ?? 0)}
              titulo={pl ? `Top 10 Clientes — ${periodoTxt}` : undefined}
            />
          )}
        </div>

        {/* ── Row 3: Receita Bruta × Líquida + Composição ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

          {/* Evolução mensal */}
          <Card className="panel border-0 lg:col-span-2">
            <CardHeader className="pb-0 pt-5 px-5">
              <CardTitle className="text-xs font-semibold text-ares-4 uppercase tracking-widest">
                Receita Bruta × Líquida — {pl ? periodoTxt : "Por Mês"}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-5 pt-3">
              {loading ? <Skeleton className="h-52 w-full bg-white/5" /> : (
                <ResponsiveContainer width="100%" height={215}>
                  <BarChart data={data?.timeline_mensal ?? []} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={grid} vertical={false} />
                    <XAxis dataKey="mes" tickFormatter={mesLabel} tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={BRLShort} tick={{ fontSize: 10, fill: tick }} axisLine={false} tickLine={false} width={72} />
                    <Tooltip
                      formatter={(v, name) => [BRL(Number(v)), name === "bruto" ? "Bruto" : name === "liquido" ? "Líquido" : "ICMS"]}
                      labelFormatter={(l) => mesLabel(l)}
                      contentStyle={ttStyle}
                      cursor={{ fill: "#ffffff04" }}
                    />
                    <Legend formatter={(v) => v === "bruto" ? "Bruto" : v === "liquido" ? "Líquido" : "ICMS"}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="bruto"   fill="#3b82f6" radius={[3,3,0,0]} maxBarSize={28} fillOpacity={0.85} />
                    <Bar dataKey="liquido" fill="#10b981" radius={[3,3,0,0]} maxBarSize={28} fillOpacity={0.85} />
                    <Bar dataKey="icms"    fill="#ef4444" radius={[3,3,0,0]} maxBarSize={28} fillOpacity={0.6}  />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Breakdown de componentes */}
          <Card className="panel border-0">
            <CardHeader className="pb-0 pt-5 px-5">
              <CardTitle className="text-xs font-semibold text-ares-4 uppercase tracking-widest flex items-center gap-2">
                <Truck className="w-3.5 h-3.5 text-blue-400" />
                Composição da Receita
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-5 pt-3 space-y-3">
              {loading ? <Skeleton className="h-44 w-full bg-white/5" /> : (
                <>
                  <div className="text-[10px] text-ares-4 uppercase tracking-widest mb-2">{pl ? periodoTxt : "Mês atual"}</div>
                  <ComponenteBar label="Frete Peso"   value={data?.componentes.frete_peso  ?? 0} total={compTotal} color="#3b82f6" />
                  <ComponenteBar label="Ad Valorem"   value={data?.componentes.ad_valorem  ?? 0} total={compTotal} color="#f59e0b" />
                  <ComponenteBar label="Redespacho"   value={data?.componentes.redespacho  ?? 0} total={compTotal} color="#8b5cf6" />
                  <ComponenteBar label="Exc. Coleta"  value={data?.componentes.exc_coleta  ?? 0} total={compTotal} color="#06b6d4" />
                  <ComponenteBar label="Exc. Entrega" value={data?.componentes.exc_entrega ?? 0} total={compTotal} color="#ec4899" />
                  <div className="pt-2 border-t border-ares">
                    <ComponenteBar label="ICMS (custo)" value={data?.componentes.icms ?? 0} total={(pl ? data?.componentes.bruto : data?.mes_atual.bruto) ?? 0} color="#ef4444" />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}

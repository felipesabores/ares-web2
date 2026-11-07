"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, TrendingDown, Weight, Package, Percent, Download } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import dynamic from "next/dynamic";
import { PageHeader } from "@/components/PageHeader";

const BrazilMapChart = dynamic(() => import("@/components/BrazilMapChart"), { ssr: false });
const DistribuicaoGeografica = dynamic(() => import("@/components/DistribuicaoGeografica"), { ssr: false });

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Totais {
  faturamento: number; resultado: number; peso: number; valor_nf: number; total: number; ctes_negativos: number; ctes_margem_baixa: number;
}
interface UFRow {
  uf: string; faturamento: number; resultado: number; peso: number; valor_nf: number; total: number;
}
interface EvolucaoRow { mes: string; faturamento: number; resultado: number }
interface TabelaRow {
  tabela_total: number;
  data: string; minuta: string; cte: string; cliente: string; destino: string;
  servico: string; tipo_cte: string; peso: number; frete: number;
  resultado: number; valor_nf: number; margem: string; tabela_comercial: string | null;
}
interface ClienteRow  { cliente: string;  resultado: number; faturamento: number; total: number }
interface NegativoRow { cliente: string; ctes_negativos: number; resultado: number; total: number }
interface DistMargemRow { faixa: string; total: number; resultado: number; faturamento: number }
interface CustosBreakdown { custo_entrega: number; custo_transf: number; custo_coleta: number; custo_outros: number }
interface PorTabelaRow { tabela: string; total: number; faturamento: number; resultado: number; prejuizo: number }
interface ApiData {
  periodo:      { start: string; end: string; max_mes: string; min_mes: string };
  totais:       Totais;
  por_uf:       UFRow[];
  evolucao:     EvolucaoRow[];
  clientes:     string[];
  tabela:       TabelaRow[];
  tabela_total: number;
  tabela_page:  number;
  tabela_size:  number;
  sort_by:      string;
  sort_dir:     string;
  por_cliente:  ClienteRow[];
  dist_margem:  DistMargemRow[];
  custos:       CustosBreakdown;
  top_negativos: NegativoRow[];
  por_tabela:   PorTabelaRow[];
  tabelas_comerciais: string[];
  resultado_filter: string;
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */
function brl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
function fmtPeso(kg: number) {
  return `${kg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} kg`;
}
function fmtMes(mes: string) {
  if (!mes) return "";
  const [y, m] = mes.split("-");
  const names = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${names[parseInt(m) - 1]}/${y}`;
}

/* ─── Custom Tooltip ────────────────────────────────────────────────────── */
function EvolucaoTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl shadow-2xl px-4 py-3 text-sm"
      style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)", minWidth: 180 }}>
      <div className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-2">
        {fmtMes(label ?? "")}
      </div>
      {payload.map((p) => {
        const isResultado = p.name === "Resultado";
        const color = isResultado ? (p.value >= 0 ? "#a78bfa" : "#ef4444") : "#38bdf8";
        return (
          <div key={p.name} className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-white/60 text-xs">{p.name}</span>
            </div>
            <span className="font-semibold tabular-nums" style={{ color }}>{brl(p.value)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── KPI Card ───────────────────────────────────────────────────────────── */
function KpiCard({
  title, value, icon: Icon, loading, color = "text-amber-400",
  exportHref, exportLabel,
}: {
  title: string; value: string; icon: React.ElementType; loading: boolean; color?: string;
  exportHref?: string; exportLabel?: string;
}) {
  const ACCENT: Record<string, string> = {
    "text-amber-400": "#fbbf24", "text-emerald-400": "#34d399", "text-red-400": "#f87171",
    "text-orange-400": "#fb923c", "text-sky-400": "#38bdf8", "text-violet-400": "#a78bfa",
  };
  const accent = ACCENT[color] ?? "#fbbf24";
  return (
    <Card className="bg-ares-panel border-ares relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] z-10"
        style={{ background: `linear-gradient(90deg, ${accent}cc, ${accent}44, transparent)` }} />
      <CardHeader className="flex flex-row items-center justify-between pb-1.5 pt-3 px-3 md:pb-2 md:pt-4 md:px-4">
        <CardTitle className="text-[10px] md:text-[11px] text-ares-3 uppercase tracking-widest font-semibold pr-1 leading-tight">{title}</CardTitle>
        <div className="flex items-center gap-1 shrink-0">
          {exportHref && !loading && (
            <div className="relative group">
              <a
                href={exportHref}
                aria-label={exportLabel || "Baixar dados deste KPI"}
                className="block p-1 rounded-md text-ares-4 hover:text-ares-1 hover:bg-white/10 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
              </a>
              <div
                role="tooltip"
                className="absolute right-0 top-full mt-2 w-52 px-3 py-2 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50"
              >
                <span className="block font-semibold mb-1">Baixar planilha (XLSX)</span>
                <span className="text-zinc-400 text-[10px] leading-snug">
                  {exportLabel || "Dados que compõem este KPI"}
                </span>
              </div>
            </div>
          )}
          <Icon className={`w-3.5 h-3.5 md:w-4 md:h-4 ${color}`} />
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
        {loading ? (
          <Skeleton className="h-7 w-28 md:h-8 md:w-32" />
        ) : (
          <div className={`text-base md:text-2xl font-bold ${color} leading-tight`} style={{ fontFamily: "var(--font-display)" }}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Month Picker ───────────────────────────────────────────────────────── */
function MonthPicker({
  label, value, onChange, min, max,
}: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <div className="flex flex-col gap-1 w-full sm:w-auto">
      <label className="text-[11px] text-ares-4 uppercase tracking-wider">{label}</label>
      <input
        type="month"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className="w-full sm:w-auto bg-ares-surface border border-ares rounded-md px-3 py-1.5 text-sm text-ares-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />
    </div>
  );
}

const TABELA_SIZE = 50;

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function ResultadoFinanceiroPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tabelaLoading, setTabelaLoading] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cliente, setCliente] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [tabelaPage, setTabelaPage] = useState(1);
  const [isMobile, setIsMobile] = useState(false);
  const [sortBy,  setSortBy]  = useState("data");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const [tabelaComercial, setTabelaComercial] = useState("");
  const [resultadoFilter, setResultadoFilter] = useState<""|"lucro"|"prejuizo">("");
  const filtersRef = useRef({ start: "", end: "", cliente: "", tabelaComercial: "" });
  const sortRef    = useRef({ sortBy: "data", sortDir: "desc" as "asc"|"desc" });

  function handleTabelaSort(col: string) {
    const next = sortBy === col ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    const dir  = sortBy === col ? next : "desc";
    setSortBy(col);
    setSortDir(dir);
    sortRef.current = { sortBy: col, sortDir: dir };
    fetchTabela(1, col, dir);
  }

  const fetchData = useCallback(async (
    s: string, e: string, cli: string, tc: string, rf: string, page = 1, manual = false,
  ) => {
    if (manual) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (s)   params.set("start",   s);
      if (e)   params.set("end",     e);
      if (cli) params.set("cliente", cli);
      if (tc)  params.set("tabela_comercial", tc);
      if (rf)  params.set("resultado_filter", rf);
      params.set("tabela_page", String(page));
      params.set("tabela_size", String(TABELA_SIZE));
      params.set("sort_by",  sortRef.current.sortBy);
      params.set("sort_dir", sortRef.current.sortDir);
      const res = await fetch(`/api/resultado-financeiro?${params}`);
      const json: ApiData = await res.json();
      setData(json);
      setLastSync(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      if (!initialized) {
        setStart(json.periodo.start);
        setEnd(json.periodo.end);
        filtersRef.current = { start: json.periodo.start, end: json.periodo.end, cliente: cli, tabelaComercial: tc };
        setInitialized(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setTabelaLoading(false);
    }
  }, [initialized]);

  // Busca somente a tabela (paginação ou sort) sem recarregar KPIs/gráficos
  const fetchTabela = useCallback(async (page: number, sb?: string, sd?: "asc"|"desc", rf?: string) => {
    setTabelaPage(page);
    setTabelaLoading(true);
    const { start: s, end: e, cliente: c, tabelaComercial: tc } = filtersRef.current;
    const useSortBy  = sb ?? sortRef.current.sortBy;
    const useSortDir = sd ?? sortRef.current.sortDir;
    const useRf = rf ?? resultadoFilter;
    try {
      const params = new URLSearchParams();
      if (s)  params.set("start", s);
      if (e)  params.set("end",   e);
      if (c)  params.set("cliente", c);
      if (tc) params.set("tabela_comercial", tc);
      if (useRf) params.set("resultado_filter", useRf);
      params.set("tabela_page", String(page));
      params.set("tabela_size", String(TABELA_SIZE));
      params.set("sort_by",  useSortBy);
      params.set("sort_dir", useSortDir);
      const res = await fetch(`/api/resultado-financeiro?${params}`);
      const json: ApiData = await res.json();
      setData(prev => prev ? { ...prev, tabela: json.tabela, tabela_total: json.tabela_total, tabela_page: json.tabela_page } : json);
    } finally {
      setTabelaLoading(false);
    }
  }, [resultadoFilter]);

  // Alias para manter compatibilidade com chamadas de paginação
  const fetchPage = useCallback((page: number) => fetchTabela(page), [fetchTabela]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    fetchData("", "", "", "", "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized) return;
    filtersRef.current = { start, end, cliente, tabelaComercial };
    setTabelaPage(1);
    fetchData(start, end, cliente, tabelaComercial, resultadoFilter, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, cliente, tabelaComercial]);

  useEffect(() => {
    if (!initialized) return;
    setTabelaPage(1);
    fetchTabela(1, undefined, undefined, resultadoFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultadoFilter]);

  const t = data?.totais;
  const pctFrete = t && t.valor_nf > 0 ? (t.faturamento / t.valor_nf) * 100 : 0;
  const margemPct = t && t.faturamento > 0 ? (t.resultado / t.faturamento) * 100 : 0;
  const RESULT_COLOR = (v: number) => v >= 0 ? "#a78bfa" : "#ef4444";

  const exportBase = `/api/resultado-financeiro/export`;
  const exportParams = new URLSearchParams();
  if (start)   exportParams.set("start",   start);
  if (end)     exportParams.set("end",     end);
  if (cliente) exportParams.set("cliente", cliente);
  const exportQ = exportParams.toString() ? `?${exportParams}` : "";

  return (
    <div className="flex flex-col h-full overflow-auto bg-ares">
      <PageHeader
        title="Resultado Financeiro"
        onRefresh={() => fetchData(start, end, cliente, tabelaComercial, resultadoFilter, tabelaPage, true)}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">

        {/* Filtros: período + cliente */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-end">
          <MonthPicker
            label="De"
            value={start}
            onChange={setStart}
            min={data?.periodo.min_mes}
            max={end || data?.periodo.max_mes}
          />
          <MonthPicker
            label="Até"
            value={end}
            onChange={setEnd}
            min={start || data?.periodo.min_mes}
            max={data?.periodo.max_mes}
          />

          {/* Filtro por cliente */}
          {data?.clientes && data.clientes.length > 0 && (
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[11px] text-ares-4 uppercase tracking-wider">Cliente</label>
              <div className="flex items-center gap-2">
                <select
                  value={cliente}
                  onChange={e => setCliente(e.target.value)}
                  className="flex-1 sm:flex-none text-[12px] bg-ares-surface border border-ares rounded-md px-3 py-1.5 text-ares-1 focus:outline-none focus:border-amber-500/60 transition-colors cursor-pointer"
                >
                  <option value="">Todos os clientes</option>
                  {data.clientes.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                {cliente && (
                  <button
                    onClick={() => setCliente("")}
                    className="text-[11px] text-ares-4 hover:text-amber-400 transition-colors"
                  >
                    ✕ Limpar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filtro por tabela comercial */}
          {data?.tabelas_comerciais && data.tabelas_comerciais.length > 0 && (
            <div className="flex flex-col gap-1 w-full sm:w-auto">
              <label className="text-[11px] text-ares-4 uppercase tracking-wider">Tabela Comercial</label>
              <div className="flex items-center gap-2">
                <select
                  value={tabelaComercial}
                  onChange={e => setTabelaComercial(e.target.value)}
                  className="flex-1 sm:flex-none text-[12px] bg-ares-surface border border-ares rounded-md px-3 py-1.5 text-ares-1 focus:outline-none focus:border-amber-500/60 transition-colors cursor-pointer"
                >
                  <option value="">Todas as tabelas</option>
                  {data.tabelas_comerciais.map(tc => (
                    <option key={tc} value={tc}>{tc}</option>
                  ))}
                </select>
                {tabelaComercial && (
                  <button
                    onClick={() => setTabelaComercial("")}
                    className="text-[11px] text-ares-4 hover:text-amber-400 transition-colors"
                  >
                    ✕ Limpar
                  </button>
                )}
              </div>
            </div>
          )}

          {data && (
            <span className="text-xs text-ares-4 sm:self-end sm:pb-2">
              {t?.total?.toLocaleString("pt-BR")} CTe(s) no período
            </span>
          )}
        </div>

        {/* KPI Cards — 8 cards em layout 4+4 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            title="Faturamento do Período"
            value={t ? brl(t.faturamento) : "—"}
            icon={DollarSign}
            loading={loading}
            exportHref={`${exportBase}/faturamento${exportQ}`}
            exportLabel="CTe(s) do período — coluna FRETE destacada (atalho 147)"
          />
          <KpiCard
            title="Resultado do Período"
            value={t ? brl(t.resultado) : "—"}
            icon={TrendingUp}
            loading={loading}
            color={t ? (t.resultado >= 0 ? "text-emerald-400" : "text-red-400") : "text-amber-400"}
            exportHref={`${exportBase}/resultado${exportQ}`}
            exportLabel="CTe(s) do período — coluna RESULTADO destacada (atalho 147)"
          />
          <KpiCard
            title="% de Frete"
            value={t ? `${pctFrete.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
            icon={Percent}
            loading={loading}
            color={t ? (t.resultado >= 0 ? "text-orange-400" : "text-red-400") : "text-orange-400"}
            exportHref={`${exportBase}/pct-frete${exportQ}`}
            exportLabel="CTe(s) do período — % Frete = FRETE ÷ VALOR NF (atalho 147)"
          />
          <KpiCard
            title="% Margem do Período"
            value={t ? `${margemPct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : "—"}
            icon={Percent}
            loading={loading}
            color={t ? (t.resultado >= 0 ? "text-emerald-400" : "text-red-400") : "text-amber-400"}
          />
          <KpiCard
            title="Peso Transportado"
            value={t ? fmtPeso(t.peso) : "—"}
            icon={Weight}
            loading={loading}
            color="text-sky-400"
            exportHref={`${exportBase}/peso${exportQ}`}
            exportLabel="CTe(s) do período — coluna PESO destacada (atalho 147)"
          />
          <KpiCard
            title="Valor de Carga"
            value={t ? brl(t.valor_nf) : "—"}
            icon={Package}
            loading={loading}
            color="text-violet-400"
            exportHref={`${exportBase}/valor-carga${exportQ}`}
            exportLabel="CTe(s) do período — coluna VALOR NF destacada (atalho 147)"
          />
          <KpiCard
            title="CTes no Prejuízo"
            value={t
              ? `${t.ctes_negativos.toLocaleString("pt-BR")} (${t.total > 0 ? ((t.ctes_negativos / t.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0}%)`
              : "—"}
            icon={TrendingDown}
            loading={loading}
            color={t && t.ctes_negativos > 0 ? "text-red-400" : "text-emerald-400"}
            exportHref={`${exportBase}/ctes-prejuizo${exportQ}`}
            exportLabel="CTes com resultado negativo no período/cliente selecionado"
          />
          <KpiCard
            title="Margem Abaixo de 10%"
            value={t
              ? `${t.ctes_margem_baixa.toLocaleString("pt-BR")} (${t.total > 0 ? ((t.ctes_margem_baixa / t.total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : 0}%)`
              : "—"}
            icon={Percent}
            loading={loading}
            color={t && t.ctes_margem_baixa > 0 ? "text-orange-400" : "text-emerald-400"}
            exportHref={`${exportBase}/margem-baixa${exportQ}`}
            exportLabel="CTes com margem abaixo de 10% no período/cliente selecionado"
          />
        </div>

        {/* Evolução mensal (3/5) + Mapa UF (2/5) */}
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="bg-ares-panel border-ares xl:col-span-3">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm text-ares-2">Faturamento e Resultado dos últimos 12 meses</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              {loading ? (
                <Skeleton className="h-72 w-full" />
              ) : (
                <ResponsiveContainer width="100%" height={isMobile ? 220 : 280}>
                  <BarChart data={data?.evolucao ?? []} margin={{ top: 4, right: 8, bottom: isMobile ? 20 : 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="mes"
                      tickFormatter={fmtMes}
                      tick={{ fontSize: isMobile ? 9 : 11, fill: "#9ca3af" }}
                      angle={isMobile ? -45 : 0}
                      textAnchor={isMobile ? "end" : "middle"}
                      interval={isMobile ? "preserveStartEnd" : 0}
                    />
                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9ca3af" }} width={44} />
                    <Tooltip content={<EvolucaoTooltip />} />
                    <Bar dataKey="faturamento" name="Faturamento" fill="#38bdf8" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="resultado" name="Resultado" radius={[3, 3, 0, 0]}>
                      {(data?.evolucao ?? []).map((row, i) => (
                        <Cell key={i} fill={RESULT_COLOR(row.resultado)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="xl:col-span-2">
            <BrazilMapChart
              data={(data?.por_uf ?? []).map(row => ({ uf: row.uf, total: row.resultado }))}
              loading={loading}
              title="Resultado por UF de Destino"
              valueLabel=""
              valueFormatter={brl}
              diverging
              emptyByRegion
            />
          </div>
        </div>

        {/* Distribuição Geográfica: mapa por região + chips + popover */}
        <DistribuicaoGeografica por_uf={data?.por_uf ?? []} totais={data?.totais} loading={loading} />

        {/* Top Clientes + Top Negativos */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Top clientes por resultado */}
          <Card className="bg-ares-panel border-ares">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm text-ares-2">Top Clientes por Resultado</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : !data?.por_cliente?.length ? (
                <p className="text-sm text-ares-4 py-8 text-center">Sem dados de cliente no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, data.por_cliente.length * 36)}>
                  <BarChart
                    layout="vertical"
                    data={data.por_cliente}
                    margin={{ top: 2, right: isMobile ? 36 : 60, bottom: 2, left: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="cliente"
                      width={isMobile ? 80 : 150}
                      tick={{ fontSize: isMobile ? 9 : 10, fill: "#d1d5db" }}
                      tickFormatter={(v: string) => isMobile && v.length > 11 ? v.slice(0, 11) + "…" : v}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const row = payload[0].payload as ClienteRow;
                        const color = row.resultado >= 0 ? "#10b981" : "#ef4444";
                        return (
                          <div className="rounded-xl shadow-2xl px-3 py-2 text-xs"
                            style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)", minWidth: 200 }}>
                            <p className="text-white/70 font-semibold mb-1 truncate max-w-[220px]">{row.cliente}</p>
                            <p style={{ color }}>Resultado: <span className="font-bold">{brl(row.resultado)}</span></p>
                            <p className="text-amber-400">Faturamento: <span className="font-bold">{brl(row.faturamento)}</span></p>
                            <p className="text-white/50">{row.total} CTe(s)</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="resultado" radius={[0, 4, 4, 0]} label={isMobile ? false : { position: "right", formatter: (v: unknown) => brl(Number(v)), fontSize: 10, fill: "#9ca3af" }}>
                      {data.por_cliente.map((row, i) => (
                        <Cell key={i} fill={row.resultado >= 0 ? "#10b981" : "#ef4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Top Clientes por Resultado Negativo */}
          <Card className="bg-ares-panel border-ares">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm text-ares-2">Top Clientes por Resultado Negativo</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : !data?.top_negativos?.length ? (
                <p className="text-sm text-ares-4 py-8 text-center">Nenhum cliente com resultado negativo no período.</p>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(220, data.top_negativos.length * 36)}>
                  <BarChart
                    layout="vertical"
                    data={data.top_negativos}
                    margin={{ top: 2, right: isMobile ? 36 : 60, bottom: 2, left: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "#9ca3af" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="cliente"
                      width={isMobile ? 80 : 150}
                      tick={{ fontSize: isMobile ? 9 : 10, fill: "#d1d5db" }}
                      tickFormatter={(v: string) => isMobile && v.length > 11 ? v.slice(0, 11) + "…" : v}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const row = payload[0].payload as NegativoRow;
                        return (
                          <div className="rounded-xl shadow-2xl px-3 py-2 text-xs"
                            style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)", minWidth: 200 }}>
                            <p className="text-white/70 font-semibold mb-1 truncate max-w-[220px]">{row.cliente}</p>
                            <p className="text-red-400">CTes negativos: <span className="font-bold">{row.ctes_negativos}</span></p>
                            <p className="text-red-300">Prejuízo total: <span className="font-bold">{brl(row.resultado)}</span></p>
                            <p className="text-white/50">{row.total} CTe(s) no período</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="ctes_negativos" fill="#ef4444" radius={[0, 4, 4, 0]}
                      label={isMobile ? false : { position: "right", formatter: (v: unknown) => `${v} CTes`, fontSize: 10, fill: "#9ca3af" }}>
                      {data.top_negativos.map((_, i) => (
                        <Cell key={i} fill="#ef4444" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Decomposição de Custo + Distribuição de Margem */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="bg-ares-panel border-ares">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm text-ares-2">Decomposição do Custo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center pb-4">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : (() => {
                const c = data?.custos;
                if (!c) return <p className="text-sm text-ares-4 py-8">Sem dados.</p>;
                const total = c.custo_entrega + c.custo_transf + c.custo_coleta + c.custo_outros;
                if (total <= 0) return <p className="text-sm text-ares-4 py-8">Sem custos no período.</p>;
                const slices = [
                  { name: "Entrega",        value: c.custo_entrega, color: "#ef4444" },
                  { name: "Transferência",  value: c.custo_transf,  color: "#f97316" },
                  { name: "Coleta",         value: c.custo_coleta,  color: "#eab308" },
                  { name: "Outros",         value: c.custo_outros,  color: "#6b7280" },
                ].filter(s => s.value > 0);
                return (
                  <>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={slices}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="52%"
                          outerRadius="80%"
                          paddingAngle={3}
                          startAngle={90}
                          endAngle={-270}
                        >
                          {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                        </Pie>
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const s = payload[0].payload as { name: string; value: number; color: string };
                            const pct = ((s.value / total) * 100).toFixed(1);
                            return (
                              <div className="rounded-xl shadow-2xl px-3 py-2 text-xs"
                                style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)" }}>
                                <span style={{ color: s.color }} className="font-semibold">{s.name}</span>
                                <span className="text-white/70 ml-2">{brl(s.value)} ({pct}%)</span>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2 w-full px-4">
                      {slices.map((s) => {
                        const pct = ((s.value / total) * 100).toFixed(1);
                        return (
                          <div key={s.name} className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
                            <div className="min-w-0">
                              <div className="text-[10px] text-ares-4 leading-none">{s.name}</div>
                              <div className="text-xs font-semibold text-ares-1 tabular-nums">{pct}%</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </CardContent>
          </Card>

          {/* Distribuição de Margem — donut */}
          {(() => {
            const FAIXA_COLORS: Record<string, string> = {
              "Prejuízo": "#ef4444",
              "0–10%":    "#f97316",
              "10–20%":   "#eab308",
              "20–30%":   "#84cc16",
              "> 30%":    "#10b981",
            };
            const dm = data?.dist_margem ?? [];
            const dmTotal = dm.reduce((s, r) => s + r.total, 0);
            return (
              <Card className="bg-ares-panel border-ares">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm text-ares-2">Distribuição de Margem</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center pb-4">
                  {loading ? (
                    <Skeleton className="h-64 w-full" />
                  ) : !dm.length ? (
                    <p className="text-sm text-ares-4 py-8">Sem dados no período.</p>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={dm}
                            dataKey="total"
                            nameKey="faixa"
                            innerRadius="52%"
                            outerRadius="80%"
                            paddingAngle={3}
                            startAngle={90}
                            endAngle={-270}
                          >
                            {dm.map((row, i) => (
                              <Cell key={i} fill={FAIXA_COLORS[row.faixa] ?? "#6b7280"} />
                            ))}
                          </Pie>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload?.[0]) return null;
                              const row = payload[0].payload as DistMargemRow;
                              const color = FAIXA_COLORS[row.faixa] ?? "#9ca3af";
                              const pct = dmTotal > 0 ? ((row.total / dmTotal) * 100).toFixed(1) : "0";
                              return (
                                <div className="rounded-xl shadow-2xl px-3 py-2 text-xs"
                                  style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)", minWidth: 180 }}>
                                  <p className="font-semibold mb-1" style={{ color }}>{row.faixa}</p>
                                  <p className="text-white/70">{row.total.toLocaleString("pt-BR")} CTe(s) <span className="text-white/40">({pct}%)</span></p>
                                  <p className="text-amber-400">Faturamento: <span className="font-bold">{brl(row.faturamento)}</span></p>
                                  <p style={{ color }}>Resultado: <span className="font-bold">{brl(row.resultado)}</span></p>
                                </div>
                              );
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-2 w-full px-4">
                        {dm.map((row) => {
                          const color = FAIXA_COLORS[row.faixa] ?? "#6b7280";
                          const pct = dmTotal > 0 ? ((row.total / dmTotal) * 100).toFixed(1) : "0";
                          return (
                            <div key={row.faixa} className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
                              <div className="min-w-0">
                                <div className="text-[10px] text-ares-4 leading-none">{row.faixa}</div>
                                <div className="text-xs font-semibold text-ares-1 tabular-nums">{pct}%</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </div>

        {/* Resultado por Tabela Comercial — full-width */}
        <Card className="bg-ares-panel border-ares">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm text-ares-2">Resultado por Tabela Comercial</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : !data?.por_tabela?.length ? (
              <p className="text-sm text-ares-4 py-8 text-center">Sem dados de tabela comercial no período.</p>
            ) : (() => {
              const maxFat = Math.max(...data.por_tabela.map(r => r.faturamento));
              const maxRes = Math.max(...data.por_tabela.map(r => Math.abs(r.resultado)));
              const fatTotal = data.por_tabela.reduce((s, r) => s + r.faturamento, 0);
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-ares-4 border-b border-white/10">
                        <th className="text-left py-2 px-2 font-medium">#</th>
                        <th className="text-left py-2 px-2 font-medium">Tabela</th>
                        <th className="text-right py-2 px-2 font-medium">CTes</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ minWidth: isMobile ? 120 : 220 }}>Faturamento</th>
                        <th className="text-left py-2 px-2 font-medium" style={{ minWidth: isMobile ? 120 : 220 }}>Resultado</th>
                        <th className="text-right py-2 px-2 font-medium">% Fat.</th>
                        <th className="text-right py-2 px-2 font-medium">Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.por_tabela.map((row, i) => {
                        const pctFat = fatTotal > 0 ? (row.faturamento / fatTotal) * 100 : 0;
                        const margem = row.faturamento > 0 ? (row.resultado / row.faturamento) * 100 : 0;
                        const fatPct = maxFat > 0 ? (row.faturamento / maxFat) * 100 : 0;
                        const resPct = maxRes > 0 ? (Math.abs(row.resultado) / maxRes) * 100 : 0;
                        return (
                          <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-2 px-2 text-ares-4">{i + 1}</td>
                            <td className="py-2 px-2 text-white/90 font-medium truncate max-w-[200px]" title={row.tabela}>{row.tabela}</td>
                            <td className="py-2 px-2 text-right text-ares-4">{row.total}</td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <span className="text-amber-400 whitespace-nowrap" style={{ minWidth: 80 }}>{brl(row.faturamento)}</span>
                                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                                  <div className="h-full rounded-full bg-amber-400/40" style={{ width: `${fatPct}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2">
                              <div className="flex items-center gap-2">
                                <span className={`whitespace-nowrap ${row.resultado >= 0 ? "text-emerald-400" : "text-red-400"}`} style={{ minWidth: 80 }}>{brl(row.resultado)}</span>
                                <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                                  <div className={`h-full rounded-full ${row.resultado >= 0 ? "bg-emerald-400/40" : "bg-red-400/40"}`} style={{ width: `${resPct}%` }} />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 px-2 text-right text-white/60">{pctFat.toFixed(1)}%</td>
                            <td className={`py-2 px-2 text-right font-medium ${margem >= 10 ? "text-emerald-400" : margem >= 0 ? "text-amber-400" : "text-red-400"}`}>{margem.toFixed(1)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/20 font-medium">
                        <td className="py-2 px-2" colSpan={2}>Total</td>
                        <td className="py-2 px-2 text-right text-ares-4">{data.por_tabela.reduce((s, r) => s + r.total, 0)}</td>
                        <td className="py-2 px-2 text-amber-400">{brl(fatTotal)}</td>
                        <td className="py-2 px-2">
                          <span className={data.por_tabela.reduce((s, r) => s + r.resultado, 0) >= 0 ? "text-emerald-400" : "text-red-400"}>
                            {brl(data.por_tabela.reduce((s, r) => s + r.resultado, 0))}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-white/60">100%</td>
                        <td className="py-2 px-2 text-right">
                          {(() => { const tot = data.por_tabela.reduce((s, r) => s + r.resultado, 0); const marg = fatTotal > 0 ? (tot / fatTotal) * 100 : 0; return <span className={marg >= 10 ? "text-emerald-400" : marg >= 0 ? "text-amber-400" : "text-red-400"}>{marg.toFixed(1)}%</span>; })()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Tabela de CTes */}
        <Card className="bg-ares-panel border-ares">
          <CardHeader className="pb-2 pt-4 px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <CardTitle className="text-sm text-ares-2">
                CTes do Período
                {data && (
                  <span className="ml-2 text-[11px] text-ares-4 font-normal">
                    ({(data.tabela_total ?? 0).toLocaleString("pt-BR")} registro(s))
                  </span>
                )}
              </CardTitle>
              {!loading && (
                <div className="flex items-center gap-1">
                  {([
                    { label: "Todos",    value: "" },
                    { label: "Lucro",    value: "lucro" },
                    { label: "Prejuízo", value: "prejuizo" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setResultadoFilter(opt.value as "" | "lucro" | "prejuizo")}
                      className={`px-2.5 py-1 text-[11px] rounded-md transition-colors ${
                        resultadoFilter === opt.value
                          ? opt.value === "lucro"
                            ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                            : opt.value === "prejuizo"
                              ? "bg-red-500/20 text-red-400 font-semibold"
                              : "bg-white/10 text-ares-1 font-semibold"
                          : "text-ares-4 hover:text-ares-2 hover:bg-white/5"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!loading && data?.tabela?.length ? (
              <div className="relative group">
                <a
                  href={`${exportBase}/tabela${exportQ}`}
                  aria-label="Exportar tabela como XLSX"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] text-ares-4 hover:text-ares-1 hover:bg-white/10 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Exportar XLSX
                </a>
                <div className="absolute right-0 top-full mt-2 w-52 px-3 py-2 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <span className="block font-semibold mb-1">Baixar tabela (XLSX)</span>
                  <span className="text-zinc-400 text-[10px]">Todos os CTes do período com filtros aplicados</span>
                </div>
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {loading ? (
              <div className="px-5 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !data?.tabela?.length ? (
              <p className="px-5 py-4 text-sm text-ares-4">Nenhum registro encontrado para o período.</p>
            ) : (
              <div>
                {isMobile && (
                  <p className="px-4 pt-1 pb-2 text-[10px] text-ares-4">Deslize para ver mais colunas &rarr;</p>
                )}
                <div className="overflow-auto max-h-[520px]">
                <table className={`w-full text-xs text-ares-1 border-collapse min-w-[800px] transition-opacity ${tabelaLoading ? "opacity-40" : "opacity-100"}`}>
                  <thead className="sticky top-0 z-10 bg-ares-panel">
                    <tr className="border-b border-ares">
                      {([
                        { label: "Data",          key: "data",      align: "left"  },
                        { label: "Minuta",        key: "minuta",    align: "left"  },
                        { label: "Cliente",       key: "cliente",   align: "left"  },
                        { label: "Destino",       key: "destino",   align: "left"  },
                        { label: "Tab. Comercial",key: null,        align: "left"  },
                        { label: "Peso",          key: "peso",      align: "right" },
                        { label: "Frete",         key: "frete",     align: "right" },
                        { label: "Resultado",     key: "resultado", align: "right" },
                        { label: "Valor NF",      key: "valor_nf",  align: "right" },
                        { label: "Margem",        key: null,        align: "right" },
                      ] as const).map(col => (
                        <th
                          key={col.label}
                          onClick={col.key ? () => handleTabelaSort(col.key!) : undefined}
                          className={`px-3 py-2 text-[10px] text-ares-4 uppercase tracking-wider font-medium whitespace-nowrap text-${col.align} ${col.key ? "cursor-pointer select-none hover:text-ares-2 transition-colors" : ""}`}
                        >
                          {col.label}
                          {col.key && sortBy === col.key && (
                            <span className="ml-1 text-amber-400">{sortDir === "asc" ? "▲" : "▼"}</span>
                          )}
                          {col.key && sortBy !== col.key && (
                            <span className="ml-1 opacity-20">⇅</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.tabela.map((row, i) => {
                      const neg = row.resultado < 0;
                      const resColor = neg ? "text-red-400" : "text-emerald-400";
                      return (
                        <tr key={i} className={`border-b transition-colors ${neg ? "bg-red-950/30 hover:bg-red-950/50 border-red-900/30" : "border-ares/40 hover:bg-white/[0.03]"}`}>
                          <td className={`px-3 py-2 whitespace-nowrap ${neg ? "text-red-300" : "text-ares-3"}`}>{row.data}</td>
                          <td className={`px-3 py-2 whitespace-nowrap font-mono ${neg ? "text-red-300" : ""}`}>{row.minuta}</td>
                          <td className={`px-3 py-2 max-w-[160px] truncate ${neg ? "text-red-300" : ""}`} title={row.cliente}>{row.cliente}</td>
                          <td className={`px-3 py-2 max-w-[130px] truncate ${neg ? "text-red-300" : ""}`} title={row.destino}>{row.destino}</td>
                          <td className={`px-3 py-2 whitespace-nowrap max-w-[120px] truncate ${neg ? "text-red-300" : "text-sky-300"}`} title={row.tabela_comercial ?? ""}>{row.tabela_comercial ?? <span className="text-ares-4">—</span>}</td>
                          <td className={`px-3 py-2 whitespace-nowrap tabular-nums text-right ${neg ? "text-red-300" : ""}`}>{fmtPeso(row.peso)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap tabular-nums text-right ${neg ? "text-red-400" : "text-amber-400"}`}>{brl(row.frete)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap tabular-nums text-right font-semibold ${resColor}`}>{brl(row.resultado)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap tabular-nums text-right ${neg ? "text-red-400" : "text-violet-400"}`}>{brl(row.valor_nf)}</td>
                          <td className={`px-3 py-2 whitespace-nowrap tabular-nums text-right ${neg ? "text-red-300" : "text-ares-3"}`}>{row.margem}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Paginação */}
            {!loading && (data?.tabela_total ?? 0) > TABELA_SIZE && (() => {
              const total = data?.tabela_total ?? 0;
              const totalPages = Math.ceil(total / TABELA_SIZE);
              const from = (tabelaPage - 1) * TABELA_SIZE + 1;
              const to   = Math.min(tabelaPage * TABELA_SIZE, total);
              return (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t border-ares/40">
                  <span className="text-[11px] text-ares-4">
                    {from.toLocaleString("pt-BR")}–{to.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fetchPage(1)}
                      disabled={tabelaPage === 1 || tabelaLoading}
                      className="hidden sm:block px-2 py-1 text-xs rounded text-ares-3 hover:text-ares-1 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >«</button>
                    <button
                      onClick={() => fetchPage(tabelaPage - 1)}
                      disabled={tabelaPage === 1 || tabelaLoading}
                      className="px-2.5 py-1.5 text-xs rounded text-ares-3 hover:text-ares-1 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >‹ Anterior</button>
                    <span className="px-3 py-1 text-xs text-ares-2 font-medium">
                      {tabelaLoading ? "..." : `${tabelaPage} / ${totalPages}`}
                    </span>
                    <button
                      onClick={() => fetchPage(tabelaPage + 1)}
                      disabled={tabelaPage === totalPages || tabelaLoading}
                      className="px-2.5 py-1.5 text-xs rounded text-ares-3 hover:text-ares-1 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >Próxima ›</button>
                    <button
                      onClick={() => fetchPage(totalPages)}
                      disabled={tabelaPage === totalPages || tabelaLoading}
                      className="hidden sm:block px-2 py-1 text-xs rounded text-ares-3 hover:text-ares-1 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >»</button>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

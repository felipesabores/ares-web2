"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Truck, CheckCircle2, Clock, AlertTriangle, Building2, Trees, Download, TrendingUp, TrendingDown } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { REGIOES, REGIAO_COR } from "@/lib/sla";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent,
  ChartLegend, ChartLegendContent, type ChartConfig,
} from "@/components/ui/chart";

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface Kpis {
  total: number; antes: number; no_prazo: number; fora: number;
  metropolitana: number; interior: number; sla_pct: number;
  valor_total: number; valor_antes: number; valor_no_prazo: number;
  valor_fora: number; valor_metropolitana: number; valor_interior: number;
}
interface UFRow { uf: string; total: number }
interface RegiaoCell { atrasos: number; total: number; pct: number }
interface AtrasoRegiaoRow {
  mes: string;
  [regiao: string]: string | RegiaoCell;
}
interface TabelaRow {
  minuta: string; tipo_emissao: string; cte: string; nf_doc: string;
  emissao: string; prev_entrega: string; data_entrega: string;
  situacao: string; atraso_dias: number;
  valor: string; peso_real: string; vol: string;
  cliente: string; origem: string; uf_origem: string; destino: string; uf_destino: string;
  resp_entrega: string;
}
interface ApiData {
  periodo: { start: string; end: string; max_mes: string; min_mes: string };
  kpis: Kpis;
  clientes: string[];
  ufs_destino: string[];
  por_uf_no_prazo: UFRow[];
  por_uf_antes: UFRow[];
  por_uf_atraso: UFRow[];
  atrasos_regiao: AtrasoRegiaoRow[];
  tabela: TabelaRow[];
  tabela_total: number;
  tabela_page: number;
  tabela_size: number;
  sort_by:     string;
  sort_dir:    string;
  uf_destino:  string;
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */
const int = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
// Valor de mercadoria compacto: R$ 97,2 mi / R$ 850 mil / R$ 940
const brlC = (v: number | undefined | null): string | undefined => {
  if (v == null) return undefined;
  return `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
};

const COLORS = {
  total: "#38bdf8", antes: "#10b981", no_prazo: "#06b6d4", fora: "#ef4444",
  metropolitana: "#a78bfa", interior: "#fbbf24",
};

/* ─── Month picker ───────────────────────────────────────────────────────── */
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

/* ─── KPI Card ───────────────────────────────────────────────────────────── */
function KpiCard({
  title, value, sub, valor, icon: Icon, color = "#fbbf24", loading, exportHref, exportLabel,
}: {
  title: string; value: string; sub?: string; valor?: string; icon: React.ElementType; color?: string; loading: boolean;
  exportHref?: string; exportLabel?: string;
}) {
  return (
    <Card className="bg-ares-panel border-ares relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] z-10"
        style={{ background: `linear-gradient(90deg, ${color}cc, ${color}44, transparent)` }} />
      <CardHeader className="flex flex-row items-center justify-between pb-1.5 pt-3 px-3 md:pb-2 md:pt-4 md:px-4">
        <CardTitle className="text-[10px] md:text-[11px] text-ares-3 uppercase tracking-widest font-semibold pr-1 leading-tight">{title}</CardTitle>
        <div className="flex items-center gap-1 shrink-0">
          {exportHref && !loading && (
            <div className="relative group">
              <a href={exportHref} aria-label={exportLabel || "Baixar planilha"}
                className="block p-1 rounded-md text-ares-4 hover:text-ares-1 hover:bg-white/10 transition-colors">
                <Download className="w-3.5 h-3.5" />
              </a>
              <div role="tooltip"
                className="absolute right-0 top-full mt-2 w-52 px-3 py-2 bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-100 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                <span className="block font-semibold mb-1">Baixar planilha (XLSX)</span>
                <span className="text-zinc-400 text-[10px] leading-snug">{exportLabel || "Entregas deste card no período"}</span>
              </div>
            </div>
          )}
          <Icon className="w-3.5 h-3.5 md:w-4 md:h-4" style={{ color }} />
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 md:px-4 md:pb-4">
        {loading ? (
          <Skeleton className="h-7 w-24 md:h-8 md:w-28" />
        ) : (
          <>
            <div className="text-xl md:text-2xl font-bold tabular-nums leading-tight" style={{ color, fontFamily: "var(--font-display)" }}>{value}</div>
            {sub && <div className="text-[11px] text-ares-4 mt-0.5 tabular-nums">{sub}</div>}
            {valor && (
              <div className="text-[11px] mt-1 tabular-nums font-semibold" style={{ color }} title="Valor total da mercadoria (NF) destas entregas">
                {valor} <span className="text-ares-4 font-normal">em mercadoria</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Donut with center label ────────────────────────────────────────────── */
function DonutTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.12)" }}>
      <span className="w-2.5 h-2.5 rounded-full inline-block mr-1.5 align-middle" style={{ background: p.payload.fill }} />
      <span className="text-white/70">{p.name}: </span>
      <span className="font-semibold tabular-nums text-white">{int(p.value)}</span>
    </div>
  );
}

function Donut({
  title, slices, centerValue, centerLabel, loading,
}: {
  title: string;
  slices: { name: string; value: number; fill: string }[];
  centerValue: string; centerLabel: string; loading: boolean;
}) {
  const totalSlices = slices.reduce((s, x) => s + x.value, 0);
  return (
    <Card className="bg-ares-panel border-ares">
      <CardHeader className="pb-0 pt-4 px-5">
        <CardTitle className="text-[11px] font-semibold text-ares-4 uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-2">
        {loading ? (
          <Skeleton className="h-56 w-full bg-white/5" />
        ) : totalSlices === 0 ? (
          <div className="h-56 flex items-center justify-center text-xs text-ares-4">Sem entregas no período</div>
        ) : (
          <div className="flex items-center gap-4">
            {/* Donut + centro */}
            <div className="relative shrink-0" style={{ width: 170, height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={55} outerRadius={82} paddingAngle={2} stroke="none" isAnimationActive={false}>
                    {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<DonutTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold tabular-nums text-ares-1 leading-none">{centerValue}</span>
                <span className="text-[9px] text-ares-4 uppercase tracking-widest mt-1">{centerLabel}</span>
              </div>
            </div>
            {/* Legenda */}
            <div className="flex flex-col gap-2 flex-1 min-w-0">
              {slices.map((s) => {
                const p = totalSlices > 0 ? (s.value / totalSlices) * 100 : 0;
                return (
                  <div key={s.name} className="flex items-center justify-between gap-2 text-[13px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: s.fill }} />
                      <span className="text-ares-2 truncate">{s.name}</span>
                    </div>
                    <div className="tabular-nums shrink-0 text-right">
                      <span className="font-semibold text-ares-1">{int(s.value)}</span>
                      <span className="text-ares-4 ml-1.5 text-[11px]">{pct(p)}</span>
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

/* ─── Barras por UF (label no topo) ──────────────────────────────────────── */
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
      <p className="font-mono" style={{ color: payload[0].fill }}>{int(payload[0].value)} entrega(s)</p>
    </div>
  );
}
function UFBars({ data, color, title, loading }: { data: UFRow[]; color: string; title: string; loading: boolean }) {
  return (
    <Card className="bg-ares-panel border-ares">
      <CardHeader className="pb-0 pt-4 px-5">
        <CardTitle className="text-[11px] font-semibold text-ares-4 uppercase tracking-widest">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3 pt-2">
        {loading ? (
          <Skeleton className="h-40 w-full bg-white/5" />
        ) : data.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-xs text-ares-4">Sem entregas no período</div>
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={data} margin={{ left: 0, right: 6, top: 22, bottom: 16 }} barCategoryGap="18%" barSize={12}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="uf" tick={{ fill: "#8891a5", fontSize: 10 }} angle={-40} textAnchor="end"
                axisLine={false} tickLine={false} interval={0} dy={3} />
              <YAxis hide />
              <Tooltip content={<BarTip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="total" radius={[3, 3, 0, 0]} fill={color} fillOpacity={0.9} label={<BarTopLabel />} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Atrasos por Região — série de 6 meses ──────────────────────────────── */
const MES_LABEL: Record<string, string> = {
  "01":"jan","02":"fev","03":"mar","04":"abr","05":"mai","06":"jun",
  "07":"jul","08":"ago","09":"set","10":"out","11":"nov","12":"dez",
};
const fmtMes = (ym: string) => {
  const [y, m] = ym.split("-");
  return `${MES_LABEL[m] ?? m}/${y.slice(2)}`;
};

function AtrasosRegiaoChart({ data, loading }: { data: AtrasoRegiaoRow[]; loading: boolean }) {
  // Achata (mes, regiao) → { mes, Norte, Nordeste, ... } com % numérico.
  const chartData = data.map(row => {
    const flat: Record<string, unknown> = { mes: row.mes };
    for (const reg of REGIOES) {
      const cell = row[reg] as RegiaoCell | undefined;
      flat[reg] = cell?.pct ?? 0;
    }
    return flat;
  });

  // Cor via CSS var --color-<key> (padrão shadcn Chart).
  const chartConfig: ChartConfig = REGIOES.reduce((acc, reg) => {
    acc[reg] = { label: reg, color: REGIAO_COR[reg] };
    return acc;
  }, {} as ChartConfig);

  // Delta simples do primeiro pro último ponto (média das 5 regiões).
  const trend = (() => {
    if (chartData.length < 2) return null;
    const first = chartData[0], last = chartData[chartData.length - 1];
    const media = (row: Record<string, unknown>) =>
      REGIOES.reduce((s, r) => s + (Number(row[r]) || 0), 0) / REGIOES.length;
    const delta = media(last) - media(first);
    return { delta, up: delta > 0 };
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Atrasos por Região</CardTitle>
        <p className="text-sm text-muted-foreground">
          % de entregas fora do prazo — últimos 6 meses
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Sem dados no período</div>
        ) : (
          <ChartContainer config={chartConfig} className="max-h-[320px] w-full">
            <LineChart
              accessibilityLayer
              data={chartData}
              margin={{ left: 12, right: 12, top: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="mes"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={fmtMes}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(v) => fmtMes(String(v))}
                    formatter={(value, name) => (
                      <>
                        <div
                          className="w-2.5 h-2.5 shrink-0 rounded-[2px]"
                          style={{ background: `var(--color-${name})` }}
                        />
                        <div className="flex flex-1 justify-between leading-none items-center">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="font-mono font-medium tabular-nums text-foreground">
                            {pct(Number(value))}
                          </span>
                        </div>
                      </>
                    )}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              {REGIOES.map(reg => (
                <Line
                  key={reg}
                  dataKey={reg}
                  type="monotone"
                  stroke={`var(--color-${reg})`}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
      {!loading && data.length > 0 && trend && (
        <CardFooter className="flex-col items-start gap-2 text-sm">
          <div className="flex gap-2 leading-none font-medium">
            {trend.up ? "Piorou" : "Melhorou"} {Math.abs(trend.delta).toFixed(1)} p.p. em relação ao início do período
            {trend.up
              ? <TrendingUp className="h-4 w-4" />
              : <TrendingDown className="h-4 w-4" />}
          </div>
          <div className="text-muted-foreground leading-none">
            Média das 5 regiões · % fora do prazo
          </div>
        </CardFooter>
      )}
    </Card>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────── */
export default function SLAEntregasPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cliente, setCliente] = useState("");
  const [ufDestino, setUfDestino] = useState("");
  const [tabelaPage, setTabelaPage]   = useState(1);
  const [initialized, setInitialized] = useState(false);
  const [sortBy,  setSortBy]  = useState("data_entrega");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");
  const sortRef    = useCallback(() => ({ sortBy, sortDir }), [sortBy, sortDir]);
  const filtersRef = { start, end, cliente, ufDestino };

  const fetchData = useCallback(async (s: string, e: string, c: string, pg = 1, manual = false, sb?: string, sd?: "asc"|"desc", uf?: string) => {
    if (manual) setRefreshing(true); else setLoading(true);
    try {
      const params = new URLSearchParams();
      if (s) params.set("start", s);
      if (e) params.set("end", e);
      if (c) params.set("cliente", c);
      const ufVal = uf !== undefined ? uf : ufDestino;
      if (ufVal) params.set("uf_destino", ufVal);
      params.set("tabela_page", String(pg));
      params.set("sort_by",  sb  ?? sortBy);
      params.set("sort_dir", sd  ?? sortDir);
      const res = await fetch(`/api/sla-entregas?${params}`);
      const json: ApiData = await res.json();
      setData(json);
      setLastSync(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      if (!initialized) {
        setStart(json.periodo.start);
        setEnd(json.periodo.end);
        setInitialized(true);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, sortBy, sortDir, ufDestino]);

  function handleTabelaSort(col: string) {
    const dir = sortBy === col ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    setSortBy(col);
    setSortDir(dir);
    setTabelaPage(1);
    fetchData(start, end, cliente, 1, false, col, dir);
  }

  useEffect(() => {
    fetchData("", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized) return;
    setTabelaPage(1);
    fetchData(start, end, cliente, 1, false, undefined, undefined, ufDestino);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, cliente, ufDestino]);

  useEffect(() => {
    if (!initialized) return;
    fetchData(start, end, cliente, tabelaPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabelaPage]);

  const k = data?.kpis;
  const share = (v: number) => k && k.total > 0 ? pct((v / k.total) * 100) : "—";

  const expBase = "/api/sla-entregas/export";
  const expParams = new URLSearchParams();
  if (start)      expParams.set("start", start);
  if (end)        expParams.set("end", end);
  if (cliente)    expParams.set("cliente", cliente);
  if (ufDestino)  expParams.set("uf_destino", ufDestino);
  const expQ = expParams.toString() ? `?${expParams}` : "";

  const donutPrazo = k ? [
    { name: "Antes do prazo", value: k.antes,    fill: COLORS.antes },
    { name: "No prazo",       value: k.no_prazo, fill: COLORS.no_prazo },
    { name: "Fora do prazo",  value: k.fora,     fill: COLORS.fora },
  ] : [];
  const donutPolo = k ? [
    { name: "Região Metropolitana", value: k.metropolitana, fill: COLORS.metropolitana },
    { name: "Interior",             value: k.interior,      fill: COLORS.interior },
  ] : [];

  return (
    <div className="flex flex-col h-full overflow-auto bg-ares">
      <PageHeader
        title="SLA de Entregas"
        onRefresh={() => fetchData(start, end, cliente, tabelaPage, true)}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <div className="flex-1 p-4 md:p-6 space-y-6">

        {/* Filtros: período + cliente */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4 sm:items-end">
          <MonthPicker label="De" value={start} onChange={setStart}
            min={data?.periodo.min_mes} max={end || data?.periodo.max_mes} />
          <MonthPicker label="Até" value={end} onChange={setEnd}
            min={start || data?.periodo.min_mes} max={data?.periodo.max_mes} />

          {/* Filtro de cliente */}
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-[11px] text-ares-4 uppercase tracking-wider">Cliente</label>
            <select
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              className="w-full sm:w-64 bg-ares-surface border border-ares rounded-md px-3 py-1.5 text-sm text-ares-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="">Todos os clientes</option>
              {(data?.clientes ?? []).map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Filtro de UF destino */}
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <label className="text-[11px] text-ares-4 uppercase tracking-wider">UF Destino</label>
            <select
              value={ufDestino}
              onChange={e => setUfDestino(e.target.value)}
              className="w-full sm:w-28 bg-ares-surface border border-ares rounded-md px-3 py-1.5 text-sm text-ares-1 focus:outline-none focus:ring-1 focus:ring-amber-400"
            >
              <option value="">Todas</option>
              {(data?.ufs_destino ?? []).map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>

          <span className="text-xs text-ares-4 sm:self-end sm:pb-2">
            {loading ? "" : `${int(k?.total ?? 0)} entrega(s) no período · por data de entrega`}
          </span>
        </div>

        {/* KPI Cards — 6 cards em 3 colunas (2 fileiras) */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard title="Total de Entregas" icon={Truck} color={COLORS.total} loading={loading}
            value={k ? int(k.total) : "—"} sub="no período" valor={k ? brlC(k.valor_total) : undefined}
            exportHref={`${expBase}/total${expQ}`} exportLabel="Todas as entregas do período" />
          <KpiCard title="Antes do Prazo" icon={CheckCircle2} color={COLORS.antes} loading={loading}
            value={k ? int(k.antes) : "—"} sub={k ? share(k.antes) : undefined} valor={k ? brlC(k.valor_antes) : undefined}
            exportHref={`${expBase}/antes${expQ}`} exportLabel="Entregas antes da data prometida" />
          <KpiCard title="No Prazo" icon={Clock} color={COLORS.no_prazo} loading={loading}
            value={k ? int(k.no_prazo) : "—"} sub={k ? share(k.no_prazo) : undefined} valor={k ? brlC(k.valor_no_prazo) : undefined}
            exportHref={`${expBase}/no-prazo${expQ}`} exportLabel="Entregas no dia prometido" />
          <KpiCard title="Fora do Prazo" icon={AlertTriangle} color={COLORS.fora} loading={loading}
            value={k ? int(k.fora) : "—"} sub={k ? share(k.fora) : undefined} valor={k ? brlC(k.valor_fora) : undefined}
            exportHref={`${expBase}/fora${expQ}`} exportLabel="Entregas depois da data prometida" />
          <KpiCard title="Polo — Região Metropolitana" icon={Building2} color={COLORS.metropolitana} loading={loading}
            value={k ? int(k.metropolitana) : "—"} sub={k ? share(k.metropolitana) : undefined} valor={k ? brlC(k.valor_metropolitana) : undefined}
            exportHref={`${expBase}/metropolitana${expQ}`} exportLabel="Entregas na região metropolitana (cadastro de praças do Brudam)" />
          <KpiCard title="Polo — Interior" icon={Trees} color={COLORS.interior} loading={loading}
            value={k ? int(k.interior) : "—"} sub={k ? share(k.interior) : undefined} valor={k ? brlC(k.valor_interior) : undefined}
            exportHref={`${expBase}/interior${expQ}`} exportLabel="Entregas fora da região metropolitana" />
        </div>

        {/* Seção de 2 colunas: donut de prazo + donut Metropolitana × Interior */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Donut
            title="Pontualidade das Entregas"
            slices={donutPrazo}
            centerValue={k ? pct(k.sla_pct) : "—"}
            centerLabel="no prazo"
            loading={loading}
          />
          <Donut
            title="Polo de Entrega — Região Metropolitana × Interior"
            slices={donutPolo}
            centerValue={k ? int(k.total) : "—"}
            centerLabel="entregas"
            loading={loading}
          />
        </div>

        {/* Atrasos por região — série mensal de 6 meses (independente do filtro) */}
        <AtrasosRegiaoChart data={data?.atrasos_regiao ?? []} loading={loading} />

        {/* Distribuição por UF — um gráfico por balde de prazo, lado a lado em telas grandes */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <UFBars title="Entregas No Prazo por UF"    color={COLORS.no_prazo} loading={loading} data={data?.por_uf_no_prazo ?? []} />
          <UFBars title="Entregas Antes do Prazo por UF" color={COLORS.antes}  loading={loading} data={data?.por_uf_antes ?? []} />
          <UFBars title="Entregas em Atraso por UF"    color={COLORS.fora}     loading={loading} data={data?.por_uf_atraso ?? []} />
        </div>

        {/* ── Relação de Entregas ─────────────────────────────────────────── */}
        <RelacaoEntregas
          rows={data?.tabela ?? []}
          total={data?.tabela_total ?? 0}
          page={tabelaPage}
          pageSize={data?.tabela_size ?? 50}
          loading={loading}
          onPage={setTabelaPage}
          sortBy={sortBy}
          sortDir={sortDir}
          onSort={handleTabelaSort}
        />

      </div>
    </div>
  );
}

/* ─── Relação de Entregas ──────────────────────────────────────────────────── */
const SIT_CFG: Record<string, { label: string; cls: string }> = {
  "Antes do prazo": { label: "Antes do prazo", cls: "text-emerald-400 bg-emerald-400/10" },
  "No prazo":       { label: "No prazo",        cls: "text-sky-400    bg-sky-400/10"     },
  "Fora do prazo":  { label: "Em atraso",       cls: "text-red-400    bg-red-400/10"     },
};

function AtrasoChip({ dias, sit }: { dias: number; sit: string }) {
  if (sit === "Antes do prazo") return <span className="text-emerald-400 font-mono text-[11px]">-{Math.abs(dias)}d</span>;
  if (sit === "No prazo")       return <span className="text-sky-400 font-mono text-[11px]">—</span>;
  return <span className="text-red-400 font-mono font-bold text-[11px]">+{dias}d</span>;
}

function RelacaoEntregas({
  rows, total, page, pageSize, loading, onPage, sortBy, sortDir, onSort,
}: {
  rows: TabelaRow[]; total: number; page: number; pageSize: number; loading: boolean;
  onPage: (p: number) => void;
  sortBy: string; sortDir: "asc"|"desc"; onSort: (col: string) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fmtValor = (v: string | null) => {
    if (!v) return "—";
    const n = parseFloat(v);
    return isNaN(n) ? "—" : `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  // Converte ISO (YYYY-MM-DD) → DD/MM/YYYY para exibição
  const fmtDate = (s: string | null) => {
    if (!s) return "—";
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
  };
  const cols: { label: string; key: string | null; align: "left"|"right"|"center" }[] = [
    { label: "MINUTA",        key: "minuta",       align: "left"   },
    { label: "TIPO",          key: null,            align: "left"   },
    { label: "CTE/NFSE",      key: null,            align: "left"   },
    { label: "NF/DOC",        key: null,            align: "left"   },
    { label: "EMISSÃO",       key: "emissao",       align: "left"   },
    { label: "PREV. ENTREGA", key: "prev_entrega",  align: "left"   },
    { label: "DATA ENTREGA",  key: "data_entrega",  align: "left"   },
    { label: "SITUAÇÃO",      key: null,            align: "left"   },
    { label: "ATRASO",        key: "atraso",        align: "center" },
    { label: "VALOR",         key: "valor",         align: "right"  },
    { label: "PESO",          key: "peso",          align: "right"  },
    { label: "VOL",           key: "vol",           align: "right"  },
    { label: "CLIENTE",       key: "cliente",       align: "left"   },
    { label: "ORIGEM",        key: null,            align: "left"   },
    { label: "UF ORIG.",      key: null,            align: "center" },
    { label: "DESTINO",       key: null,            align: "left"   },
    { label: "UF DEST.",      key: "uf_destino",    align: "center" },
  ];

  return (
    <Card className="bg-ares-panel border-ares">
      <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-[11px] font-semibold text-ares-4 uppercase tracking-widest">
            Relação de Entregas
          </CardTitle>
          {!loading && (
            <span className="text-[11px] text-ares-4 font-mono">
              {total.toLocaleString("pt-BR")} registro{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2 text-xs text-ares-4">
            <button
              onClick={() => onPage(Math.max(1, page - 1))}
              disabled={page === 1 || loading}
              className="px-2 py-1 rounded border border-ares hover:bg-white/5 disabled:opacity-30 transition-colors"
            >←</button>
            <span>{page} / {totalPages}</span>
            <button
              onClick={() => onPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || loading}
              className="px-2 py-1 rounded border border-ares hover:bg-white/5 disabled:opacity-30 transition-colors"
            >→</button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="px-5 pb-5 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full bg-white/5" />)}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-ares-4">Sem entregas no período</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-ares">
                  {cols.map(col => (
                    <th
                      key={col.label}
                      onClick={col.key ? () => onSort(col.key!) : undefined}
                      className={`px-3 py-2 font-semibold text-ares-4 uppercase tracking-wider whitespace-nowrap text-${col.align} ${col.key ? "cursor-pointer select-none hover:text-ares-2 transition-colors" : ""}`}
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
                {rows.map((r, i) => {
                  const sit = SIT_CFG[r.situacao] ?? { label: r.situacao, cls: "text-ares-4 bg-white/5" };
                  return (
                    <tr key={i} className="border-b border-ares/50 hover:bg-white/[0.03] transition-colors">
                      <td className="px-3 py-2 font-mono text-amber-400 whitespace-nowrap">{r.minuta}</td>
                      <td className="px-3 py-2 text-ares-2 whitespace-nowrap">{r.tipo_emissao || "—"}</td>
                      <td className="px-3 py-2 font-mono text-ares-2 whitespace-nowrap">{r.cte || "—"}</td>
                      <td className="px-3 py-2 font-mono text-ares-3 max-w-[140px] truncate" title={r.nf_doc}>{r.nf_doc || "—"}</td>
                      <td className="px-3 py-2 text-ares-3 whitespace-nowrap">{r.emissao || "—"}</td>
                      <td className="px-3 py-2 text-ares-3 whitespace-nowrap">{fmtDate(r.prev_entrega)}</td>
                      <td className="px-3 py-2 text-ares-2 whitespace-nowrap">{fmtDate(r.data_entrega)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${sit.cls}`}>
                          {sit.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <AtrasoChip dias={r.atraso_dias} sit={r.situacao} />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-ares-2 whitespace-nowrap">{fmtValor(r.valor)}</td>
                      <td className="px-3 py-2 text-right font-mono text-ares-3 whitespace-nowrap">{r.peso_real || "—"}</td>
                      <td className="px-3 py-2 text-center text-ares-3 whitespace-nowrap">{r.vol || "—"}</td>
                      <td className="px-3 py-2 text-ares-2 max-w-[160px] truncate" title={r.cliente}>{r.cliente || "—"}</td>
                      <td className="px-3 py-2 text-ares-3 max-w-[120px] truncate" title={r.origem}>{r.origem || "—"}</td>
                      <td className="px-3 py-2 text-center font-mono text-ares-3">{r.uf_origem || "—"}</td>
                      <td className="px-3 py-2 text-ares-3 max-w-[120px] truncate" title={r.destino}>{r.destino || "—"}</td>
                      <td className="px-3 py-2 text-center font-mono text-ares-3">{r.uf_destino || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {totalPages > 1 && !loading && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-ares text-xs text-ares-4">
            <span>{((page - 1) * pageSize + 1).toLocaleString("pt-BR")}–{Math.min(page * pageSize, total).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span>
            <div className="flex gap-2">
              <button onClick={() => onPage(1)} disabled={page === 1 || loading} className="px-2 py-1 rounded border border-ares hover:bg-white/5 disabled:opacity-30">«</button>
              <button onClick={() => onPage(page - 1)} disabled={page === 1 || loading} className="px-2 py-1 rounded border border-ares hover:bg-white/5 disabled:opacity-30">←</button>
              <button onClick={() => onPage(page + 1)} disabled={page === totalPages || loading} className="px-2 py-1 rounded border border-ares hover:bg-white/5 disabled:opacity-30">→</button>
              <button onClick={() => onPage(totalPages)} disabled={page === totalPages || loading} className="px-2 py-1 rounded border border-ares hover:bg-white/5 disabled:opacity-30">»</button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Database, Server, Activity, CheckCircle2, AlertTriangle, XCircle,
  HardDrive, RefreshCw, Clock, Shield, TrendingUp, Globe, Zap,
  Container, Rocket, Wifi, WifiOff, Gauge,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, Legend,
} from "recharts";

/* ══ Types ═══════════════════════════════════════════════════════════════ */
interface TableStat { table_name: string; row_estimate: number; total_bytes: number; dead_tuples: number; last_vacuum: string | null }
interface SyncRate { relatorio: string; total: number; ok: number; rate: number }
interface RecentSync { relatorio: string; last_ok: string | null; last_err: string | null; last_error_msg: string | null; registros: number | null }
interface SmokeTest { check_name: string; status: string; value: string; checked_at: string }
interface LogGrowth { day: string; entries: number; ok: number; err: number }
interface HistCoverage { mes: string; rows: number }
interface HourlySync { hour: number; day: string; ok: number; err: number }
interface DailyByReport { day: string; relatorio: string; count: number }
interface ServiceCheck { name: string; url: string; status: "up" | "down" | "slow"; latency_ms: number; status_code?: number }
interface DokployApp { project: string; name: string; type: string; status: string; id: string }
interface Deploy { createdAt: string; status: string; title: string; description: string }
interface HealthData {
  timestamp: string;
  database: { size_bytes: number; connections: number; max_connections: number; connection_states: string };
  tables: TableStat[];
  sync: { rates_6h: SyncRate[]; recent_24h: RecentSync[]; log_growth_7d: LogGrowth[]; hourly_48h: HourlySync[]; daily_by_report: DailyByReport[] };
  smoke_tests: SmokeTest[];
  historico_coverage: HistCoverage[];
  infrastructure: { services: ServiceCheck[]; dokploy_apps: DokployApp[]; recent_deploys: Deploy[] };
}

/* ══ Helpers ═════════════════════════════════════════════════════════════ */
function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  if (b >= 1e3) return `${(b / 1e3).toFixed(0)} kB`;
  return `${b} B`;
}
function fmtNum(n: number) { return n.toLocaleString("pt-BR"); }
function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "agora";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function statusColor(s: string) {
  const l = s.toLowerCase();
  if (l === "pass" || l === "ok" || l === "up" || l === "done" || l === "running") return "emerald";
  if (l === "warn" || l === "slow" || l === "idle") return "amber";
  return "red";
}

const ACTIVE_TABLES = new Set([
  "emissoes", "emissoes_dia", "coletas", "cotacoes", "remessas",
  "awbs", "canhotos", "pereciveis", "custos_operacao",
  "custos_operacao_historico", "sync_log", "card_health", "user_profiles",
]);

const CHART_COLORS = ["#f59e0b", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#e11d48"];

/* ══ Custom tooltip ═════════════════════════════════════════════════════ */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--c-panel)] border border-[var(--c-border)] rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-ares-3 font-mono mb-1">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ares-2">{p.name}: <strong>{fmtNum(p.value)}</strong></span>
        </div>
      ))}
    </div>
  );
}

/* ══ Page ════════════════════════════════════════════════════════════════ */
export default function SystemHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDeploy, setSelectedDeploy] = useState<Deploy | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/system-health");
      if (res.status === 401) { setError("Acesso restrito."); return; }
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      setError(null);
    } catch { setError("Erro ao carregar dados de saúde."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 60_000); return () => clearInterval(id); }, [load]);

  if (error) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-ares-2 font-semibold">{error}</p>
      </div>
    </div>
  );

  const d = data;
  const skeleton = <div className="panel h-48 animate-pulse rounded-xl" />;

  // Derived data for charts
  const connPct = d ? Math.round((d.database.connections / d.database.max_connections) * 100) : 0;
  const radialConn = d ? [{ name: "Conexões", value: connPct, fill: connPct > 80 ? "#ef4444" : connPct > 50 ? "#f59e0b" : "#10b981" }] : [];

  const tablesBySize = d ? [...d.tables].sort((a, b) => b.total_bytes - a.total_bytes).slice(0, 8).map(t => ({
    name: t.table_name.replace("custos_operacao_", "c_op_"),
    size: t.total_bytes,
    sizeMB: +(t.total_bytes / 1e6).toFixed(1),
    rows: Math.max(0, t.row_estimate),
  })) : [];

  const smokePassRate = d ? (d.smoke_tests.filter(t => t.status.toLowerCase() === "pass").length / Math.max(1, d.smoke_tests.length) * 100) : 0;
  const smokePie = d ? [
    { name: "Pass", value: d.smoke_tests.filter(t => t.status.toLowerCase() === "pass").length, fill: "#10b981" },
    { name: "Warn", value: d.smoke_tests.filter(t => t.status.toLowerCase() === "warn").length, fill: "#f59e0b" },
    { name: "Fail", value: d.smoke_tests.filter(t => !["pass", "warn"].includes(t.status.toLowerCase())).length, fill: "#ef4444" },
  ].filter(s => s.value > 0) : [];

  // Build stacked area data for sync log growth
  const syncGrowthData = d ? d.sync.log_growth_7d.map(g => ({
    day: g.day.slice(5), // MM-DD
    ok: g.ok,
    err: g.err,
  })) : [];

  // Build reports for the stacked bar chart (sync per report daily)
  const reportNames = d ? [...new Set(d.sync.daily_by_report.map(r => r.relatorio))] : [];
  const dailyReportData = d ? (() => {
    const days = [...new Set(d.sync.daily_by_report.map(r => r.day))].sort();
    return days.map(day => {
      const entry: Record<string, string | number> = { day: day.slice(5) };
      for (const rn of reportNames) {
        const match = d.sync.daily_by_report.find(r => r.day === day && r.relatorio === rn);
        entry[rn] = match?.count ?? 0;
      }
      return entry;
    });
  })() : [];

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Activity className="w-4 h-4 text-emerald-400" />System Health</span>}
        onRefresh={load} refreshing={loading} lastSync={lastRefresh}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {!d ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <div key={i}>{skeleton}</div>)}</div>
        ) : (
          <>
            {/* ━━ INFRA STATUS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section>
              <SectionHeader icon={<Globe className="w-4 h-4" />} title="Infraestrutura" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                {d.infrastructure.services.map(svc => (
                  <ServiceCard key={svc.name} svc={svc} />
                ))}
              </div>
            </section>

            {/* ━━ OVERVIEW STRIP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MetricPill icon={<Database className="w-3.5 h-3.5" />} label="Banco" value={fmtBytes(d.database.size_bytes)} accent="amber" />
              <MetricPill icon={<Server className="w-3.5 h-3.5" />} label="Tabelas" value={`${d.tables.filter(t => ACTIVE_TABLES.has(t.table_name)).length} ativas`} accent="teal" />
              <MetricPill icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Smoke Tests" value={`${smokePassRate.toFixed(0)}%`} accent={smokePassRate === 100 ? "green" : "red"} />
              <MetricPill icon={<TrendingUp className="w-3.5 h-3.5" />} label="Histórico" value={`${d.historico_coverage.length} meses`} accent="blue" />
              <MetricPill icon={<Gauge className="w-3.5 h-3.5" />} label="PG Conn" value={`${d.database.connections}/${d.database.max_connections}`} accent={connPct > 80 ? "red" : "green"} />
            </section>

            {/* ━━ CHARTS ROW 1: DB + Connections ━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Table sizes bar chart */}
              <div className="lg:col-span-2 panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5 text-amber-500" />Tabelas por Tamanho
                </h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tablesBySize} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "var(--c-text-3)" }} tickFormatter={v => `${v} MB`} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: "var(--c-text-2)", fontFamily: "monospace" }} width={55} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="sizeMB" name="Tamanho (MB)" radius={[0, 4, 4, 0]} maxBarSize={18}>
                        {tablesBySize.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.8} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Radial gauge for connections */}
              <div className="panel rounded-xl p-4 flex flex-col items-center justify-center">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-2 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-emerald-500" />Conexões PG
                </h3>
                <div className="h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadialBarChart cx="50%" cy="60%" innerRadius="60%" outerRadius="90%" startAngle={180} endAngle={0} data={radialConn} barSize={14}>
                      <RadialBar background={{ fill: "var(--c-surface)" }} dataKey="value" cornerRadius={8} />
                    </RadialBarChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center -mt-6">
                  <span className="text-2xl font-bold text-ares-1 tabular-nums">{d.database.connections}</span>
                  <span className="text-ares-4 text-xs"> / {d.database.max_connections}</span>
                </div>
                <span className="text-[10px] text-ares-4 mt-1">{d.database.connection_states}</span>
              </div>
            </section>

            {/* ━━ CHARTS ROW 2: Sync Growth + Smoke Tests ━━━━━━━━━━━━━━ */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Sync log growth area chart */}
              <div className="lg:col-span-2 panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-blue-500" />Sync Log — 7 dias
                </h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={syncGrowthData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                      <defs>
                        <linearGradient id="gradOk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradErr" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--c-text-3)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--c-text-3)" }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area type="monotone" dataKey="ok" name="OK" stroke="#10b981" fill="url(#gradOk)" strokeWidth={2} />
                      <Area type="monotone" dataKey="err" name="Erros" stroke="#ef4444" fill="url(#gradErr)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Smoke Tests pie */}
              <div className="panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />Smoke Tests
                </h3>
                <div className="h-36">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={smokePie} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
                        {smokePie.map((s, i) => <Cell key={i} fill={s.fill} />)}
                      </Pie>
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1">
                  {d.smoke_tests.map(t => {
                    const c = statusColor(t.status);
                    return (
                      <div key={t.check_name} className="flex items-center gap-2 text-[10px]">
                        <div className={`w-1.5 h-1.5 rounded-full bg-${c}-500`} />
                        <span className="text-ares-3 font-mono truncate flex-1">{t.check_name}</span>
                        <span className={`text-${c}-400 font-mono font-semibold`}>{t.value}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ━━ SYNC RATES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="panel rounded-xl p-4">
              <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-amber-500" />Taxa de Sucesso — 6h
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {d.sync.rates_6h.map(r => {
                  const pct = Number(r.rate);
                  const c = pct >= 80 ? "emerald" : pct >= 50 ? "amber" : "red";
                  return (
                    <div key={r.relatorio} className="relative overflow-hidden rounded-lg bg-ares-surface border border-[var(--c-border)] p-3">
                      <div className={`absolute inset-0 bg-${c}-500/5`} />
                      <div className="relative">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-mono text-ares-2 truncate">{r.relatorio}</span>
                          <span className={`text-sm font-bold tabular-nums text-${c}-400`}>{pct}%</span>
                        </div>
                        <div className="h-1.5 bg-[var(--c-border)] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full bg-${c}-500 transition-all duration-700`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[9px] text-ares-4">
                          <span>{r.ok} ok</span>
                          <span>{Number(r.total) - Number(r.ok)} falhas</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ━━ CHARTS ROW 3: Report daily stacked + Recent sync table ━ */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Stacked bar: syncs per report per day */}
              <div className="panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-purple-500" />Volume por Relatório — 7d
                </h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dailyReportData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--c-text-3)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "var(--c-text-3)" }} />
                      <Tooltip content={<CustomTooltip />} />
                      {reportNames.map((rn, i) => (
                        <Bar key={rn} dataKey={rn} stackId="reports" fill={CHART_COLORS[i % CHART_COLORS.length]} radius={i === reportNames.length - 1 ? [2, 2, 0, 0] : undefined} maxBarSize={28} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent sync table */}
              <div className="panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-cyan-500" />Último Sync — 24h
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-ares-4 text-[9px] uppercase tracking-wider border-b border-[var(--c-border)]">
                        <th className="text-left py-2 px-2 font-semibold">Relatório</th>
                        <th className="text-right py-2 px-2 font-semibold">Registros</th>
                        <th className="text-center py-2 px-2 font-semibold">OK</th>
                        <th className="text-center py-2 px-2 font-semibold">Erro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--c-border)]">
                      {d.sync.recent_24h.map(r => (
                        <tr key={r.relatorio} className="hover:bg-[var(--c-panel-hover)] transition-colors">
                          <td className="py-1.5 px-2 font-mono text-ares-2">{r.relatorio}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ares-3">
                            {r.registros != null ? fmtNum(r.registros) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {r.last_ok
                              ? <span className="text-emerald-400 font-mono" title={fmtDate(r.last_ok)}>{timeAgo(r.last_ok)}</span>
                              : <span className="text-red-400">—</span>}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            {r.last_err
                              ? <span className="text-red-400 font-mono" title={r.last_error_msg ?? ""}>{timeAgo(r.last_err)}</span>
                              : <span className="text-ares-4">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ━━ DOKPLOY APPS + DEPLOYS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Dokploy apps */}
              <div className="panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Container className="w-3.5 h-3.5 text-blue-500" />Dokploy — Aplicações
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {d.infrastructure.dokploy_apps.map(app => {
                    const c = statusColor(app.status);
                    return (
                      <div key={app.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ares-surface">
                        <div className={`w-2 h-2 rounded-full bg-${c}-500 shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[11px] font-mono text-ares-2 truncate block">{app.name}</span>
                          <span className="text-[9px] text-ares-4">{app.project} · {app.type}</span>
                        </div>
                        <span className={`text-[10px] font-mono font-semibold text-${c}-400 uppercase`}>{app.status}</span>
                      </div>
                    );
                  })}
                  {d.infrastructure.dokploy_apps.length === 0 && (
                    <p className="text-[11px] text-ares-4 text-center py-4">Sem dados do Dokploy</p>
                  )}
                </div>
              </div>

              {/* Recent deploys */}
              <div className="panel rounded-xl p-4">
                <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <Rocket className="w-3.5 h-3.5 text-amber-500" />Deploys Recentes — ares-web
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {d.infrastructure.recent_deploys.map((dep, i) => {
                    const c = statusColor(dep.status);
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedDeploy(dep)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-ares-surface hover:bg-[var(--c-panel-hover)] transition-colors text-left cursor-pointer group"
                      >
                        <div className={`w-2 h-2 rounded-full bg-${c}-500 shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-mono text-ares-2 truncate block group-hover:text-ares-1 transition-colors">{dep.title || "Deploy"}</span>
                          <span className="text-[9px] text-ares-4">{fmtDate(dep.createdAt)}</span>
                        </div>
                        <span className={`text-[10px] font-mono font-semibold text-${c}-400 uppercase`}>{dep.status}</span>
                      </button>
                    );
                  })}
                  {d.infrastructure.recent_deploys.length === 0 && (
                    <p className="text-[11px] text-ares-4 text-center py-4">Sem deploys recentes</p>
                  )}
                </div>
              </div>
            </section>

            {/* ━━ TABLES DETAIL ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="panel rounded-xl p-4">
              <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                <HardDrive className="w-3.5 h-3.5 text-teal-500" />Tabelas — Detalhe
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-ares-4 text-[9px] uppercase tracking-wider border-b border-[var(--c-border)]">
                      <th className="text-left py-2 px-2 font-semibold">Tabela</th>
                      <th className="text-right py-2 px-2 font-semibold">Registros</th>
                      <th className="text-right py-2 px-2 font-semibold">Tamanho</th>
                      <th className="text-right py-2 px-2 font-semibold hidden md:table-cell">Dead Tuples</th>
                      <th className="text-left py-2 px-2 font-semibold hidden md:table-cell">Vacuum</th>
                      <th className="text-center py-2 px-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--c-border)]">
                    {d.tables.map(t => {
                      const isActive = ACTIVE_TABLES.has(t.table_name);
                      const rows = Math.max(0, t.row_estimate);
                      const bloat = rows > 0 ? (t.dead_tuples / rows) * 100 : 0;
                      return (
                        <tr key={t.table_name} className="hover:bg-[var(--c-panel-hover)] transition-colors">
                          <td className="py-1.5 px-2 font-mono text-ares-2">{t.table_name}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ares-3">{fmtNum(rows)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums text-ares-3">{fmtBytes(t.total_bytes)}</td>
                          <td className="py-1.5 px-2 text-right font-mono tabular-nums hidden md:table-cell">
                            {bloat > 10
                              ? <span className="text-amber-400">{fmtNum(t.dead_tuples)} ({bloat.toFixed(0)}%)</span>
                              : <span className="text-ares-4">{fmtNum(t.dead_tuples)}</span>}
                          </td>
                          <td className="py-1.5 px-2 hidden md:table-cell text-ares-4 font-mono text-[10px]">
                            {t.last_vacuum ? timeAgo(t.last_vacuum) : "—"}
                          </td>
                          <td className="py-1.5 px-2 text-center">
                            <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-full ${
                              isActive ? "text-emerald-400 bg-emerald-500/15" : "text-zinc-400 bg-zinc-500/15"
                            }`}>
                              {isActive ? "ATIVA" : "ÓRFÃ"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* ━━ HISTÓRICO COVERAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            <section className="panel rounded-xl p-4">
              <h3 className="text-[11px] font-semibold text-ares-3 uppercase tracking-widest mb-3 flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-indigo-500" />Cobertura Histórico (147)
              </h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.historico_coverage.map(h => ({ mes: h.mes.slice(2), rows: Number(h.rows) }))} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c-border)" />
                    <XAxis dataKey="mes" tick={{ fontSize: 9, fill: "var(--c-text-3)" }} interval={0} angle={-45} textAnchor="end" height={40} />
                    <YAxis tick={{ fontSize: 10, fill: "var(--c-text-3)" }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="rows" name="Registros" radius={[3, 3, 0, 0]} maxBarSize={16}>
                      {d.historico_coverage.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} opacity={0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Footer */}
            <div className="text-center text-[10px] text-ares-4 pb-4">
              Atualizado automaticamente a cada 60s · {fmtDate(d.timestamp)} BRT
            </div>
          </>
        )}
      </div>

      {/* ━━ Deploy Detail Dialog ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
      {selectedDeploy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelectedDeploy(null)} />
          <div className="relative bg-[var(--c-panel)] border border-[var(--c-border)] rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between p-5 border-b border-[var(--c-border)]">
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <Rocket className="w-4 h-4 text-amber-500 shrink-0" />
                  <h3 className="text-sm font-semibold text-ares-1 truncate">Deploy Details</h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-ares-4">
                  <span className="font-mono">{fmtDate(selectedDeploy.createdAt)}</span>
                  <span className={`font-mono font-bold uppercase text-${statusColor(selectedDeploy.status)}-400`}>
                    {selectedDeploy.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedDeploy(null)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-ares-3 hover:text-ares-1 transition-colors shrink-0"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            {/* Body */}
            <div className="p-5 overflow-y-auto max-h-[60vh]">
              <pre className="text-[12px] font-mono text-ares-2 whitespace-pre-wrap break-words leading-relaxed">
                {selectedDeploy.description || selectedDeploy.title || "Sem descrição"}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ══ Sub-components ══════════════════════════════════════════════════════ */

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <h2 className="text-xs font-bold text-ares-2 uppercase tracking-widest flex items-center gap-2">
      {icon}{title}
    </h2>
  );
}

function ServiceCard({ svc }: { svc: ServiceCheck }) {
  const up = svc.status === "up";
  const slow = svc.status === "slow";
  const StatusIcon = up ? Wifi : slow ? Wifi : WifiOff;
  const c = up ? "emerald" : slow ? "amber" : "red";

  return (
    <div className={`relative overflow-hidden rounded-xl border border-${c}-500/30 bg-${c}-500/5 p-4`}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ares-1 flex items-center gap-2">
            <StatusIcon className={`w-4 h-4 text-${c}-400`} />
            {svc.name}
          </h4>
          <p className="text-[10px] text-ares-4 mt-0.5 font-mono truncate max-w-[200px]">{svc.url.replace(/^https?:\/\//, "")}</p>
        </div>
        <div className="text-right">
          <span className={`text-lg font-bold tabular-nums text-${c}-400`}>{svc.latency_ms}<span className="text-[10px] font-normal">ms</span></span>
          {svc.status_code && <p className="text-[10px] text-ares-4 font-mono">HTTP {svc.status_code}</p>}
        </div>
      </div>
      {/* Latency bar */}
      <div className="mt-3 h-1 bg-[var(--c-border)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full bg-${c}-500 transition-all duration-500`} style={{ width: `${Math.min(100, (svc.latency_ms / 3000) * 100)}%` }} />
      </div>
    </div>
  );
}

function MetricPill({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border border-${accent}-500/20 bg-${accent}-500/5 px-4 py-3`}>
      <div className={`text-${accent}-400`}>{icon}</div>
      <div>
        <span className="text-[9px] font-semibold text-ares-4 uppercase tracking-wider block">{label}</span>
        <span className="text-sm font-bold text-ares-1 tabular-nums">{value}</span>
      </div>
    </div>
  );
}

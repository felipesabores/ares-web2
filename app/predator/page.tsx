"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import {
  Bot, Play, Pause, Settings2, CheckCircle2, XCircle, AlertTriangle, Loader2,
  Clock, Database, Power, History, ChevronDown, ChevronUp, Shield, Moon, Sun, X,
} from "lucide-react";
import type { PredatorJob, PredatorExecucao, ExecStatus } from "@/lib/predator";

/* ══ Helpers ═════════════════════════════════════════════════════════════ */
const TZ = "America/Sao_Paulo";

function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const future = diff < 0;
  const mins = Math.floor(Math.abs(diff) / 60_000);
  let s: string;
  if (mins < 1) s = future ? "instantes" : "agora";
  else if (mins < 60) s = `${mins} min`;
  else if (mins < 1440) s = `${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, "0")}`;
  else s = `${Math.floor(mins / 1440)}d`;
  if (s === "agora") return s;
  return future ? `em ${s}` : `há ${s}`;
}
function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtDur(ms: number | null) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`;
}
function fmtNum(n: number | null) { return n == null ? "—" : n.toLocaleString("pt-BR"); }
function fmtInterval(min: number) {
  if (min < 60) return `${min} min`;
  if (min % 60 === 0) return `${min / 60}h`;
  return `${Math.floor(min / 60)}h${min % 60}`;
}
const hhmm = (t: string) => t.slice(0, 5);

function isPaused(j: PredatorJob) {
  return !!j.pausado_ate && new Date(j.pausado_ate).getTime() > Date.now();
}
function runPending(j: PredatorJob) {
  return !!j.execucao_solicitada_em &&
    new Date(j.execucao_solicitada_em).getTime() > new Date(j.ultimo_inicio ?? 0).getTime();
}
function tomorrowAt(h: number) {
  // Amanhã às h:00 no horário de Brasília (UTC-3, sem horário de verão desde 2019)
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: TZ }));
  sp.setDate(sp.getDate() + 1);
  const y = sp.getFullYear(), m = sp.getMonth(), d = sp.getDate();
  return new Date(Date.UTC(y, m, d, h + 3, 0, 0)).toISOString();
}

function nextRunLabel(j: PredatorJob) {
  if (!j.ativo && !runPending(j)) return "—";
  if (j.ultimo_status === "executando") return "rodando";
  if (!j.proxima_execucao_prevista) return "—";
  return new Date(j.proxima_execucao_prevista).getTime() <= Date.now() + 30_000 ? "na fila" : timeAgo(j.proxima_execucao_prevista);
}

const STATUS_STYLE: Record<ExecStatus | "nunca", { label: string; cls: string; icon: React.ReactNode }> = {
  ok:         { label: "OK",         cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25", icon: <CheckCircle2 className="w-3 h-3" /> },
  erro:       { label: "Erro",       cls: "text-red-400 bg-red-500/10 border-red-500/25",             icon: <XCircle className="w-3 h-3" /> },
  timeout:    { label: "Timeout",    cls: "text-orange-400 bg-orange-500/10 border-orange-500/25",    icon: <AlertTriangle className="w-3 h-3" /> },
  executando: { label: "Rodando",    cls: "text-sky-400 bg-sky-500/10 border-sky-500/25",             icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  cancelado:  { label: "Cancelado",  cls: "text-ares-3 bg-[var(--c-panel-hover)] border-[var(--c-border)]", icon: <X className="w-3 h-3" /> },
  nunca:      { label: "Sem execução", cls: "text-ares-4 bg-[var(--c-panel-hover)] border-[var(--c-border)]", icon: <Clock className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: ExecStatus | null }) {
  const s = STATUS_STYLE[status ?? "nunca"];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${s.cls}`}>
      {s.icon}{s.label}
    </span>
  );
}

/* ══ Page ════════════════════════════════════════════════════════════════ */
export default function PredatorPage() {
  const [jobs, setJobs] = useState<PredatorJob[] | null>(null);
  const [execs, setExecs] = useState<PredatorExecucao[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);
  const [histJob, setHistJob] = useState<string>("");
  const [histStatus, setHistStatus] = useState<string>("");

  const notify = (msg: string, kind: "ok" | "err" = "ok") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/predator/jobs", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { setError("Acesso restrito a administradores."); return; }
      if (res.status === 503) { setError("As tabelas do Predator ainda não existem no banco. Rode a migration db/migrations/001_predator_control.sql."); return; }
      if (!res.ok) throw new Error();
      const json = await res.json();
      setJobs(json.jobs);
      setError(null);
      setLastRefresh(new Date().toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch { setError("Erro ao carregar os jobs do Predator."); }
    finally { setLoading(false); }
  }, []);

  const loadExecs = useCallback(async () => {
    const qs = new URLSearchParams({ limit: "60" });
    if (histJob) qs.set("job", histJob);
    if (histStatus) qs.set("status", histStatus);
    try {
      const res = await fetch(`/api/predator/execucoes?${qs}`, { cache: "no-store" });
      if (res.ok) setExecs((await res.json()).execucoes);
    } catch { /* histórico é secundário */ }
  }, [histJob, histStatus]);

  const refresh = useCallback(() => { loadJobs(); loadExecs(); }, [loadJobs, loadExecs]);

  useEffect(() => { loadJobs(); const id = setInterval(loadJobs, 30_000); return () => clearInterval(id); }, [loadJobs]);
  useEffect(() => { loadExecs(); const id = setInterval(loadExecs, 30_000); return () => clearInterval(id); }, [loadExecs]);

  /* ── Ações ── */
  const patch = async (job: PredatorJob, body: Partial<PredatorJob>, okMsg: string) => {
    setBusy(b => ({ ...b, [job.id]: true }));
    const prev = jobs;
    setJobs(js => js?.map(j => (j.id === job.id ? { ...j, ...body } : j)) ?? js); // otimista
    try {
      const res = await fetch(`/api/predator/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        const detail = json.fields ? Object.entries(json.fields).map(([k, v]) => `${k}: ${v}`).join("; ") : json.error;
        throw new Error(detail);
      }
      setJobs(js => js?.map(j => (j.id === job.id ? json.job : j)) ?? js);
      notify(okMsg);
      return true;
    } catch (e) {
      setJobs(prev);
      notify(`Não foi possível salvar: ${(e as Error).message}`, "err");
      return false;
    } finally {
      setBusy(b => ({ ...b, [job.id]: false }));
    }
  };

  const runNow = async (job: PredatorJob) => {
    setBusy(b => ({ ...b, [job.id]: true }));
    try {
      const res = await fetch(`/api/predator/jobs/${job.id}/run`, { method: "POST" });
      if (!res.ok) throw new Error();
      notify(`${job.nome}: execução pedida. O Predator pega no próximo ciclo.`);
      loadJobs();
    } catch { notify("Não foi possível pedir a execução.", "err"); }
    finally { setBusy(b => ({ ...b, [job.id]: false })); }
  };

  /* ── Resumo ── */
  const summary = useMemo(() => {
    if (!jobs) return null;
    return {
      ativos: jobs.filter(j => j.ativo && !isPaused(j)).length,
      pausados: jobs.filter(j => j.ativo && isPaused(j)).length,
      desligados: jobs.filter(j => !j.ativo).length,
      rodando: jobs.filter(j => j.ultimo_status === "executando").length,
      erros24h: jobs.reduce((s, j) => s + Number(j.erros_24h), 0),
      exec24h: jobs.reduce((s, j) => s + Number(j.execucoes_24h), 0),
    };
  }, [jobs]);

  const jobName = useMemo(() => Object.fromEntries((jobs ?? []).map(j => [j.id, j.nome])), [jobs]);

  if (error) return (
    <>
      <PageHeader title={<span className="flex items-center gap-2"><Bot className="w-4 h-4 text-amber-400" />Predator</span>} onRefresh={refresh} refreshing={loading} />
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <Shield className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <p className="text-ares-2 font-semibold">{error}</p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2"><Bot className="w-4 h-4 text-amber-400" />Predator<span className="hidden md:inline text-ares-4 font-normal normal-case tracking-normal">· coleta automática</span></span>}
        onRefresh={refresh} refreshing={loading} lastSync={lastRefresh}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
        {/* ━━ RESUMO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Pill icon={<Power className="w-3.5 h-3.5" />} label="Ativos" value={summary ? `${summary.ativos}/${jobs!.length}` : "…"} accent="emerald" />
          <Pill icon={<Pause className="w-3.5 h-3.5" />} label="Pausados / desligados" value={summary ? `${summary.pausados} / ${summary.desligados}` : "…"} accent="amber" />
          <Pill icon={<Loader2 className="w-3.5 h-3.5" />} label="Rodando agora" value={summary ? String(summary.rodando) : "…"} accent="sky" />
          <Pill icon={<History className="w-3.5 h-3.5" />} label="Execuções 24h" value={summary ? fmtNum(summary.exec24h) : "…"} accent="violet" />
          <Pill icon={<XCircle className="w-3.5 h-3.5" />} label="Falhas 24h" value={summary ? fmtNum(summary.erros24h) : "…"} accent={summary && summary.erros24h > 0 ? "red" : "emerald"} />
        </section>

        {/* ━━ JOBS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section className="space-y-2">
          <h2 className="text-xs font-bold text-ares-2 uppercase tracking-widest flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-400" />Relatórios
          </h2>

          {!jobs ? (
            [...Array(5)].map((_, i) => <div key={i} className="panel h-20 rounded-xl animate-pulse" />)
          ) : jobs.map(job => (
            <JobRow
              key={job.id}
              job={job}
              busy={!!busy[job.id]}
              editing={editing === job.id}
              onToggle={() => patch(job, { ativo: !job.ativo }, job.ativo ? `${job.nome} desligado.` : `${job.nome} ligado.`)}
              onRun={() => runNow(job)}
              onPause={(until) => patch(job, { pausado_ate: until }, until ? `${job.nome} pausado até ${fmtDate(until)}.` : `${job.nome} retomado.`)}
              onEdit={() => setEditing(editing === job.id ? null : job.id)}
              onSave={async (body) => { if (await patch(job, body, `${job.nome} atualizado.`)) setEditing(null); }}
              onHistory={() => { setHistJob(job.id); document.getElementById("historico")?.scrollIntoView({ behavior: "smooth" }); }}
            />
          ))}
        </section>

        {/* ━━ HISTÓRICO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <section id="historico" className="panel rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="text-xs font-bold text-ares-2 uppercase tracking-widest flex items-center gap-2 mr-auto">
              <History className="w-4 h-4 text-violet-400" />Histórico de execuções
            </h2>
            <select value={histJob} onChange={e => setHistJob(e.target.value)} className="field text-xs">
              <option value="">Todos os relatórios</option>
              {(jobs ?? []).map(j => <option key={j.id} value={j.id}>{j.nome}</option>)}
            </select>
            <select value={histStatus} onChange={e => setHistStatus(e.target.value)} className="field text-xs">
              <option value="">Todos os status</option>
              <option value="ok">OK</option>
              <option value="erro">Erro</option>
              <option value="timeout">Timeout</option>
              <option value="executando">Rodando</option>
            </select>
          </div>

          {execs.length === 0 ? (
            <p className="text-sm text-ares-4 py-8 text-center">Nenhuma execução registrada ainda. O histórico aparece quando o Predator 2 começar a rodar.</p>
          ) : (
            <div className="overflow-x-auto -mx-4">
              <table className="w-full text-xs min-w-[640px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-ares-4 border-b border-[var(--c-border)]">
                    <th className="text-left font-semibold px-4 py-2">Início</th>
                    <th className="text-left font-semibold px-2 py-2">Relatório</th>
                    <th className="text-left font-semibold px-2 py-2">Status</th>
                    <th className="text-right font-semibold px-2 py-2">Registros</th>
                    <th className="text-right font-semibold px-2 py-2">Duração</th>
                    <th className="text-left font-semibold px-2 py-2">Origem</th>
                    <th className="text-left font-semibold px-4 py-2">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {execs.map(e => (
                    <tr key={e.id} className="border-b border-[var(--c-border)] last:border-0 hover:bg-[var(--c-panel-hover)]">
                      <td className="px-4 py-2 font-mono text-ares-3 whitespace-nowrap">{fmtDate(e.iniciado_em)}</td>
                      <td className="px-2 py-2 text-ares-1 whitespace-nowrap">{jobName[e.job_id] ?? e.job_id}</td>
                      <td className="px-2 py-2"><StatusBadge status={e.status} /></td>
                      <td className="px-2 py-2 text-right tabular-nums text-ares-2">{fmtNum(e.registros)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-ares-2">{fmtDur(e.duracao_ms)}</td>
                      <td className="px-2 py-2 text-ares-3">{e.origem}{e.tentativa > 1 ? ` · ${e.tentativa}ª` : ""}</td>
                      <td className="px-4 py-2 text-red-400 max-w-[320px] truncate" title={e.erro ?? ""}>{e.erro ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm shadow-xl ${
          toast.kind === "ok" ? "border-emerald-500/30 bg-[var(--c-panel)] text-ares-1" : "border-red-500/40 bg-[var(--c-panel)] text-red-400"
        }`}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

/* ══ Linha de um job ═════════════════════════════════════════════════════ */
function JobRow({
  job, busy, editing, onToggle, onRun, onPause, onEdit, onSave, onHistory,
}: {
  job: PredatorJob; busy: boolean; editing: boolean;
  onToggle: () => void; onRun: () => void; onPause: (until: string | null) => void;
  onEdit: () => void; onSave: (body: Partial<PredatorJob>) => void; onHistory: () => void;
}) {
  const paused = isPaused(job);
  const pending = runPending(job);
  const [pauseOpen, setPauseOpen] = useState(false);
  const dim = !job.ativo || paused;

  return (
    <div className={`panel rounded-xl transition-opacity ${dim ? "opacity-70" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4">
        {/* Toggle */}
        <button
          role="switch"
          aria-checked={job.ativo}
          aria-label={job.ativo ? `Desligar ${job.nome}` : `Ligar ${job.nome}`}
          disabled={busy}
          onClick={onToggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${job.ativo ? "bg-emerald-500" : "bg-[var(--c-border-input)]"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${job.ativo ? "left-[22px]" : "left-0.5"}`} />
        </button>

        {/* Nome */}
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ares-1">{job.nome}</span>
            <span className="font-mono text-[10px] text-ares-4">{job.id}</span>
            {!job.ativo && <span className="text-[10px] font-semibold text-ares-4 uppercase">desligado</span>}
            {paused && <span className="text-[10px] font-semibold text-amber-400">pausado até {fmtDate(job.pausado_ate)}</span>}
            {pending && <span className="text-[10px] font-semibold text-sky-400">execução pedida</span>}
          </div>
          <div className="text-[11px] text-ares-4 mt-0.5 flex items-center gap-3 flex-wrap">
            <span className="flex items-center gap-1"><Sun className="w-3 h-3" />{fmtInterval(job.intervalo_min)} ({hhmm(job.janela_inicio)}–{hhmm(job.janela_fim)})</span>
            <span className="flex items-center gap-1"><Moon className="w-3 h-3" />{fmtInterval(job.intervalo_noturno_min ?? job.intervalo_min)}</span>
            {job.tabela_destino && <span className="font-mono">→ {job.tabela_destino}</span>}
          </div>
        </div>

        {/* Última execução */}
        <div className="min-w-[150px]">
          <div className="flex items-center gap-2"><StatusBadge status={job.ultimo_status} /><span className="text-[11px] text-ares-3">{timeAgo(job.ultimo_inicio)}</span></div>
          <div className="text-[11px] text-ares-4 mt-1">
            {fmtNum(job.ultimo_ok_registros)} reg · {fmtDur(job.ultima_duracao_ms)}
            {Number(job.erros_24h) > 0 && <span className="text-red-400"> · {job.erros_24h} falhas 24h</span>}
          </div>
        </div>

        {/* Próxima */}
        <div className="min-w-[110px] text-[11px]">
          <span className="block text-[9px] uppercase tracking-wider text-ares-4 font-semibold">Próxima</span>
          <span className="text-ares-2">{nextRunLabel(job)}</span>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 relative">
          <IconBtn title="Rodar agora" onClick={onRun} disabled={busy || pending || job.ultimo_status === "executando"}><Play className="w-3.5 h-3.5" /></IconBtn>
          {paused ? (
            <IconBtn title="Retomar" onClick={() => onPause(null)} disabled={busy}><Play className="w-3.5 h-3.5 text-amber-400" /></IconBtn>
          ) : (
            <IconBtn title="Pausar por um tempo" onClick={() => setPauseOpen(o => !o)} disabled={busy || !job.ativo}><Pause className="w-3.5 h-3.5" /></IconBtn>
          )}
          <IconBtn title="Histórico" onClick={onHistory}><History className="w-3.5 h-3.5" /></IconBtn>
          <IconBtn title="Configurar" onClick={onEdit} active={editing}>
            <Settings2 className="w-3.5 h-3.5" />{editing ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </IconBtn>

          {pauseOpen && (
            <div className="absolute right-0 top-9 z-20 w-44 rounded-lg border border-[var(--c-border)] bg-[var(--c-panel)] py-1 shadow-xl text-xs">
              {[
                { label: "1 hora", until: () => new Date(Date.now() + 3600e3).toISOString() },
                { label: "4 horas", until: () => new Date(Date.now() + 4 * 3600e3).toISOString() },
                { label: "Até amanhã 06:00", until: () => tomorrowAt(6) },
                { label: "7 dias", until: () => new Date(Date.now() + 7 * 86400e3).toISOString() },
              ].map(o => (
                <button key={o.label} className="block w-full px-3 py-2 text-left text-ares-2 hover:bg-[var(--c-panel-hover)]"
                  onClick={() => { setPauseOpen(false); onPause(o.until()); }}>
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {job.ultimo_status && ["erro", "timeout"].includes(job.ultimo_status) && job.ultimo_erro && (
        <div className="mx-4 mb-3 rounded-md border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] text-red-400 font-mono break-words">
          {job.ultimo_erro}
        </div>
      )}

      {editing && <JobEditor job={job} busy={busy} onSave={onSave} onCancel={onEdit} />}
    </div>
  );
}

/* ══ Editor de configuração ══════════════════════════════════════════════ */
function JobEditor({ job, busy, onSave, onCancel }: {
  job: PredatorJob; busy: boolean; onSave: (b: Partial<PredatorJob>) => void; onCancel: () => void;
}) {
  const [f, setF] = useState({
    nome: job.nome,
    descricao: job.descricao ?? "",
    intervalo_min: String(job.intervalo_min),
    intervalo_noturno_min: job.intervalo_noturno_min == null ? "" : String(job.intervalo_noturno_min),
    janela_inicio: hhmm(job.janela_inicio),
    janela_fim: hhmm(job.janela_fim),
    tabela_destino: job.tabela_destino ?? "",
    modo_gravacao: job.modo_gravacao,
    timeout_seg: String(job.timeout_seg),
    max_tentativas: String(job.max_tentativas),
    parametros: JSON.stringify(job.parametros ?? {}, null, 2),
  });
  const [jsonErr, setJsonErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF(s => ({ ...s, [k]: e.target.value }));

  const submit = () => {
    let parametros: Record<string, unknown>;
    try {
      parametros = JSON.parse(f.parametros || "{}");
      if (typeof parametros !== "object" || parametros === null || Array.isArray(parametros)) throw new Error();
    } catch { setJsonErr("Parâmetros precisam ser um objeto JSON, ex.: {\"dias_retroativos\": 30}"); return; }
    setJsonErr(null);

    const next: Partial<PredatorJob> = {
      nome: f.nome,
      descricao: f.descricao || null,
      intervalo_min: Number(f.intervalo_min),
      intervalo_noturno_min: f.intervalo_noturno_min === "" ? null : Number(f.intervalo_noturno_min),
      janela_inicio: f.janela_inicio,
      janela_fim: f.janela_fim,
      tabela_destino: f.tabela_destino || null,
      modo_gravacao: f.modo_gravacao,
      timeout_seg: Number(f.timeout_seg),
      max_tentativas: Number(f.max_tentativas),
      parametros,
    };
    // Manda só o que mudou
    const original: Record<string, unknown> = { ...job, janela_inicio: hhmm(job.janela_inicio), janela_fim: hhmm(job.janela_fim) };
    const diff = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(original[k])),
    ) as Partial<PredatorJob>;
    if (!Object.keys(diff).length) { onCancel(); return; }
    onSave(diff);
  };

  return (
    <div className="border-t border-[var(--c-border)] p-4 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
      <Field label="Nome" className="md:col-span-2"><input className="field w-full" value={f.nome} onChange={set("nome")} /></Field>
      <Field label="Descrição" className="md:col-span-2"><input className="field w-full" value={f.descricao} onChange={set("descricao")} /></Field>

      <Field label="Intervalo diurno (min)"><input type="number" min={1} max={1440} className="field w-full" value={f.intervalo_min} onChange={set("intervalo_min")} /></Field>
      <Field label="Intervalo noturno (min)" hint="vazio = igual ao diurno"><input type="number" min={1} max={1440} className="field w-full" value={f.intervalo_noturno_min} onChange={set("intervalo_noturno_min")} /></Field>
      <Field label="Janela diurna começa"><input type="time" className="field w-full" value={f.janela_inicio} onChange={set("janela_inicio")} /></Field>
      <Field label="Janela diurna termina"><input type="time" className="field w-full" value={f.janela_fim} onChange={set("janela_fim")} /></Field>

      <Field label="Tabela de destino"><input className="field w-full font-mono" value={f.tabela_destino} onChange={set("tabela_destino")} placeholder="ex.: emissoes" /></Field>
      <Field label="Modo de gravação">
        <select className="field w-full" value={f.modo_gravacao} onChange={set("modo_gravacao")}>
          <option value="substituir">Substituir tudo</option>
          <option value="acumular">Acumular histórico</option>
          <option value="upsert">Atualizar por chave</option>
        </select>
      </Field>
      <Field label="Timeout (seg)"><input type="number" min={30} max={7200} className="field w-full" value={f.timeout_seg} onChange={set("timeout_seg")} /></Field>
      <Field label="Tentativas"><input type="number" min={1} max={5} className="field w-full" value={f.max_tentativas} onChange={set("max_tentativas")} /></Field>

      <Field label="Parâmetros (JSON)" className="md:col-span-4" hint="Valores extras que o relatório usa, ex.: período, filial">
        <textarea rows={4} className="field w-full font-mono" value={f.parametros} onChange={set("parametros")} />
        {jsonErr && <span className="text-red-400 mt-1 block">{jsonErr}</span>}
      </Field>

      <div className="md:col-span-4 flex justify-end gap-2">
        <button onClick={onCancel} className="rounded-md border border-[var(--c-border)] px-3 py-1.5 text-ares-2 hover:bg-[var(--c-panel-hover)]">Cancelar</button>
        <button onClick={submit} disabled={busy} className="rounded-md bg-amber-500 px-3 py-1.5 font-semibold text-black hover:bg-amber-400 disabled:opacity-50">
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

/* ══ Pequenos componentes ════════════════════════════════════════════════ */
function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-ares-4 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-ares-4 mt-0.5">{hint}</span>}
    </label>
  );
}

function IconBtn({ title, onClick, disabled, active, children }: {
  title: string; onClick: () => void; disabled?: boolean; active?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      title={title} aria-label={title} onClick={onClick} disabled={disabled}
      className={`flex h-8 items-center gap-0.5 rounded-md border px-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "border-amber-500/40 bg-amber-500/10 text-amber-400" : "border-[var(--c-border)] text-ares-2 hover:bg-[var(--c-panel-hover)] hover:text-ares-1"
      }`}
    >
      {children}
    </button>
  );
}

const PILL_ACCENT: Record<string, string> = {
  emerald: "border-emerald-500/20 bg-emerald-500/5 text-emerald-400",
  amber: "border-amber-500/20 bg-amber-500/5 text-amber-400",
  sky: "border-sky-500/20 bg-sky-500/5 text-sky-400",
  violet: "border-violet-500/20 bg-violet-500/5 text-violet-400",
  red: "border-red-500/20 bg-red-500/5 text-red-400",
};

function Pill({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${PILL_ACCENT[accent]}`}>
      <div>{icon}</div>
      <div>
        <span className="text-[9px] font-semibold text-ares-4 uppercase tracking-wider block">{label}</span>
        <span className="text-sm font-bold text-ares-1 tabular-nums">{value}</span>
      </div>
    </div>
  );
}

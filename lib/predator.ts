import { NextResponse } from "next/server";
import { getSession, type SessionPayload } from "@/lib/session";

/* ══ Tipos compartilhados (API ↔ tela) ═══════════════════════════════════ */

export interface PredatorJob {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: string;
  ativo: boolean;
  intervalo_min: number;
  intervalo_noturno_min: number | null;
  janela_inicio: string;
  janela_fim: string;
  pausado_ate: string | null;
  parametros: Record<string, unknown>;
  tabela_destino: string | null;
  modo_gravacao: "substituir" | "acumular" | "upsert";
  timeout_seg: number;
  max_tentativas: number;
  ordem: number;
  execucao_solicitada_em: string | null;
  execucao_solicitada_por: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
  // Campos da view predator_jobs_status
  ultimo_status: ExecStatus | null;
  ultimo_inicio: string | null;
  ultimo_fim: string | null;
  ultima_duracao_ms: number | null;
  ultimos_registros: number | null;
  ultimo_erro: string | null;
  ultimo_ok_em: string | null;
  ultimo_ok_registros: number | null;
  execucoes_24h: number;
  erros_24h: number;
  duracao_media_ms_24h: number | null;
  intervalo_vigente_min: number;
  proxima_execucao_prevista: string | null;
}

export type ExecStatus = "executando" | "ok" | "erro" | "timeout" | "cancelado";

export interface PredatorExecucao {
  id: number;
  job_id: string;
  origem: "agendado" | "manual" | "retentativa";
  status: ExecStatus;
  tentativa: number;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  registros: number | null;
  erro: string | null;
  host: string | null;
}

/* ══ Autorização ═════════════════════════════════════════════════════════ */

/** Só admins mexem no predator. Retorna a sessão ou uma resposta 401/403. */
export async function requireAdmin(): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return session;
}

/** Postgres devolve 42P01 quando a tabela/view não existe (migration não rodada). */
export function isMissingTable(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "42P01";
}

export function migrationPendente() {
  return NextResponse.json(
    { error: "migration_pendente", detail: "Rode db/migrations/001_predator_control.sql no banco do 2.0." },
    { status: 503 },
  );
}

/* ══ Validação do PATCH ══════════════════════════════════════════════════
   Lista fechada de campos editáveis: o nome da coluna nunca vem do cliente,
   só o valor, que vai sempre como parâmetro ($n). */

type Validator = (v: unknown) => { ok: true; value: unknown } | { ok: false; error: string };

const int = (min: number, max: number, nullable = false): Validator => (v) => {
  if (v === null && nullable) return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max)
    return { ok: false, error: `deve ser inteiro entre ${min} e ${max}` };
  return { ok: true, value: v };
};

const text = (max: number, nullable = false): Validator => (v) => {
  if (v === null && nullable) return { ok: true, value: null };
  if (typeof v !== "string") return { ok: false, error: "deve ser texto" };
  const t = v.trim();
  if (!t && !nullable) return { ok: false, error: "não pode ser vazio" };
  if (t.length > max) return { ok: false, error: `máximo ${max} caracteres` };
  return { ok: true, value: t || null };
};

const time: Validator = (v) =>
  typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
    ? { ok: true, value: v }
    : { ok: false, error: "use HH:MM" };

const EDITABLE: Record<string, Validator> = {
  nome: text(80),
  descricao: text(300, true),
  ativo: (v) => (typeof v === "boolean" ? { ok: true, value: v } : { ok: false, error: "deve ser true/false" }),
  intervalo_min: int(1, 1440),
  intervalo_noturno_min: int(1, 1440, true),
  janela_inicio: time,
  janela_fim: time,
  pausado_ate: (v) => {
    if (v === null) return { ok: true, value: null };
    if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return { ok: false, error: "data inválida" };
    return { ok: true, value: new Date(v).toISOString() };
  },
  parametros: (v) => {
    if (typeof v !== "object" || v === null || Array.isArray(v))
      return { ok: false, error: "deve ser um objeto JSON" };
    const json = JSON.stringify(v);
    if (json.length > 4000) return { ok: false, error: "parâmetros grandes demais" };
    return { ok: true, value: json };
  },
  tabela_destino: (v) => {
    if (v === null || v === "") return { ok: true, value: null };
    return typeof v === "string" && /^[a-z_][a-z0-9_]{0,62}$/.test(v)
      ? { ok: true, value: v }
      : { ok: false, error: "nome de tabela inválido" };
  },
  modo_gravacao: (v) =>
    v === "substituir" || v === "acumular" || v === "upsert"
      ? { ok: true, value: v }
      : { ok: false, error: "use substituir, acumular ou upsert" },
  timeout_seg: int(30, 7200),
  max_tentativas: int(1, 5),
};

export function validatePatch(body: unknown):
  | { ok: true; fields: [string, unknown][] }
  | { ok: false; errors: Record<string, string> } {
  if (typeof body !== "object" || body === null || Array.isArray(body))
    return { ok: false, errors: { _: "corpo inválido" } };

  const fields: [string, unknown][] = [];
  const errors: Record<string, string> = {};
  for (const [key, raw] of Object.entries(body)) {
    const validator = EDITABLE[key];
    if (!validator) { errors[key] = "campo não editável"; continue; }
    const r = validator(raw);
    if (r.ok) fields.push([key, r.value]);
    else errors[key] = r.error;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (!fields.length) return { ok: false, errors: { _: "nada para alterar" } };
  return { ok: true, fields };
}

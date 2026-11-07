import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, isMissingTable, migrationPendente, type PredatorExecucao } from "@/lib/predator";

export const revalidate = 0;

const STATUS = new Set(["executando", "ok", "erro", "timeout", "cancelado"]);

/** Histórico de execuções. Filtros opcionais: ?job=r106&status=erro&limit=50 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const job = sp.get("job");
  const status = sp.get("status");
  const limit = Math.min(Math.max(parseInt(sp.get("limit") ?? "50", 10) || 50, 1), 200);

  if (job && !/^[a-z0-9_]{1,40}$/.test(job)) return NextResponse.json({ error: "job inválido" }, { status: 400 });
  if (status && !STATUS.has(status)) return NextResponse.json({ error: "status inválido" }, { status: 400 });

  try {
    const execucoes = await query<PredatorExecucao>(
      `
      SELECT id, job_id, origem, status, tentativa, iniciado_em, finalizado_em,
             duracao_ms, registros, erro, host
        FROM predator_execucoes
       WHERE ($1::text IS NULL OR job_id = $1)
         AND ($2::text IS NULL OR status = $2)
       ORDER BY iniciado_em DESC
       LIMIT $3
      `,
      [job, status, limit],
      { timeoutMs: 5000 },
    );
    return NextResponse.json({ execucoes });
  } catch (err) {
    if (isMissingTable(err)) return migrationPendente();
    console.error("[predator/execucoes] GET", err);
    return NextResponse.json({ error: "erro ao carregar histórico" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, isMissingTable, migrationPendente, validatePatch, type PredatorJob } from "@/lib/predator";

export const revalidate = 0;

const ID_RE = /^[a-z0-9_]{1,40}$/;

/** Edita um job. Só campos da lista fechada em lib/predator.ts; valores sempre parametrizados. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const v = validatePatch(body);
  if (!v.ok) return NextResponse.json({ error: "validação", fields: v.errors }, { status: 400 });

  // Nomes de coluna vêm da whitelist (validatePatch), nunca do cliente.
  const sets = v.fields.map(([col], i) =>
    col === "parametros" ? `${col} = $${i + 1}::jsonb` : `${col} = $${i + 1}`,
  );
  const values = v.fields.map(([, val]) => val);
  const cols = v.fields.map(([col]) => col);
  const n = values.length;
  const pId = `$${n + 1}`;
  const pUser = `$${n + 2}`;
  const pCols = `$${n + 3}`;

  try {
    const rows = await query<{ id: string }>(
      `
      WITH antes AS (
        SELECT * FROM predator_jobs WHERE id = ${pId}
      ), upd AS (
        UPDATE predator_jobs
           SET ${sets.join(", ")}, atualizado_em = now(), atualizado_por = ${pUser}
         WHERE id = ${pId}
        RETURNING *
      ), audit AS (
        INSERT INTO predator_alteracoes (job_id, usuario, acao, antes, depois)
        SELECT upd.id, ${pUser}, 'editar',
               (SELECT jsonb_object_agg(k, to_jsonb(a) -> k) FROM antes a, unnest(${pCols}::text[]) k),
               (SELECT jsonb_object_agg(k, to_jsonb(upd) -> k) FROM unnest(${pCols}::text[]) k)
          FROM upd
      )
      SELECT id FROM upd
      `,
      [...values, id, auth.username, cols],
    );
    if (!rows.length) return NextResponse.json({ error: "job não encontrado" }, { status: 404 });

    const [job] = await query<PredatorJob>(`SELECT * FROM predator_jobs_status WHERE id = $1`, [id]);
    return NextResponse.json({ job });
  } catch (err) {
    if (isMissingTable(err)) return migrationPendente();
    const code = (err as { code?: string }).code;
    if (code === "23514") return NextResponse.json({ error: "valor fora do permitido" }, { status: 400 });
    console.error("[predator/jobs/:id] PATCH", err);
    return NextResponse.json({ error: "erro ao salvar" }, { status: 500 });
  }
}

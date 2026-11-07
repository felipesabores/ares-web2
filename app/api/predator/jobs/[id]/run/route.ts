import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, isMissingTable, migrationPendente } from "@/lib/predator";

export const revalidate = 0;

/**
 * "Rodar agora": só marca o pedido no banco. O predator2 vê a marca no
 * próximo ciclo (≤ 1 min) e executa. O ares-web nunca chama a LXC do predator.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!/^[a-z0-9_]{1,40}$/.test(id)) return NextResponse.json({ error: "id inválido" }, { status: 400 });

  try {
    const rows = await query<{ execucao_solicitada_em: string }>(
      `
      WITH upd AS (
        UPDATE predator_jobs
           SET execucao_solicitada_em = now(), execucao_solicitada_por = $2
         WHERE id = $1
        RETURNING id, execucao_solicitada_em
      ), audit AS (
        INSERT INTO predator_alteracoes (job_id, usuario, acao, depois)
        SELECT id, $2, 'rodar_agora', jsonb_build_object('execucao_solicitada_em', execucao_solicitada_em) FROM upd
      )
      SELECT execucao_solicitada_em FROM upd
      `,
      [id, auth.username],
    );
    if (!rows.length) return NextResponse.json({ error: "job não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true, solicitado_em: rows[0].execucao_solicitada_em });
  } catch (err) {
    if (isMissingTable(err)) return migrationPendente();
    console.error("[predator/run] POST", err);
    return NextResponse.json({ error: "erro ao solicitar execução" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin, isMissingTable, migrationPendente, type PredatorJob } from "@/lib/predator";

export const revalidate = 0;

export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  try {
    const jobs = await query<PredatorJob>(
      `SELECT * FROM predator_jobs_status ORDER BY ordem, id`,
      undefined,
      { timeoutMs: 5000 },
    );
    return NextResponse.json({ jobs, agora: new Date().toISOString() });
  } catch (err) {
    if (isMissingTable(err)) return migrationPendente();
    console.error("[predator/jobs] GET", err);
    return NextResponse.json({ error: "erro ao carregar jobs" }, { status: 500 });
  }
}

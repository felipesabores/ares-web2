import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export const revalidate = 0;

export async function GET() {
  const rows = await query(`
    SELECT executado_em
    FROM sync_log
    WHERE status = 'ok'
    ORDER BY executado_em DESC
    LIMIT 1
  `);

  const last = rows[0]?.executado_em ?? null;

  return NextResponse.json({ last });
}

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

// A tabela user_profiles é criada pela migration db/migrations/002_user_profiles.sql:
// o usuário do banco da aplicação não tem permissão de CREATE.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const rows = await query<{ email: string; phone: string; avatar: string }>(
    `SELECT email, phone, avatar FROM user_profiles WHERE username = $1`,
    [session.username]
  );

  return NextResponse.json({
    name: session.name,
    role: session.role,
    username: session.username,
    email: rows[0]?.email ?? "",
    phone: rows[0]?.phone ?? "",
    avatar: rows[0]?.avatar ?? null,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { email, phone } = await req.json();

  await query(
    `INSERT INTO user_profiles (username, email, phone, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (username) DO UPDATE
     SET email = EXCLUDED.email, phone = EXCLUDED.phone, updated_at = NOW()`,
    [session.username, email ?? "", phone ?? ""]
  );

  return NextResponse.json({ ok: true });
}

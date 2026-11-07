import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { avatar } = await req.json();

  // avatar é uma data URL base64 (já redimensionada para 200x200 no cliente)
  if (!avatar || !avatar.startsWith("data:image/")) {
    return NextResponse.json({ error: "invalid image" }, { status: 400 });
  }

  await query(
    `INSERT INTO user_profiles (username, avatar, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (username) DO UPDATE
     SET avatar = EXCLUDED.avatar, updated_at = NOW()`,
    [session.username, avatar]
  );

  return NextResponse.json({ ok: true, avatar });
}

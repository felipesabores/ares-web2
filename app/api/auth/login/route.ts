import { NextRequest, NextResponse } from "next/server";
import { findUser } from "@/lib/users";
import { createSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Campos obrigatórios" }, { status: 400 });
  }

  const user = findUser(username, password);
  if (!user) {
    return NextResponse.json({ error: "Usuário ou senha incorretos" }, { status: 401 });
  }

  await createSession({ username: user.username, name: user.name, role: user.role, cnpjs: user.cnpjs });

  return NextResponse.json({ ok: true, name: user.name, role: user.role });
}

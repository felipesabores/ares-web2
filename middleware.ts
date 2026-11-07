import { NextRequest, NextResponse } from "next/server";
import { sessionSecret } from "@/lib/env";
import { jwtVerify } from "jose";


const PUBLIC_PATHS = ["/login", "/api/auth/login"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Permite rotas públicas e assets
  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/logo")
  ) {
    return NextResponse.next();
  }

  const token = req.cookies.get("ares_session")?.value;

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const { payload } = await jwtVerify(token, sessionSecret());
    const role = payload.role as string;

    // Rotas universais (todos os roles autenticados)
    const universal =
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/api/profile") ||
      pathname.startsWith("/api/sync-status");
    if (universal) return NextResponse.next();

    if (role === "cliente") {
      const allowed = pathname.startsWith("/cliente") || pathname.startsWith("/api/performance");
      if (!allowed) return NextResponse.redirect(new URL("/cliente", req.url));
    }

    if (role === "responsavel") {
      const allowed =
        pathname.startsWith("/performance") ||
        pathname.startsWith("/sla-entregas") ||
        pathname.startsWith("/api/performance") ||
        pathname.startsWith("/api/sla-entregas");
      if (!allowed) return NextResponse.redirect(new URL("/performance", req.url));
    }

    if (role === "operacional") {
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/performance") ||
        pathname.startsWith("/sla-entregas") ||
        pathname.startsWith("/api/performance") ||
        pathname.startsWith("/api/sla-entregas");
      if (!allowed) return NextResponse.redirect(new URL("/performance", req.url));
    }

    if (role === "comercial") {
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/comercial") ||
        pathname.startsWith("/sla-entregas") ||
        pathname.startsWith("/api/comercial") ||
        pathname.startsWith("/api/sla-entregas");
      if (!allowed) return NextResponse.redirect(new URL("/comercial", req.url));
    }

    if (role === "diretor-comercial") {
      const allowed =
        pathname === "/" ||
        pathname.startsWith("/performance") ||
        pathname.startsWith("/comercial") ||
        pathname.startsWith("/sla-entregas") ||
        pathname.startsWith("/api/performance") ||
        pathname.startsWith("/api/comercial") ||
        pathname.startsWith("/api/sla-entregas");
      if (!allowed) return NextResponse.redirect(new URL("/comercial", req.url));
    }

    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete("ares_session");
    return res;
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

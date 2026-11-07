"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Sun, Moon } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [dark, setDark]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Usuário ou senha incorretos"); return; }
      router.push("/"); router.refresh();
    } finally { setLoading(false); }
  }

  const bg      = dark ? "bg-[#0d0d10]" : "bg-white";
  const text    = dark ? "text-gray-100" : "text-gray-800";
  const sub     = dark ? "text-white/30"  : "text-gray-400";
  const inp     = dark
    ? "bg-white/5 border-white/10 text-white placeholder:text-white/20 focus:border-amber-400/50"
    : "bg-gray-50 border-gray-200 text-gray-900 placeholder:text-gray-300 focus:border-amber-400 focus:bg-white";
  const divider = dark ? "border-white/5" : "border-gray-100";

  return (
    <div className="flex min-h-screen overflow-hidden">

      {/* ── ESQUERDA: branding ── */}
      <div className="relative hidden lg:flex lg:w-[58%] overflow-hidden bg-[#0d1117]">

        {/* Glow de fundo */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_#1a2233_0%,_#0d1117_70%)]" />

        {/* Grade decorativa sutil */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: "linear-gradient(#f59e0b 1px, transparent 1px), linear-gradient(90deg, #f59e0b 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />

        {/* Divisor direito */}
        <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-amber-400/25 to-transparent" />

        {/* Branding centralizado */}
        <div className="relative z-10 flex flex-col items-center justify-center h-full w-full px-12 text-center">
          <Image
            src="/logo.png"
            alt="Acerta Express"
            width={312}
            height={312}
            className="drop-shadow-2xl"
            style={{ objectFit: "contain" }}
          />
        </div>
      </div>

      {/* ── DIREITA: formulário ── */}
      <div className={`flex-1 flex flex-col items-center justify-center px-8 py-12 relative transition-colors duration-300 ${bg}`}>

        {/* Toggle */}
        <button
          onClick={() => setDark(d => !d)}
          className={`absolute top-5 right-5 p-2 rounded-full transition-colors ${
            dark
              ? "bg-white/8 hover:bg-white/15 text-white/40 hover:text-white/70"
              : "bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600"
          }`}
        >
          {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Logo mobile */}
        <div className="flex flex-col items-center mb-10 lg:hidden">
          <Image src="/logo.png" alt="ARES" width={100} height={100} />
        </div>

        <div className="w-full max-w-[300px]">

          <div className="mb-8">
            <h2 className={`text-2xl font-bold tracking-tight ${text}`}>Entrar</h2>
            <p className={`text-xs mt-1 ${sub}`}>Acesso ao painel operacional</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${sub}`}>Usuário</label>
              <input
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="seu.usuario"
                className={`w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 ${inp}`}
              />
            </div>

            <div className="space-y-1.5">
              <label className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${sub}`}>Senha</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full border rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200 ${inp}`}
              />
            </div>

            {error && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="w-full bg-amber-500 hover:bg-amber-400 active:bg-amber-600 disabled:opacity-30 disabled:cursor-not-allowed text-black font-bold text-sm rounded-xl py-3.5 transition-all duration-200 shadow-lg shadow-amber-500/20 hover:shadow-amber-400/35 mt-1"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Entrando...
                </span>
              ) : "Entrar"}
            </button>
          </form>

          <div className={`mt-10 pt-5 border-t text-center text-[10px] tracking-wider ${divider} ${sub}`}>
            Acerta Express © {new Date().getFullYear()}
          </div>
        </div>
      </div>

    </div>
  );
}

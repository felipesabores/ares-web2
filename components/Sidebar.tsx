"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import {
  ClipboardCheck, ExternalLink, FileText,
  X, Package, Plane, Truck, TrendingUp, Building2, RefreshCw, BarChart2, Gauge,
  ChevronUp, Camera, Activity, LogOut, User,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Performance Diária",    icon: <TrendingUp  className="w-4 h-4" />, href: "/performance",           adminOnly: false },
  { label: "Comercial",             icon: <TrendingUp  className="w-4 h-4" />, href: "/comercial",             adminOnly: false },
  { label: "Resultado Financeiro",  icon: <BarChart2   className="w-4 h-4" />, href: "/resultado-financeiro",  adminOnly: true  },
  { label: "SLA de Entregas",       icon: <Gauge       className="w-4 h-4" />, href: "/sla-entregas",          adminOnly: false },
  { label: "Emissões",              icon: <FileText    className="w-4 h-4" />, href: "/emissoes",              adminOnly: false },
  { label: "Coletas",            icon: <Package         className="w-4 h-4" />, href: "/coletas",  adminOnly: false },
  { label: "AWBs",               icon: <Plane           className="w-4 h-4" />, href: "/awbs",     adminOnly: false },
  { label: "Remessas",           icon: <Truck           className="w-4 h-4" />, href: "/remessas", adminOnly: false },
  { label: "Canhotos",           icon: <ClipboardCheck  className="w-4 h-4" />, href: "/canhotos", adminOnly: false },
  { label: "Portal Cliente",     icon: <Building2       className="w-4 h-4" />, href: "/cliente",  adminOnly: false },
];

const EXTERNAL_ITEMS = [
  { label: "Grafana", icon: <ExternalLink className="w-4 h-4" />, href: "https://grafana.acertaexpress.app" },
];

function formatSyncTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

interface SidebarProps {
  onClose: () => void;
  userRole?: string;
  userName?: string;
  roleLoaded?: boolean;
}

export default function Sidebar({ onClose, userRole = "", userName = "—", roleLoaded = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Profile dropdown
  const [profileOpen, setProfileOpen] = useState(false);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSync = () => {
      fetch("/api/sync-status").then(r => r.json()).then(d => setLastSync(d.last)).catch(() => {});
    };
    loadSync();
    const t = setInterval(loadSync, 60_000);
    return () => clearInterval(t);
  }, []);

  // Load avatar
  useEffect(() => {
    fetch("/api/profile")
      .then(r => r.json())
      .then(d => { if (d.avatar) setAvatar(d.avatar); })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAvatarUploading(true);
    try {
      // Resize to 200x200 client-side
      const img = document.createElement("img");
      const url = URL.createObjectURL(file);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d")!;
      // Center crop
      const size = Math.min(img.width, img.height);
      const sx = (img.width - size) / 2;
      const sy = (img.height - size) / 2;
      ctx.drawImage(img, sx, sy, size, size, 0, 0, 200, 200);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL("image/webp", 0.85);

      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatar: dataUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        setAvatar(data.avatar);
      }
    } catch {
      // silent fail
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const itemBase = "flex items-center gap-2.5 py-2.5 px-3 mx-1.5 rounded-lg text-[13px] hover-ares transition-colors border-0 bg-transparent text-left w-[calc(100%-12px)]";

  const isAdmin = userRole === "admin";

  return (
    <aside className="flex flex-col h-screen bg-ares border-r border-ares shrink-0 z-50 overflow-hidden w-72 shadow-2xl">

      {/* Logo + fechar */}
      <div className="flex items-center px-4 gap-3 border-b border-ares shrink-0 py-4">
        <div className="w-16 h-16 rounded-2xl overflow-hidden shrink-0">
          <Image
            src="/logo.png" alt="ARES" width={64} height={83}
            className="w-full"
            style={{ objectFit: "cover", objectPosition: "top center", marginTop: "-1px" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xl font-bold text-ares-1 tracking-widest leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            ARES
          </div>
          <div className="text-[11px] text-ares-4 uppercase tracking-widest truncate mt-0.5">Acerta Express</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-white/10 text-ares-4 hover:text-ares-1 transition-colors shrink-0"
          aria-label="Fechar menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex flex-col flex-1 overflow-y-auto py-2">
        {!roleLoaded && (
          <div className="flex flex-col gap-1 px-1.5 py-1" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-[42px] mx-1.5 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        )}
        {roleLoaded && !!userRole && NAV_ITEMS.filter(item => {
          if (userRole === "cliente") return item.href === "/cliente";
          if (userRole === "responsavel") return item.href === "/performance" || item.href === "/sla-entregas";
          if (userRole === "operacional") return item.href === "/performance" || item.href === "/sla-entregas";
          if (userRole === "diretor-comercial") return item.href === "/performance" || item.href === "/comercial" || item.href === "/sla-entregas";
          if (userRole === "comercial") return item.href === "/comercial" || item.href === "/sla-entregas";
          if (item.adminOnly && userRole !== "admin") return false;
          return true;
        }).map(item => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={`${itemBase} ${active ? "bg-ares-surface border-l-2 border-amber-400 pl-2.5!" : ""}`}
              style={{ color: active ? "#f59e0b" : undefined }}
            >
              <span className="shrink-0 text-ares-3" style={active ? { color: "#f59e0b" } : {}}>{item.icon}</span>
              <span className={`truncate ${active ? "" : "text-ares-3"}`}>{item.label}</span>
            </Link>
          );
        })}

        {roleLoaded && !!userRole && userRole !== "cliente" && (
          <>
            <div className="my-2 mx-3 border-t border-ares" />
            {EXTERNAL_ITEMS.map(item => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`${itemBase} text-ares-3`}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </a>
            ))}
          </>
        )}
      </nav>

      {/* Sync — só para internos */}
      {roleLoaded && !!userRole && userRole !== "cliente" && (
        <div className="px-3 py-2 border-t border-ares shrink-0">
          <div className="flex items-center gap-1.5 text-[10px] text-ares-4">
            <RefreshCw className="w-3 h-3 shrink-0" />
            <span className="truncate">Sync: {formatSyncTime(lastSync)}</span>
          </div>
        </div>
      )}

      {/* Usuário — com dropdown */}
      <div className="relative shrink-0" ref={dropdownRef}>
        {/* Dropdown popover */}
        {profileOpen && (
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-[var(--c-panel)] border border-[var(--c-border)] rounded-lg shadow-xl overflow-hidden z-[60] animate-slide-up">
            {/* Avatar section */}
            <div className="p-3 border-b border-[var(--c-border)]">
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <div className="w-12 h-12 rounded-full overflow-hidden bg-amber-500/20 border-2 border-amber-500/30 flex items-center justify-center shrink-0">
                    {avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-amber-400" />
                    )}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    disabled={avatarUploading}
                  >
                    {avatarUploading ? (
                      <RefreshCw className="w-4 h-4 text-white animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 text-white" />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ares-1 truncate">{userName}</div>
                  <div className="text-[11px] text-ares-4 capitalize">{userRole}</div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[10px] text-amber-400 hover:text-amber-300 mt-0.5 transition-colors"
                  >
                    {avatar ? "Trocar foto" : "Adicionar foto"}
                  </button>
                </div>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1">
              {userName === "felipe" && (
                <Link
                  href="/system-health"
                  onClick={() => { setProfileOpen(false); onClose(); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-ares-3 hover:bg-[var(--c-panel-hover)] hover:text-ares-1 transition-colors"
                >
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>System Health</span>
                  <span className="ml-auto text-[9px] bg-emerald-500/15 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-semibold">
                    LIVE
                  </span>
                </Link>
              )}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-ares-3 hover:bg-red-500/10 hover:text-red-400 transition-colors w-full text-left"
              >
                <LogOut className="w-4 h-4" />
                <span>Sair</span>
              </button>
            </div>
          </div>
        )}

        {/* User area button */}
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center w-full px-3 py-3 border-t border-ares hover:bg-[var(--c-panel-hover)] transition-colors group"
        >
          <div className="w-7 h-7 rounded-full overflow-hidden bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-bold text-amber-400">
                {userName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="ml-2 min-w-0 text-left">
            <div className="text-xs font-semibold text-ares-2 truncate">{userName}</div>
            <div className="text-[10px] text-ares-4 truncate capitalize">{userRole}</div>
          </div>
          <ChevronUp className={`w-3.5 h-3.5 text-ares-4 ml-auto shrink-0 transition-transform duration-200 ${profileOpen ? "" : "rotate-180"}`} />
        </button>
      </div>
    </aside>
  );
}

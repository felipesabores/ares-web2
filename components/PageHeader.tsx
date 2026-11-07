"use client";

import { RefreshCw, Calendar, X, Sun, Moon, Menu, Building2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ThemeProvider";
import { LiveClock, MonthPicker, currentMonth } from "@/components/charts";
import { useMobileMenuToggle } from "@/components/AppShell";
import { useRouter } from "next/navigation";
import { GlobalSearch } from "@/components/GlobalSearch";
import { useEffect, useState } from "react";

interface PageHeaderProps {
  title: React.ReactNode;
  showMonthPicker?: boolean;
  month?: string;
  onMonthChange?: (m: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  lastSync?: string;
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  showMonthPicker = false,
  month = "",
  onMonthChange,
  onRefresh,
  refreshing = false,
  lastSync = "",
  children,
}: PageHeaderProps) {
  const { theme, toggle } = useTheme();
  const openMobileMenu = useMobileMenuToggle();
  const router = useRouter();
  const [clienteName, setClienteName] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [avatar, setAvatar] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.json()).then(d => {
      if (d.user?.role === "cliente") setClienteName(d.user.name);
      if (d.user?.role) setUserRole(d.user.role);
      if (d.user?.name) setUserName(d.user.name);
    }).catch(() => {});

    // Load avatar
    fetch("/api/profile").then(r => r.json()).then(d => {
      if (d.avatar) setAvatar(d.avatar);
    }).catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <header
      className="shrink-0 flex items-center gap-2 md:gap-4 px-4 md:px-6 border-b border-ares z-40 bg-ares-header"
      style={{ height: 56 }}
    >
      {/* Hamburger — escondido para clientes */}
      {!clienteName && (
        <button
          className="p-1.5 rounded-md text-ares-3 hover:text-ares-1 hover:bg-white/10 transition-colors shrink-0"
          onClick={openMobileMenu}
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Page title */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <h1
          className="text-sm font-bold text-ares-1 tracking-widest uppercase truncate"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
        {clienteName ? (
          <div className="flex items-center gap-1.5 ml-2 bg-amber-500/15 border border-amber-500/30 rounded-lg px-2.5 py-1 shrink-0">
            <Building2 className="w-3 h-3 text-amber-400 shrink-0" />
            <span className="text-[11px] font-semibold text-amber-300 tracking-wide">{clienteName}</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 ml-2">
            <div className="relative w-1.5 h-1.5">
              <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
              <div className="relative w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
            <span className="text-[10px] text-emerald-400">Ao vivo</span>
          </div>
        )}
      </div>

      {/* Month picker (optional) */}
      {showMonthPicker && onMonthChange && (
        <div className="hidden md:flex items-center gap-2">
          <Calendar className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          {month ? (
            <MonthPicker value={month} onChange={m => onMonthChange(m)} />
          ) : (
            <span className="text-[11px] text-ares-4 bg-ares-surface px-2 py-1 rounded border border-ares-input">
              Todos os períodos
            </span>
          )}
          {month && (
            <button
              onClick={() => onMonthChange("")}
              className="flex items-center gap-1 text-[10px] text-ares-4 hover:text-amber-400 transition-colors"
            >
              <X className="w-3 h-3" /> Limpar
            </button>
          )}
          {!month && (
            <button
              onClick={() => onMonthChange(currentMonth())}
              className="flex items-center gap-1 text-[10px] text-ares-4 hover:text-amber-400 transition-colors"
            >
              <Calendar className="w-3 h-3" /> Filtrar mês
            </button>
          )}
        </div>
      )}

      {/* Global search — só para internos com acesso amplo */}
      {!clienteName && userRole !== "diretor-comercial" && userRole !== "operacional" && userRole !== "comercial" && <GlobalSearch />}

      {/* Extra controls slot */}
      {children}

      {/* Clock + theme toggle + refresh + avatar */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <div className="hidden md:block"><LiveClock /></div>
        <Button
          size="sm" variant="outline"
          className="border-white/10 bg-white/5 hover:bg-white/10 text-xs h-8 w-8 p-0"
          onClick={toggle}
          title={theme === "dark" ? "Modo claro" : "Modo escuro"}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </Button>
        {onRefresh && (
          <Button
            size="sm" variant="outline"
            className="border-white/10 bg-white/5 hover:bg-white/10 text-xs h-8 gap-1.5"
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{lastSync ? `Sync ${lastSync}` : "Atualizar"}</span>
          </Button>
        )}

        {/* Avatar — abre sidebar no clique (internos) ou faz logout (clientes) */}
        <button
          onClick={clienteName ? handleLogout : openMobileMenu}
          className="relative w-8 h-8 rounded-full overflow-hidden bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 hover:ring-2 hover:ring-amber-500/40 transition-all group"
          title={clienteName ? "Sair" : userName || "Perfil"}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            userName ? (
              <span className="text-[11px] font-bold text-amber-400 group-hover:text-amber-300 transition-colors">
                {userName.charAt(0).toUpperCase()}
              </span>
            ) : (
              <User className="w-3.5 h-3.5 text-amber-400" />
            )
          )}
        </button>
      </div>
    </header>
  );
}

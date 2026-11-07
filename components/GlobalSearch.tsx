"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search, X, FileText, ClipboardCheck, Loader2,
  Plane, Package, Truck, Clock, History,
} from "lucide-react";

/* ─── Types ───────────────────────────────────────────────────────────────── */
interface Result {
  tipo: string;
  id: string;
  principal: string;
  secundario: string;
  uf: string;
  data: string;
  prev_entrega: string;
  servico: string;
  ref: string;
  status: string;
}
interface Results {
  emissoes: Result[];
  canhotos: Result[];
  awbs: Result[];
  coletas: Result[];
  remessas: Result[];
}

/* ─── Config por tipo ─────────────────────────────────────────────────────── */
const TIPO_CONFIG: Record<string, { label: string; icon: React.ReactNode; href: string; color: string }> = {
  cte:     { label: "CTe em Trânsito", icon: <FileText className="w-4 h-4" />,      href: "/performance", color: "#f59e0b" },
  canhoto: { label: "Canhotos",        icon: <ClipboardCheck className="w-4 h-4" />, href: "/canhotos",    color: "#3b82f6" },
  awb:     { label: "AWBs",            icon: <Plane className="w-4 h-4" />,          href: "/awbs",        color: "#8b5cf6" },
  coleta:  { label: "Coletas",         icon: <Package className="w-4 h-4" />,        href: "/coletas",     color: "#10b981" },
  remessa: { label: "Remessas",        icon: <Truck className="w-4 h-4" />,          href: "/remessas",    color: "#06b6d4" },
};

/* ─── Status badge ────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    atraso:      { label: "Em Atraso",   color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
    hoje:        { label: "Entrega Hoje",color: "#f59e0b", bg: "rgba(245,158,11,0.15)" },
    em_transito: { label: "Em Trânsito", color: "#3b82f6", bg: "rgba(59,130,246,0.15)" },
    entregue:    { label: "Entregue",    color: "#10b981", bg: "rgba(16,185,129,0.15)" },
    aberto:      { label: "Aberto",      color: "#ef4444", bg: "rgba(239,68,68,0.15)" },
    encerrado:   { label: "Encerrado",   color: "#10b981", bg: "rgba(16,185,129,0.15)" },
    finalizado:  { label: "Finalizado",  color: "#10b981", bg: "rgba(16,185,129,0.15)" },
  };
  const s = map[status] ?? map[status.toLowerCase()];
  if (!s) return null;
  return (
    <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 shrink-0"
      style={{ color: s.color, background: s.bg }}>
      {s.label}
    </span>
  );
}

/* ─── Result Row ──────────────────────────────────────────────────────────── */
function ResultRow({ result, active, onClick }: { result: Result; active: boolean; onClick: () => void }) {
  const cfg = TIPO_CONFIG[result.tipo];
  const isAtraso = result.status === "atraso";

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 border-b border-ares text-left transition-colors ${active ? "bg-amber-500/10" : "hover:bg-white/5"}`}
    >
      <span style={{ color: cfg?.color ?? "#888" }} className="shrink-0">{cfg?.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-mono text-sm font-bold ${isAtraso ? "text-red-400" : "text-amber-400"}`}>
            {result.id || "—"}
          </span>
          {result.uf && (
            <span className="text-[10px] bg-white/10 rounded px-1.5 py-0.5 text-ares-3">{result.uf}</span>
          )}
          {result.servico && (
            <span className="text-[10px] text-ares-4">{result.servico}</span>
          )}
          <StatusBadge status={result.status} />
          {result.prev_entrega && (
            <span className="text-[10px] text-ares-4 flex items-center gap-1 ml-auto shrink-0">
              <Clock className="w-3 h-3" />
              {result.prev_entrega?.slice(0, 10)}
            </span>
          )}
        </div>
        <div className="text-xs text-ares-2 truncate">{result.principal || "—"}</div>
        {result.secundario && (
          <div className="text-[11px] text-ares-4 truncate">{result.secundario}</div>
        )}
      </div>
    </button>
  );
}

/* ─── Group ───────────────────────────────────────────────────────────────── */
function Group({ tipo, results, activeIdx, baseIdx, onSelect }: {
  tipo: string; results: Result[]; activeIdx: number; baseIdx: number; onSelect: (r: Result) => void;
}) {
  if (!results.length) return null;
  const cfg = TIPO_CONFIG[tipo];
  return (
    <div>
      <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest flex items-center gap-1.5"
        style={{ color: cfg?.color, background: cfg?.color + "0d" }}>
        {cfg?.icon}
        {cfg?.label} · {results.length}
      </div>
      {results.map((r, i) => (
        <ResultRow key={i} result={r} active={activeIdx === baseIdx + i} onClick={() => onSelect(r)} />
      ))}
    </div>
  );
}

/* ─── GlobalSearch ────────────────────────────────────────────────────────── */
const HISTORY_KEY = "ares_search_history";
const MAX_HISTORY = 6;

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActive] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flatten results para navegação por teclado
  const flat: Result[] = results
    ? [
        ...(results.emissoes ?? []),
        ...(results.canhotos ?? []),
        ...(results.awbs ?? []),
        ...(results.coletas ?? []),
        ...(results.remessas ?? []),
      ]
    : [];

  const groupBases = results ? {
    cte:     0,
    canhoto: (results.emissoes?.length ?? 0),
    awb:     (results.emissoes?.length ?? 0) + (results.canhotos?.length ?? 0),
    coleta:  (results.emissoes?.length ?? 0) + (results.canhotos?.length ?? 0) + (results.awbs?.length ?? 0),
    remessa: (results.emissoes?.length ?? 0) + (results.canhotos?.length ?? 0) + (results.awbs?.length ?? 0) + (results.coletas?.length ?? 0),
  } : { cte: 0, canhoto: 0, awb: 0, coleta: 0, remessa: 0 };

  // Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setOpen(o => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Abre/fecha
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      const h = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
      setHistory(h);
    } else {
      setQuery(""); setResults(null); setActive(0);
    }
  }, [open]);

  // Busca
  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.results);
      setActive(0);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => search(val), 300);
  };

  // Navegar com teclado
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, flat.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && flat[activeIdx]) { handleSelect(flat[activeIdx]); }
  };

  // Selecionar resultado
  const handleSelect = (r: Result) => {
    const cfg = TIPO_CONFIG[r.tipo];
    if (cfg) {
      // Salva no histórico
      const h = [query, ...history.filter(x => x !== query)].slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
      router.push(cfg.href);
      setOpen(false);
    }
  };

  const totalResults = flat.length;
  const hasResults = totalResults > 0;

  if (!open) return (
    <button
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 text-xs text-ares-4 hover:text-ares-2 bg-ares-surface border border-ares rounded-lg px-3 py-1.5 transition-colors"
      title="Busca global (⌘K)"
    >
      <Search className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Buscar...</span>
      <kbd className="hidden sm:inline text-[10px] bg-white/5 border border-ares rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl bg-ares-panel border border-ares rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-ares">
          {loading
            ? <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
            : <Search className="w-4 h-4 text-ares-4 shrink-0" />
          }
          <input
            ref={inputRef}
            value={query}
            onChange={handleChange}
            placeholder="Minuta, cliente, CTE, AWB, NF..."
            className="flex-1 bg-transparent text-sm text-ares-1 placeholder:text-ares-4 outline-none"
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults(null); inputRef.current?.focus(); }}
              className="text-ares-4 hover:text-ares-2 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setOpen(false)} className="text-ares-4 hover:text-ares-2 transition-colors ml-1">
            <kbd className="text-[10px] bg-white/5 border border-ares rounded px-1.5 py-0.5 font-mono">Esc</kbd>
          </button>
        </div>

        {/* Conteúdo */}
        <div className="max-h-[60vh] overflow-y-auto">

          {/* Histórico (quando input vazio) */}
          {!query && history.length > 0 && (
            <div>
              <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-ares-4 flex items-center gap-1.5">
                <History className="w-3 h-3" />Buscas recentes
              </div>
              {history.map((h, i) => (
                <button key={i} onClick={() => { setQuery(h); search(h); }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-ares-3 hover:bg-white/5 hover:text-ares-1 transition-colors text-left border-b border-ares/50">
                  <History className="w-3.5 h-3.5 text-ares-4 shrink-0" />
                  {h}
                </button>
              ))}
            </div>
          )}

          {/* Dica quando input vazio e sem histórico */}
          {!query && !history.length && (
            <div className="px-4 py-8 text-center text-sm text-ares-4">
              <Search className="w-8 h-8 mx-auto mb-3 opacity-30" />
              Digite para buscar em CTes, canhotos, AWBs, coletas e remessas
            </div>
          )}

          {/* Sem resultados */}
          {query.length >= 2 && !loading && !hasResults && results && (
            <div className="px-4 py-8 text-center text-sm text-ares-4">
              Nenhum resultado para <span className="text-ares-2 font-semibold">&quot;{query}&quot;</span>
            </div>
          )}

          {/* Resultados agrupados */}
          {hasResults && results && (
            <>
              <Group tipo="cte"     results={results.emissoes ?? []} activeIdx={activeIdx} baseIdx={groupBases.cte}     onSelect={handleSelect} />
              <Group tipo="canhoto" results={results.canhotos ?? []} activeIdx={activeIdx} baseIdx={groupBases.canhoto} onSelect={handleSelect} />
              <Group tipo="awb"     results={results.awbs     ?? []} activeIdx={activeIdx} baseIdx={groupBases.awb}     onSelect={handleSelect} />
              <Group tipo="coleta"  results={results.coletas  ?? []} activeIdx={activeIdx} baseIdx={groupBases.coleta}  onSelect={handleSelect} />
              <Group tipo="remessa" results={results.remessas ?? []} activeIdx={activeIdx} baseIdx={groupBases.remessa} onSelect={handleSelect} />
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-ares text-[10px] text-ares-4 flex items-center gap-4">
          <span><kbd className="font-mono bg-white/5 border border-ares rounded px-1">↑↓</kbd> navegar</span>
          <span><kbd className="font-mono bg-white/5 border border-ares rounded px-1">Enter</kbd> abrir página</span>
          {hasResults && <span className="ml-auto">{totalResults} resultado{totalResults !== 1 ? "s" : ""}</span>}
        </div>
      </div>
    </div>
  );
}

"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useState, useCallback } from "react";

/* ─── Styles ─────────────────────────────────────────────────────────────── */
const fSelectCls =
  "bg-ares-surface border border-ares-input rounded-md text-xs text-ares-2 px-3 py-1.5 outline-none focus:border-amber-500/50 transition-colors cursor-pointer appearance-none pr-7 w-full";
const chevronSvg =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E\")";

/* ─── Types ──────────────────────────────────────────────────────────────── */
export interface FilterDef<K extends string = string> {
  key: K;
  label: string;
  value: string;
  options: [string, string][];
}

interface FilterBarProps<K extends string = string> {
  filters: FilterDef<K>[];
  onChange: (key: K, val: string) => void;
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function FilterBar<K extends string>({ filters, onChange }: FilterBarProps<K>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeCount = filters.filter(f => f.value !== "").length;

  const clearAll = useCallback(() => {
    filters.forEach(f => {
      if (f.value !== "") onChange(f.key, "");
    });
  }, [filters, onChange]);

  return (
    <>
      {/* ── Desktop: inline filters (hidden on small screens) ── */}
      <div className="hidden md:flex sticky top-0 z-30 bg-ares-panel border-b border-ares px-4 sm:px-6 py-2.5 items-center gap-6 flex-wrap shrink-0">
        {filters.map(f => (
          <div key={f.key} className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-ares-4 uppercase tracking-widest whitespace-nowrap">
              {f.label}
            </span>
            <div className="relative">
              <select
                value={f.value}
                onChange={e => onChange(f.key, e.target.value)}
                className={fSelectCls}
                style={{
                  backgroundImage: chevronSvg,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 8px center",
                  minWidth: 140,
                }}
              >
                {f.options.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      {/* ── Mobile: filter icon button (visible only on small screens) ── */}
      <div className="md:hidden sticky top-0 z-30 bg-ares-panel border-b border-ares px-4 py-2 shrink-0">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center gap-2 text-xs text-ares-2 hover:text-ares-1 transition-colors px-3 py-2 rounded-lg bg-ares-surface border border-ares-input"
        >
          <SlidersHorizontal className="w-4 h-4 text-amber-500" />
          <span className="font-medium">Filtros</span>
          {activeCount > 0 && (
            <span className="ml-1 bg-amber-500 text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Mobile: filter drawer overlay ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />

          {/* Drawer panel — slides from bottom */}
          <div className="absolute bottom-0 left-0 right-0 bg-ares-panel border-t border-ares rounded-t-2xl max-h-[80vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-ares">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-semibold text-ares-1">Filtros</span>
                {activeCount > 0 && (
                  <span className="bg-amber-500 text-black text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {activeCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-ares-3 hover:text-ares-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter selects — stacked vertically */}
            <div className="px-5 py-4 space-y-4">
              {filters.map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-semibold text-ares-4 uppercase tracking-widest mb-1.5">
                    {f.label}
                  </label>
                  <div className="relative">
                    <select
                      value={f.value}
                      onChange={e => onChange(f.key, e.target.value)}
                      className={fSelectCls}
                      style={{
                        backgroundImage: chevronSvg,
                        backgroundRepeat: "no-repeat",
                        backgroundPosition: "right 8px center",
                      }}
                    >
                      {f.options.map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-5 py-4 border-t border-ares flex items-center gap-3">
              {activeCount > 0 && (
                <button
                  onClick={clearAll}
                  className="flex-1 text-xs text-ares-3 hover:text-red-400 transition-colors py-2.5 rounded-lg border border-ares-input"
                >
                  Limpar filtros
                </button>
              )}
              <button
                onClick={() => setMobileOpen(false)}
                className="flex-1 text-xs font-semibold text-black bg-amber-500 hover:bg-amber-400 transition-colors py-2.5 rounded-lg"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

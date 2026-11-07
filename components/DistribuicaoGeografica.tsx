"use client";

import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/components/ThemeProvider";
import { MapPin } from "lucide-react";

const GEO_URL =
  "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.geojson";

const NAME_TO_UF: Record<string, string> = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amapa": "AP",
  "Amazonas": "AM", "Bahia": "BA", "Ceará": "CE", "Ceara": "CE",
  "Distrito Federal": "DF", "Espírito Santo": "ES", "Espirito Santo": "ES",
  "Goiás": "GO", "Goias": "GO", "Maranhão": "MA", "Maranhao": "MA",
  "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG",
  "Pará": "PA", "Para": "PA", "Paraíba": "PB", "Paraiba": "PB",
  "Paraná": "PR", "Parana": "PR", "Pernambuco": "PE",
  "Piauí": "PI", "Piaui": "PI", "Rio de Janeiro": "RJ",
  "Rio Grande do Norte": "RN", "Rio Grande do Sul": "RS",
  "Rondônia": "RO", "Rondonia": "RO", "Roraima": "RR",
  "Santa Catarina": "SC", "São Paulo": "SP", "Sao Paulo": "SP",
  "Sergipe": "SE", "Tocantins": "TO",
};

const UF_REGIAO: Record<string, string> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

const REGIAO_COR: Record<string, string> = {
  "Norte": "#1D9E75", "Nordeste": "#EF9F27", "Centro-Oeste": "#7F77DD",
  "Sudeste": "#378ADD", "Sul": "#D4537E",
};

/* ─── Types ──────────────────────────────────────────────────────────────── */
interface UFRow {
  uf: string; faturamento: number; resultado: number; peso: number; valor_nf: number; total: number;
}
interface Totais {
  faturamento: number; resultado: number; peso: number; valor_nf: number; total: number;
}
interface RegiaoAgg {
  regiao: string; cor: string; frete: number; lucro: number; peso: number; valorNf: number; total: number;
  ufs: { uf: string; frete: number; lucro: number }[];
}

/* ─── Formatters ─────────────────────────────────────────────────────────── */
const brl = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const brlCompact = (v: number) => {
  if (Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " mi";
  if (Math.abs(v) >= 1e3) return "R$ " + Math.round(v / 1e3).toLocaleString("pt-BR") + " mil";
  return "R$ " + Math.round(v).toLocaleString("pt-BR");
};
const kg = (v: number) => Math.round(v).toLocaleString("pt-BR") + " kg";
const dec2 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
const margColor = (m: number) => (m < 20 ? "#ef4444" : m < 40 ? "#f97316" : "#10b981");

/* ─── Component ──────────────────────────────────────────────────────────── */
export default function DistribuicaoGeografica({
  por_uf, totais, loading,
}: { por_uf: UFRow[]; totais?: Totais; loading: boolean }) {
  const { theme } = useTheme();
  const emptyFill   = theme === "dark" ? "#3a3a4a" : "#c8d6e8";
  const strokeColor = theme === "dark" ? "#18181b" : "#ffffff";
  const tipBg       = theme === "dark" ? "#27272a" : "#ffffff";
  const tipBorder   = theme === "dark" ? "#3f3f46" : "#e2e8f0";
  const tipText     = theme === "dark" ? "#ffffff" : "#0f172a";

  const [open, setOpen] = useState<string | null>(null);
  const [anchorTop, setAnchorTop] = useState(0);
  const [popTop, setPopTop] = useState(0);
  const [tooltip, setTooltip] = useState<{ name: string; uf: string; x: number; y: number } | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const popRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Dados por UF (tooltip) e agregação por região
  const ufData: Record<string, { frete: number; lucro: number; margem: number }> = {};
  const byReg: Record<string, RegiaoAgg> = {};
  for (const r of por_uf) {
    const uf = (r.uf || "").toUpperCase();
    const reg = UF_REGIAO[uf];
    if (!reg) continue;
    ufData[uf] = { frete: r.faturamento, lucro: r.resultado, margem: r.faturamento > 0 ? (r.resultado / r.faturamento) * 100 : 0 };
    if (!byReg[reg]) byReg[reg] = { regiao: reg, cor: REGIAO_COR[reg], frete: 0, lucro: 0, peso: 0, valorNf: 0, total: 0, ufs: [] };
    const a = byReg[reg];
    a.frete += r.faturamento; a.lucro += r.resultado; a.peso += r.peso; a.valorNf += r.valor_nf; a.total += r.total;
    a.ufs.push({ uf, frete: r.faturamento, lucro: r.resultado });
  }
  const regioes = Object.values(byReg).sort((a, b) => b.frete - a.frete);
  const totalFrete = regioes.reduce((s, a) => s + a.frete, 0);

  // Médias gerais de referência (a partir dos totais da página)
  const medRkg = totais && totais.peso > 0 ? totais.faturamento / totais.peso : 0;
  const medMargem = totais && totais.faturamento > 0 ? (totais.resultado / totais.faturamento) * 100 : 0;
  const medPf = totais && totais.valor_nf > 0 ? (totais.faturamento / totais.valor_nf) * 100 : 0;

  useLayoutEffect(() => {
    if (!open || !wrapRef.current || !popRef.current) return;
    const wrapH = wrapRef.current.clientHeight;
    const popH = popRef.current.offsetHeight;
    setPopTop(Math.max(0, Math.min(anchorTop, wrapH - popH)));
  }, [open, anchorTop]);

  const activeReg = open ? byReg[open] : null;

  function toggle(regiao: string, el: HTMLElement) {
    if (open === regiao) { setOpen(null); return; }
    setAnchorTop(el.offsetTop);
    setOpen(regiao);
  }

  function RegionDetail({ r }: { r: RegiaoAgg }) {
    const share = totalFrete > 0 ? (r.frete / totalFrete) * 100 : 0;
    const pf = r.valorNf > 0 ? (r.frete / r.valorNf) * 100 : 0;
    const rkg = r.peso > 0 ? r.frete / r.peso : 0;
    const margem = r.frete > 0 ? (r.lucro / r.frete) * 100 : 0;
    const top3 = [...r.ufs].sort((a, b) => b.frete - a.frete).slice(0, 3);
    const Row = ({ l, v }: { l: string; v: React.ReactNode }) => (
      <div className="flex items-center justify-between gap-3 py-[3px] text-[12px]">
        <span className="text-ares-3">{l}</span>
        <span className="font-semibold text-ares-1 tabular-nums text-right">{v}</span>
      </div>
    );
    return (
      <>
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-ares-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: r.cor }} />{r.regiao}
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-md whitespace-nowrap"
            style={{ background: "rgba(56,138,221,0.15)", color: "#60a5fa" }}>{pct(share)} do frete</span>
        </div>
        <Row l="Frete total" v={brl(r.frete)} />
        <Row l="Valor NF total" v={brlCompact(r.valorNf)} />
        <Row l="Peso total" v={kg(r.peso)} />
        <Row l="% de frete" v={<>{pct(pf)} <span className="text-ares-4 font-normal">(méd {pct(medPf)})</span></>} />
        <Row l="R$/kg" v={<>{dec2(rkg)} <span className="text-ares-4 font-normal">(méd {dec2(medRkg)})</span></>} />
        <div className="border-t border-ares my-2" />
        <Row l="Lucro (LUCRO LIQ)" v={brl(r.lucro)} />
        <div className="flex items-center justify-between gap-3 py-[3px] text-[12px]">
          <span className="text-ares-3">Margem</span>
          <span className="tabular-nums text-right">
            <span className="font-semibold" style={{ color: margColor(margem) }}>{pct(margem)}</span>
            <span className="text-ares-4 ml-1">(méd {pct(medMargem)})</span>
          </span>
        </div>
        <div className="border-t border-ares my-2" />
        <div className="text-[11px] text-ares-3 leading-relaxed">
          <span className="text-ares-4">Top UFs: </span>
          {top3.map((u, i) => (
            <span key={u.uf}>{i > 0 ? " · " : ""}{u.uf} {brlCompact(u.frete)}</span>
          ))}
        </div>
      </>
    );
  }

  return (
    <Card className="bg-ares-panel border-ares">
      <CardHeader className="pb-2 pt-4 px-5 flex flex-row items-center justify-between">
        <CardTitle className="text-[11px] text-ares-3 uppercase tracking-widest font-semibold flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-sky-400" />
          Desempenho por Região do Brasil
        </CardTitle>
        <span className="text-[11px] text-ares-4">por região · UF de destino</span>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-1">
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : regioes.length === 0 ? (
          <p className="text-sm text-ares-4 py-10 text-center">Sem dados no período.</p>
        ) : (
          <div className="flex flex-col md:flex-row gap-5 items-center" onMouseLeave={() => setTooltip(null)}>
            {/* Mapa real */}
            <div className="w-full md:w-[52%] shrink-0">
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 480, center: [-54, -14] }}
                width={500}
                height={380}
                style={{ width: "100%", height: "auto" }}
              >
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const name = geo.properties.name as string;
                      const uf = NAME_TO_UF[name] ?? "";
                      const reg = UF_REGIAO[uf];
                      const has = uf in ufData;
                      // Cor da região SEMPRE que a UF pertencer a uma região (todas as 27
                      // pertencem), tenha dado ou não. A distinção "com/sem dado" fica só
                      // na opacidade abaixo (has ? 1 : 0.55) — assim TO e outros estados de
                      // baixo volume nunca somem do mapa nem perdem a cor da sua região.
                      const base = reg ? REGIAO_COR[reg] : emptyFill;
                      const dimmed = !!open && reg !== open;
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={base}
                          stroke={strokeColor}
                          strokeWidth={0.7}
                          style={{
                            // Cor da região uniforme (opacidade cheia) tenha dado ou não —
                            // assim TO fica idêntico aos vizinhos do Norte. O dim só ocorre
                            // quando outra região está selecionada. A info "sem dado" vai no tooltip.
                            default: { outline: "none", opacity: dimmed ? 0.28 : 1 },
                            hover: { outline: "none", opacity: 1, cursor: "pointer" },
                            pressed: { outline: "none" },
                          }}
                          // Dispara pra TODOS os estados (com ou sem dado). Antes só disparava
                          // pros com dado, e o onMouseMove arrastava o tooltip do estado anterior
                          // por cima do sem-dado → nome errado (ex.: "Maranhão" ao passar no TO).
                          onMouseEnter={(e: React.MouseEvent) => setTooltip({ name, uf, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e: React.MouseEvent) => setTooltip(prev => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null))}
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>

              {tooltip && (
                <div
                  className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-xl"
                  style={{ background: tipBg, border: `1px solid ${tipBorder}`, left: tooltip.x + 14, top: tooltip.y - 52 }}
                >
                  <div className="font-semibold" style={{ color: tipText }}>
                    {tooltip.name} <span className="text-ares-4">({tooltip.uf})</span>
                  </div>
                  {ufData[tooltip.uf] ? (
                    <>
                      <div className="mt-0.5 tabular-nums" style={{ color: tipText }}>{brl(ufData[tooltip.uf].frete)}</div>
                      <div className="tabular-nums" style={{ color: margColor(ufData[tooltip.uf].margem) }}>
                        margem {pct(ufData[tooltip.uf].margem)}
                      </div>
                    </>
                  ) : (
                    <div className="mt-0.5 text-ares-4">sem movimento no período</div>
                  )}
                </div>
              )}
            </div>

            {/* Chips por região + detalhe */}
            <div ref={wrapRef} className="flex-1 min-w-0 relative w-full flex flex-col gap-2">
              {regioes.map((r) => {
                const share = totalFrete > 0 ? (r.frete / totalFrete) * 100 : 0;
                const margem = r.frete > 0 ? (r.lucro / r.frete) * 100 : 0;
                const on = open === r.regiao;
                return (
                  <div key={r.regiao}>
                    <button
                      onClick={(e) => toggle(r.regiao, e.currentTarget)}
                      className={`flex flex-col gap-2 w-full text-left px-3 py-2.5 rounded-lg transition-colors
                        ${on ? "bg-ares-surface border-2 border-amber-400/60" : "border border-ares hover:bg-ares-surface"}`}
                    >
                      <span className="flex items-center gap-3 w-full">
                        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: r.cor }} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-semibold text-ares-1">{r.regiao}</span>
                          <span className="block text-[11px] text-ares-4">{pct(share)} do total</span>
                        </span>
                      </span>
                      <span className="grid grid-cols-4 gap-x-4 pl-6 w-full">
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ares-4">Faturamento</span>
                          <span className="text-[12px] font-semibold text-ares-1 tabular-nums">{brlCompact(r.frete)}</span>
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ares-4">Resultado</span>
                          <span className="text-[12px] font-semibold tabular-nums" style={{ color: margColor(margem) }}>{brlCompact(r.lucro)}</span>
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ares-4">Margem</span>
                          <span className="text-[12px] font-semibold tabular-nums" style={{ color: margColor(margem) }}>{pct(margem)}</span>
                        </span>
                        <span className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-ares-4">Valor NF</span>
                          <span className="text-[12px] font-semibold text-ares-1 tabular-nums">{brlCompact(r.valorNf)}</span>
                        </span>
                      </span>
                    </button>
                    {/* Mobile: detalhe inline abaixo do chip ativo */}
                    {on && isMobile && (
                      <div className="mt-1 bg-ares-panel border border-ares-input rounded-xl px-4 py-3">
                        <RegionDetail r={r} />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Desktop: popover flutuante à esquerda dos chips */}
              {activeReg && !isMobile && (
                <div
                  ref={popRef}
                  className="absolute z-20 w-[236px] bg-ares-panel border border-ares-input rounded-xl shadow-2xl px-4 py-3"
                  style={{ top: popTop, right: "calc(100% + 12px)" }}
                >
                  <RegionDetail r={activeReg} />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

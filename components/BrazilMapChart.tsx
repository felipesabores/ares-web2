"use client";

import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3 } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";

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

// Região de cada UF + cor da região. Usado só quando emptyByRegion=true, pra
// pintar estados sem dado com a cor da sua região (em vez do cinza vazio).
// Espelha o mapeamento de DistribuicaoGeografica.tsx.
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

interface ChartItem { [key: string]: string | number }

function interpolateColor(t: number): string {
  // 0 = medium blue (#4d9de0) → 1 = bright amber (#f59e0b)
  const r = Math.round(77  + t * (245 - 77));
  const g = Math.round(157 + t * (158 - 157));
  const b = Math.round(224 + t * (11  - 224));
  return `rgb(${r},${g},${b})`;
}

// Escala divergente: vermelho (negativo máx) → cinza (#6b7280) → verde (positivo máx)
function interpolateDiverging(t: number): string {
  // t ∈ [-1, 1]; 0 = neutro
  const mid = { r: 107, g: 114, b: 128 }; // cinza slate-500
  if (t >= 0) {
    // cinza → verde (#10b981)
    const r = Math.round(mid.r + t * (16  - mid.r));
    const g = Math.round(mid.g + t * (185 - mid.g));
    const b = Math.round(mid.b + t * (129 - mid.b));
    return `rgb(${r},${g},${b})`;
  } else {
    // cinza → vermelho (#ef4444)
    const abs = -t;
    const r = Math.round(mid.r + abs * (239 - mid.r));
    const g = Math.round(mid.g + abs * (68  - mid.g));
    const b = Math.round(mid.b + abs * (68  - mid.b));
    return `rgb(${r},${g},${b})`;
  }
}

interface Props {
  data: ChartItem[];
  loading: boolean;
  onSelect?: (uf: string) => void;
  selectedUF?: string | null;
  title?: string;
  valueLabel?: string;        // sufixo no tooltip; default "emissões"
  valueFormatter?: (v: number) => string;  // formatador do total; default toLocaleString pt-BR
  diverging?: boolean;        // usa escala vermelho-cinza-verde para valores negativos/positivos
  emptyByRegion?: boolean;    // estados sem dado ganham a cor da região (em vez do cinza vazio)
}

export default function BrazilMapChart({
  data, loading, onSelect, selectedUF,
  title = "Emissões por UF Destino",
  valueLabel = "emissões",
  valueFormatter,
  diverging = false,
  emptyByRegion = false,
}: Props) {
  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString("pt-BR"));
  const { theme } = useTheme();
  const emptyFill   = theme === "dark" ? "#3a3a4a" : "#c8d6e8";
  const strokeColor = theme === "dark" ? "#18181b" : "#ffffff";
  const tooltipBg   = theme === "dark" ? "#27272a" : "#ffffff";
  const tooltipBorder = theme === "dark" ? "#3f3f46" : "#e2e8f0";
  const tooltipText   = theme === "dark" ? "#ffffff" : "#0f172a";

  const [tooltip, setTooltip] = useState<{
    name: string; uf: string; total: number; x: number; y: number;
  } | null>(null);

  const ufMap = Object.fromEntries(data.map(d => [String(d.uf), Number(d.total)]));
  const values = data.map(d => Number(d.total));
  const max = diverging
    ? Math.max(...values.map(Math.abs), 1)
    : Math.max(...values, 1);

  const top5 = [...data]
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 6);

  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-5 px-5">
        <CardTitle className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
          <BarChart3 className="inline w-3.5 h-3.5 mr-1.5 text-blue-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col flex-1 px-5 pb-5 pt-3 min-h-0">
        {loading ? (
          <Skeleton className="h-64 w-full bg-white/5" />
        ) : (
          <div className="flex flex-col gap-3 flex-1 min-h-0">
            {/* Mapa */}
            <div className="flex-1 flex items-center justify-center min-h-0" onMouseLeave={() => setTooltip(null)}>
            <div className="relative w-full">
              <ComposableMap
                projection="geoMercator"
                projectionConfig={{ scale: 420, center: [-54, -16] }}
                width={500}
                height={320}
                style={{ width: "100%", height: "auto" }}
              >
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const name  = geo.properties.name as string;
                      const uf    = NAME_TO_UF[name] ?? "";
                      const total = ufMap[uf] ?? 0;
                      const hasData = uf in ufMap;
                      const regionFill = emptyByRegion && UF_REGIAO[uf] ? REGIAO_COR[UF_REGIAO[uf]] : emptyFill;
                      const fill = !hasData
                        ? regionFill
                        : diverging
                          ? interpolateDiverging(max > 0 ? total / max : 0)
                          : total > 0 ? interpolateColor(total / max) : regionFill;

                      const isSelected = selectedUF ? selectedUF === uf : false;
                      const activeFill = isSelected ? "#f59e0b" : fill;

                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          fill={activeFill}
                          stroke={isSelected ? "#f59e0b" : strokeColor}
                          strokeWidth={isSelected ? 1.5 : 0.7}
                          style={{
                            default: { outline: "none" },
                            hover:   { fill: "#f59e0b", outline: "none", cursor: onSelect && uf ? "pointer" : "default" },
                            pressed: { outline: "none" },
                          }}
                          onClick={() => onSelect && uf && onSelect(uf)}
                          onMouseEnter={(e: React.MouseEvent) =>
                            setTooltip({ name, uf, total, x: e.clientX, y: e.clientY })
                          }
                          onMouseMove={(e: React.MouseEvent) =>
                            setTooltip(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                          }
                        />
                      );
                    })
                  }
                </Geographies>
              </ComposableMap>

              {/* Tooltip */}
              {tooltip && (
                <div
                  className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-xl"
                  style={{
                    background: tooltipBg,
                    border: `1px solid ${tooltipBorder}`,
                    left: tooltip.x + 14,
                    top:  tooltip.y - 44,
                  }}
                >
                  <div className="font-semibold" style={{ color: tooltipText }}>
                    {tooltip.name}
                    {tooltip.uf && <span className="text-slate-400 ml-1.5">({tooltip.uf})</span>}
                  </div>
                  <div className="mt-0.5 tabular-nums" style={{ color: diverging ? (tooltip.total >= 0 ? "#10b981" : "#ef4444") : "#60a5fa" }}>
                    {valueLabel
                      ? `${fmt(tooltip.total)} ${valueLabel}`
                      : fmt(tooltip.total)}
                  </div>
                </div>
              )}

              {/* Legenda de cor */}
              {diverging ? (
                <div className="flex items-center gap-2 mt-2 px-1">
                  <span className="text-[10px] text-red-400">{fmt(-max)}</span>
                  <div
                    className="flex-1 h-1.5 rounded-full"
                    style={{ background: "linear-gradient(to right, #ef4444, #6b7280, #10b981)" }}
                  />
                  <span className="text-[10px] text-emerald-400">{fmt(max)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-2 px-1">
                  <span className="text-[10px] text-slate-600">0</span>
                  <div
                    className="flex-1 h-1.5 rounded-full"
                    style={{ background: `linear-gradient(to right, ${emptyFill}, #4d9de0, #f59e0b)` }}
                  />
                  <span className="text-[10px] text-slate-600">{fmt(max)}</span>
                </div>
              )}
            </div>
            </div>

            {/* Ranking horizontal */}
            <div className="flex gap-3">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider self-center whitespace-nowrap">Top UFs</div>
              <div className="flex-1 grid grid-cols-3 sm:grid-cols-6 gap-2">
                {top5.map((d, i) => {
                  const val = Number(d.total);
                  const pct = max > 0 ? Math.round((Math.abs(val) / max) * 100) : 0;
                  const barColor = diverging
                    ? interpolateDiverging(max > 0 ? val / max : 0)
                    : interpolateColor(pct / 100);
                  return (
                    <div key={i} className={`space-y-1 ${i >= 3 ? "hidden sm:block" : ""}`}>
                      <div className="flex items-center justify-between text-[11px] gap-1">
                        <span className="text-slate-300 font-mono font-bold shrink-0">
                          <span className="text-[9px] text-slate-500 mr-0.5">#{i + 1}</span>{d.uf}
                        </span>
                        <span className="text-[9px] tabular-nums truncate" style={{ color: diverging ? (val >= 0 ? "#10b981" : "#ef4444") : "#94a3b8" }}>
                          {fmt(val)}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: barColor }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

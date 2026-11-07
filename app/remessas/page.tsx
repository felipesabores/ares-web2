"use client";

import { useEffect, useState, useCallback } from "react";
import { Truck, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { KpiCard, SimpleTable, type TableColumn } from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";

interface RemessaRow {
  numero: string; data: string; cliente: string; destinatario: string;
  destino: string; uf: string; peso: string; volumes: string;
  responsavel: string; status: string;
}

export default function RemessasPage() {
  const [total, setTotal]     = useState(0);
  const [rows, setRows]       = useState<RemessaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState("");

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await fetch("/api/remessas").then(r => r.json());
      setTotal(data.total ?? 0);
      setRows(data.rows ?? []);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Build UF distribution from rows
  const byUF: Record<string, number> = {};
  rows.forEach(r => { if (r.uf) byUF[r.uf] = (byUF[r.uf] ?? 0) + 1; });
  const topUFs = Object.entries(byUF).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxUF  = topUFs[0]?.[1] ?? 1;

  const columns: TableColumn[] = [
    { key: "numero",      label: "Nº Remessa",   className: "font-mono text-amber-400" },
    { key: "data",        label: "Data" },
    { key: "cliente",     label: "Cliente" },
    { key: "destinatario",label: "Destinatário" },
    { key: "destino",     label: "Destino" },
    { key: "uf",          label: "UF",           className: "text-center",
      render: (v) => v ? <Badge variant="outline" className="text-[10px] border-ares text-ares-3 px-1.5">{String(v)}</Badge> : <span className="text-ares-4">—</span> },
    { key: "peso",        label: "Peso",         className: "text-right font-mono text-ares-3" },
    { key: "volumes",     label: "Vol.",         className: "text-center text-ares-3" },
    { key: "responsavel", label: "Responsável" },
    { key: "status",      label: "Status" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={<>Remessas <span className="text-amber-400">·</span> Romaneios</>}
        onRefresh={fetchAll}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">

        {/* KPI */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Total Remessas" value={total}
            icon={<Truck className="w-5 h-5"/>} color="#06b6d4" loading={loading}
          />
          <KpiCard
            title="UFs na Base" value={Object.keys(byUF).length}
            icon={<Package className="w-5 h-5"/>} color="#8b5cf6" loading={loading}
          />
        </div>

        {/* UF ranking + table */}
        {topUFs.length > 0 && (
          <div className="panel rounded-xl p-5">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4">
              Top UFs por Volume de Remessas
            </div>
            <div className="space-y-3">
              {topUFs.map(([uf, count]) => {
                const pct = Math.round((count / maxUF) * 100);
                return (
                  <div key={uf} className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="font-mono font-bold text-ares-2">{uf}</span>
                      <span className="font-mono tabular-nums text-cyan-400">{count.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-cyan-500/70 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <SimpleTable
          columns={columns}
          data={rows as unknown as Record<string, string | number | null>[]}
          loading={loading}
          searchKeys={["numero", "cliente", "destinatario", "destino", "uf"]}
          title={<><Truck className="w-3.5 h-3.5 text-cyan-400" />Relação de Remessas</>}
          maxHeight="32rem"
        />

        <div className="border-t border-ares pt-3 pb-1 text-[11px] text-ares-4">
          ARES Intelligence © {new Date().getFullYear()} — Acerta Express
        </div>
      </main>
    </div>
  );
}

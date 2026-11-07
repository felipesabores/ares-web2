"use client";

import { useEffect, useState, useCallback } from "react";
import { Plane, Package, CheckCircle2, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  KpiCard, DonutChart, SimpleTable,
  type ChartItem, type TableColumn,
} from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";

interface AwbRow {
  awb: string; data: string; minuta: string; destino: string;
  volumes: string; peso: string; status: string;
}

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  "Entregue":    { color: "#10b981", bg: "rgba(16,185,129,0.1)",  border: "rgba(16,185,129,0.4)" },
  "Disponível":  { color: "#3b82f6", bg: "rgba(59,130,246,0.1)",  border: "rgba(59,130,246,0.4)" },
  "Inserido":    { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)",  border: "rgba(139,92,246,0.4)" },
  "Retirado CIA":{ color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.4)" },
  "Outros":      { color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.4)" },
};

export default function AwbsPage() {
  const [byStatus, setByStatus] = useState<ChartItem[]>([]);
  const [rows, setRows]         = useState<AwbRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState("");

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summary, tabela] = await Promise.all([
        fetch("/api/awbs").then(r => r.json()),
        fetch("/api/awbs/tabela").then(r => r.json()),
      ]);
      setByStatus(summary);
      setRows(tabela);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const total     = byStatus.reduce((s, d) => s + (d.total as number), 0);
  const entregues = (byStatus.find(d => d.status === "Entregue")?.total as number) ?? 0;
  const disponiveis = (byStatus.find(d => d.status === "Disponível")?.total as number) ?? 0;
  const inseridos = (byStatus.find(d => d.status === "Inserido")?.total as number) ?? 0;

  const columns: TableColumn[] = [
    { key: "awb",     label: "AWB",     className: "font-mono text-amber-400" },
    { key: "data",    label: "Data" },
    { key: "minuta",  label: "Minuta",  className: "font-mono text-ares-3" },
    { key: "destino", label: "Destino" },
    { key: "volumes", label: "Vol.",    className: "text-center" },
    { key: "peso",    label: "Peso",    className: "text-right font-mono" },
    {
      key: "status", label: "Status",
      render: (v) => {
        const val = String(v ?? "—");
        const s = STATUS_STYLES[val] ?? STATUS_STYLES["Outros"];
        return (
          <Badge variant="outline" className="text-[10px] px-2"
            style={{ color: s.color, background: s.bg, borderColor: s.border }}>
            {val}
          </Badge>
        );
      },
    },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={<>AWBs <span className="text-amber-400">·</span> Aéreos</>}
        onRefresh={fetchAll}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Total AWBs" value={total}
            icon={<Plane className="w-5 h-5"/>} color="#0d9488" loading={loading}
          />
          <KpiCard
            title="Entregues" value={entregues}
            icon={<CheckCircle2 className="w-5 h-5"/>} color="#10b981" loading={loading}
          />
          <KpiCard
            title="Disponíveis" value={disponiveis}
            icon={<Package className="w-5 h-5"/>} color="#3b82f6" loading={loading}
          />
          <KpiCard
            title="Inseridos" value={inseridos}
            icon={<Clock className="w-5 h-5"/>} color="#8b5cf6" loading={loading}
          />
        </div>

        {/* Donut */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DonutChart
            data={byStatus} nameKey="status" valueKey="total"
            label={<><Plane className="inline w-3.5 h-3.5 mr-1.5 text-teal-400" />AWBs por Status</>}
            loading={loading}
          />
          <div className="panel rounded-xl p-5 flex flex-col gap-3">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Distribuição de Status</div>
            {loading ? (
              <div className="space-y-3 mt-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-8 rounded-lg bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : (
              byStatus.map((d, i) => {
                const pct = total > 0 ? Math.round(((d.total as number) / total) * 100) : 0;
                const s = STATUS_STYLES[String(d.status)] ?? STATUS_STYLES["Outros"];
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-ares-2">{d.status}</span>
                      <span className="font-mono tabular-nums" style={{ color: s.color }}>
                        {Number(d.total).toLocaleString("pt-BR")} <span className="text-ares-4 text-[10px]">({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5">
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Table */}
        <SimpleTable
          columns={columns}
          data={rows as unknown as Record<string, string | number | null>[]}
          loading={loading}
          searchKeys={["awb", "minuta", "destino"]}
          title={<><Plane className="w-3.5 h-3.5 text-teal-400" />Relação de AWBs</>}
          maxHeight="28rem"
        />

        <div className="border-t border-ares pt-3 pb-1 text-[11px] text-ares-4">
          ARES Intelligence © {new Date().getFullYear()} — Acerta Express
        </div>
      </main>
    </div>
  );
}

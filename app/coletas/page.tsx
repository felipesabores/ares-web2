"use client";

import { useEffect, useState, useCallback } from "react";
import { Package, CheckCircle2, Clock, TrendingUp, Users, Badge as BadgeIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  KpiCard, HBarChart, DonutChart, SimpleTable,
  type ChartItem, type TableColumn,
} from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";

interface ColetasKpis { total: number; finalizadas: number; pendentes: number }
interface ColetaRow { numero: string; data: string; cliente: string; responsavel: string; status: string; destino: string; observacao: string }

export default function ColetasPage() {
  const [kpis, setKpis]         = useState<ColetasKpis | null>(null);
  const [byResp, setByResp]     = useState<ChartItem[]>([]);
  const [rows, setRows]         = useState<ColetaRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState("");

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [summary, tabela] = await Promise.all([
        fetch("/api/coletas").then(r => r.json()),
        fetch("/api/coletas/tabela").then(r => r.json()),
      ]);
      setByResp(summary);
      setKpis(tabela.kpis);
      setRows(tabela.rows);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const taxa = kpis && kpis.total > 0
    ? Math.round((kpis.finalizadas / kpis.total) * 100)
    : 0;

  // Build status donut from table rows
  const byStatus: ChartItem[] = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      const s = r.status || "Pendente";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([status, total]) => ({ status, total })).sort((a, b) => (b.total as number) - (a.total as number));

  const STATUS_COLORS: Record<string, { color: string; bg: string; border: string }> = {
    "FINALIZADA": { color: "#10b981", bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.4)" },
    "Pendente":   { color: "#f59e0b", bg: "rgba(245,158,11,0.1)",  border: "rgba(245,158,11,0.4)" },
  };

  const columns: TableColumn[] = [
    { key: "numero",      label: "Nº Coleta",    className: "font-mono text-amber-400" },
    { key: "data",        label: "Data" },
    { key: "cliente",     label: "Cliente" },
    { key: "responsavel", label: "Responsável" },
    { key: "destino",     label: "Destino" },
    {
      key: "status", label: "Status",
      render: (v) => {
        const val = String(v ?? "—");
        const s = STATUS_COLORS[val];
        return (
          <Badge variant="outline" className="text-[10px] px-2"
            style={s ? { color: s.color, background: s.bg, borderColor: s.border } : {}}>
            {val}
          </Badge>
        );
      },
    },
    { key: "observacao", label: "Observação" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={<>Coletas <span className="text-amber-400">·</span> Gestão de Coletas</>}
        onRefresh={fetchAll}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Total Coletas" value={kpis?.total ?? 0}
            icon={<Package className="w-5 h-5"/>} color="#8b5cf6" loading={loading}
          />
          <KpiCard
            title="Finalizadas" value={kpis?.finalizadas ?? 0}
            icon={<CheckCircle2 className="w-5 h-5"/>} color="#10b981" loading={loading}
          />
          <KpiCard
            title="Pendentes" value={kpis?.pendentes ?? 0}
            icon={<Clock className="w-5 h-5"/>} color="#f59e0b" loading={loading}
          />
          <KpiCard
            title="Taxa Conclusão" value={loading ? "—" : `${taxa}%`}
            icon={<TrendingUp className="w-5 h-5"/>} color="#06b6d4" loading={loading}
            sub="coletas finalizadas"
          />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HBarChart
            data={byResp} xKey="responsavel" barKey="total" color="#8b5cf6"
            label={<><Users className="inline w-3.5 h-3.5 mr-1.5 text-violet-400" />Por Responsável</>}
            loading={loading}
          />
          <DonutChart
            data={byStatus} nameKey="status" valueKey="total"
            label={<><BadgeIcon className="inline w-3.5 h-3.5 mr-1.5 text-amber-400" />Por Status</>}
            loading={loading}
          />
        </div>

        {/* Table */}
        <SimpleTable
          columns={columns}
          data={rows as unknown as Record<string, string | number | null>[]}
          loading={loading}
          searchKeys={["numero", "cliente", "responsavel", "destino"]}
          title={<><Package className="w-3.5 h-3.5 text-violet-400" />Relação de Coletas</>}
          maxHeight="28rem"
        />

        <div className="border-t border-ares pt-3 pb-1 text-[11px] text-ares-4">
          ARES Intelligence © {new Date().getFullYear()} — Acerta Express
        </div>
      </main>
    </div>
  );
}

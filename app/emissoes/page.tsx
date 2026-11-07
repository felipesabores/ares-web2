"use client";

import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { FileText, AlertTriangle, CheckCircle2, Package, TrendingUp, Activity } from "lucide-react";
import {
  KpiCard, HBarChart, DonutChart, CTETable, TimelineChart,
  type ChartItem, type CTERow,
} from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";

const BrazilMapChart = dynamic(() => import("@/components/BrazilMapChart"), { ssr: false });

interface EmissoesData {
  byUF: ChartItem[];
  byServico: ChartItem[];
  atrasoUF: ChartItem[];
}

export default function EmissoesPage() {
  const [emissoes, setEmissoes] = useState<EmissoesData | null>(null);
  const [timeline, setTimeline] = useState<ChartItem[]>([]);
  const [cte, setCte]           = useState<CTERow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync] = useState("");
  const [month, setMonth]       = useState("");

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const q = month ? `?month=${month}` : "";
      const [e, tl, ct] = await Promise.all([
        fetch(`/api/emissoes${q}`).then(r => r.json()),
        fetch(`/api/emissoes/timeline${q}`).then(r => r.json()),
        fetch(`/api/cte${q}`).then(r => r.json()),
      ]);
      setEmissoes(e);
      setTimeline(tl);
      setCte(ct);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);

  useEffect(() => { setLoading(true); fetchAll(); }, [fetchAll]);

  // KPIs derivados da tabela CTE
  const totalEmissoes = cte.length;
  const entregues     = cte.filter(r => r.status === "Entregue").length;
  const pendentes     = cte.filter(r => r.status !== "Entregue").length;
  const totalUFs      = new Set(cte.map(r => r.uf).filter(Boolean)).size;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={<>Emissões <span className="text-amber-400">·</span> Relação de CTe</>}
        showMonthPicker
        month={month}
        onMonthChange={m => { setMonth(m); setLoading(true); }}
        onRefresh={fetchAll}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Total Emissões" value={totalEmissoes}
            icon={<FileText className="w-5 h-5"/>} color="#3b82f6" loading={loading}
          />
          <KpiCard
            title="Entregues" value={entregues}
            icon={<CheckCircle2 className="w-5 h-5"/>} color="#10b981" loading={loading}
          />
          <KpiCard
            title="Pendentes" value={pendentes}
            icon={<Package className="w-5 h-5"/>} color="#f59e0b" loading={loading}
          />
          <KpiCard
            title="UFs Atendidas" value={totalUFs}
            icon={<TrendingUp className="w-5 h-5"/>} color="#8b5cf6" loading={loading}
          />
        </div>

        {/* Mapa + Timeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BrazilMapChart data={emissoes?.byUF ?? []} loading={loading} />
          <TimelineChart
            data={timeline} xKey="data" yKey="total" color="#3b82f6"
            label={<><TrendingUp className="inline w-3.5 h-3.5 mr-1.5 text-blue-400" />Emissões por Dia</>}
            loading={loading}
          />
        </div>

        {/* Serviço + Atraso */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DonutChart
            data={emissoes?.byServico ?? []} nameKey="servico" valueKey="total"
            label={<><Activity className="inline w-3.5 h-3.5 mr-1.5 text-amber-400" />Tipo de Serviço</>}
            loading={loading}
          />
          <HBarChart
            data={emissoes?.atrasoUF ?? []} xKey="uf" barKey="total" color="#ef4444"
            label={<><AlertTriangle className="inline w-3.5 h-3.5 mr-1.5 text-red-400" />Atraso por UF</>}
            loading={loading}
          />
        </div>

        {/* Tabela */}
        <CTETable data={cte} loading={loading} />

        <div className="border-t border-ares pt-3 pb-1 text-[11px] text-ares-4">
          ARES Intelligence © {new Date().getFullYear()} — Acerta Express
        </div>
      </main>
    </div>
  );
}

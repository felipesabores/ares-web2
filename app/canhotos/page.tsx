"use client";

import { useEffect, useState, useCallback } from "react";
import { ClipboardCheck, AlertCircle, CheckCircle2, Tag, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  KpiCard, DonutChart, SimpleTable, EmptyState,
  type ChartItem, type TableColumn,
} from "@/components/charts";
import { PageHeader } from "@/components/PageHeader";

interface CanhotoKpis { total: number; abertos: number; encerrados: number }
interface CanhotoRow { minuta: string; cliente: string; data: string; status: string; solicitante: string; observacao: string }
interface SACItem { tipo?: string; atendente?: string; total: number }

const STATUS_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  "ABERTO":     { color: "#ef4444", bg: "rgba(239,68,68,0.1)",    border: "rgba(239,68,68,0.4)" },
  "ENCERRADO":  { color: "#10b981", bg: "rgba(16,185,129,0.1)",   border: "rgba(16,185,129,0.4)" },
  "FINALIZADO": { color: "#10b981", bg: "rgba(16,185,129,0.1)",   border: "rgba(16,185,129,0.4)" },
};

const PIZZA_COLORS = ["#f59e0b","#ef4444","#3b82f6","#8b5cf6","#14b8a6","#f97316","#06b6d4","#eab308","#ec4899","#10b981"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PizzaTip({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const pct = total > 0 ? ((payload[0].value / total) * 100).toFixed(1) : "0";
  return (
    <div className="bg-ares-panel border border-ares rounded-lg p-2.5 text-xs shadow-xl">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: payload[0].payload.fill }} />
        <span className="text-ares-3 max-w-[180px] truncate">{payload[0].name}</span>
        <span className="font-mono font-bold text-ares-1">{payload[0].value}</span>
        <span className="text-ares-4">({pct}%)</span>
      </span>
    </div>
  );
}

function SACPizza({ title, icon, data, nameKey, loading }: {
  title: string; icon: React.ReactNode;
  data: SACItem[]; nameKey: "tipo" | "atendente"; loading: boolean;
}) {
  const total = data.reduce((s, r) => s + r.total, 0);
  const slices = data.map((r, i) => ({
    name: r[nameKey] ?? "—",
    value: r.total,
    fill: PIZZA_COLORS[i % PIZZA_COLORS.length],
  }));

  return (
    <Card className="panel border-0 h-full flex flex-col">
      <CardHeader className="pb-0 pt-4 px-4 shrink-0">
        <CardTitle className="text-[10px] font-semibold text-ares-3 uppercase tracking-widest flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">{icon}{title}</span>
          {total > 0 && <span className="font-mono font-bold text-ares-1 text-sm normal-case">{total}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col items-center justify-center px-1 pb-2 pt-0">
        {loading && !data.length
          ? <Skeleton className="h-36 w-36 rounded-full bg-white/5" />
          : data.length === 0
            ? <EmptyState label="Sem SAC em aberto" />
            : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={slices} cx="50%" cy="43%" innerRadius={45} outerRadius={72}
                    dataKey="value" strokeWidth={0} paddingAngle={2} labelLine={false}
                    label={({ percent }: { percent?: number }) => (percent ?? 0) > 0.04 ? `${((percent ?? 0) * 100).toFixed(0)}%` : ""}>
                    {slices.map((s, i) => <Cell key={i} fill={s.fill} />)}
                  </Pie>
                  <Tooltip content={<PizzaTip total={total} />} />
                  <Legend iconType="circle" iconSize={7}
                    formatter={v => <span className="text-[9px] text-ares-3">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )
        }
      </CardContent>
    </Card>
  );
}

export default function CanhotoPage() {
  const [kpis, setKpis]           = useState<CanhotoKpis | null>(null);
  const [byStatus, setByStatus]   = useState<ChartItem[]>([]);
  const [byTipo, setByTipo]       = useState<SACItem[]>([]);
  const [byAtendente, setByAtend] = useState<SACItem[]>([]);
  const [rows, setRows]           = useState<CanhotoRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSync, setLastSync]   = useState("");

  const fetchAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [stats, tabela] = await Promise.all([
        fetch("/api/canhotos").then(r => r.json()),
        fetch("/api/canhotos/tabela").then(r => r.json()),
      ]);
      setKpis(stats.kpis);
      setByStatus(stats.byStatus);
      setByTipo(stats.byTipo ?? []);
      setByAtend(stats.byAtendente ?? []);
      setRows(tabela);
      setLastSync(new Date().toLocaleTimeString("pt-BR"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const taxa = kpis && kpis.total > 0
    ? Math.round((kpis.encerrados / kpis.total) * 100)
    : 0;

  const columns: TableColumn[] = [
    { key: "minuta",      label: "Minuta",      className: "font-mono text-amber-400" },
    { key: "data",        label: "Data" },
    { key: "cliente",     label: "Cliente" },
    { key: "solicitante", label: "Solicitante" },
    {
      key: "status", label: "Status",
      render: (v) => {
        const val = String(v ?? "—").toUpperCase();
        const s = STATUS_STYLES[val];
        return s ? (
          <Badge variant="outline" className="text-[10px] px-2"
            style={{ color: s.color, background: s.bg, borderColor: s.border }}>
            {val}
          </Badge>
        ) : (
          <span className="text-ares-3 text-[11px]">{val}</span>
        );
      },
    },
    { key: "observacao", label: "Observação" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <PageHeader
        title={<>Canhotos <span className="text-amber-400">·</span> SAC & Ocorrências</>}
        onRefresh={fetchAll}
        refreshing={refreshing}
        lastSync={lastSync}
      />

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-4">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Total Canhotos" value={kpis?.total ?? 0}
            icon={<ClipboardCheck className="w-5 h-5"/>} color="#f59e0b" loading={loading}
          />
          <KpiCard
            title="Em Aberto" value={kpis?.abertos ?? 0}
            icon={<AlertCircle className="w-5 h-5"/>} color="#ef4444" loading={loading}
          />
          <KpiCard
            title="Encerrados" value={kpis?.encerrados ?? 0}
            icon={<CheckCircle2 className="w-5 h-5"/>} color="#10b981" loading={loading}
          />
          <KpiCard
            title="Taxa Resolução" value={loading ? "—" : `${taxa}%`}
            icon={<ClipboardCheck className="w-5 h-5"/>} color="#06b6d4" loading={loading}
            sub="canhotos encerrados"
          />
        </div>

        {/* Row 2: Status donut + Pizzas por Tipo e Atendente */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <DonutChart
            data={byStatus} nameKey="status" valueKey="total"
            label={<><ClipboardCheck className="inline w-3.5 h-3.5 mr-1.5 text-amber-400" />Por Status</>}
            loading={loading}
          />
          <SACPizza
            title="Abertos por Tipo"
            icon={<Tag className="w-3.5 h-3.5 text-amber-400" />}
            data={byTipo} nameKey="tipo" loading={loading}
          />
          <SACPizza
            title="Abertos por Atendente"
            icon={<Users className="w-3.5 h-3.5 text-blue-400" />}
            data={byAtendente} nameKey="atendente" loading={loading}
          />
        </div>

        {/* Table */}
        <SimpleTable
          columns={columns}
          data={rows as unknown as Record<string, string | number | null>[]}
          loading={loading}
          searchKeys={["minuta", "cliente", "solicitante"]}
          title={<><ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />Relação de Canhotos</>}
          maxHeight="28rem"
          exportFilename="canhotos"
        />

        <div className="border-t border-ares pt-3 pb-1 text-[11px] text-ares-4">
          ARES Intelligence © {new Date().getFullYear()} — Acerta Express
        </div>
      </main>
    </div>
  );
}

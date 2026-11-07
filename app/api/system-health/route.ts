import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { query } from "@/lib/db";

export const revalidate = 0;

/* ── Infrastructure health checks ── */
interface ServiceCheck {
  name: string;
  url: string;
  status: "up" | "down" | "slow";
  latency_ms: number;
  status_code?: number;
}

async function checkService(name: string, url: string, timeout = 5000): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": "ARES-HealthCheck/1.0" },
    });
    clearTimeout(timer);
    const latency = Date.now() - start;
    return {
      name, url,
      status: latency > 3000 ? "slow" : "up",
      latency_ms: latency,
      status_code: res.status,
    };
  } catch {
    return { name, url, status: "down", latency_ms: Date.now() - start };
  }
}

/* ── Dokploy helpers ── */
const DOKPLOY = process.env.DOKPLOY_URL ?? "";
const DOKPLOY_KEY = process.env.DOKPLOY_API_KEY ?? "";

async function dokployGet(path: string) {
  try {
    const res = await fetch(`${DOKPLOY}${path}`, {
      headers: { "x-api-key": DOKPLOY_KEY },
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? res.json() : null;
  } catch { return null; }
}

export async function GET() {
  const session = await getSession();
  if (!session || session.username !== "felipe") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // Timeout for PG queries — avoids hanging when sync TRUNCATE holds exclusive locks
    const PG_TIMEOUT = { timeoutMs: 3000 };

    // Wrap PG queries so a timeout returns [] instead of crashing the whole page
    async function safeQuery<T>(...args: Parameters<typeof query<T>>): Promise<T[]> {
      try { return await query<T>(...args); }
      catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("statement timeout")) return [];
        throw e;
      }
    }

    // Run all queries + infra checks in parallel
    const [
      tableStats,
      syncRates,
      recentSync,
      smokeTests,
      dbSize,
      pgConnections,
      syncLogGrowth,
      historicoGaps,
      syncHourly,
      syncDaily,
      // Infra
      aresCheck,
      grafanaCheck,
      dokployCheck,
      dokployProjects,
      recentDeploysRaw,
    ] = await Promise.all([
      // 1. Table sizes and row counts
      safeQuery<{
        table_name: string;
        row_estimate: number;
        total_bytes: number;
        dead_tuples: number;
        last_vacuum: string | null;
      }>(`
        SELECT
          c.relname AS table_name,
          c.reltuples::bigint AS row_estimate,
          pg_total_relation_size(c.oid) AS total_bytes,
          COALESCE(s.n_dead_tup, 0) AS dead_tuples,
          s.last_autovacuum::text AS last_vacuum
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
      `, undefined, PG_TIMEOUT),

      // 2. Sync success rates — last 6 hours
      safeQuery<{
        relatorio: string;
        total: number;
        ok: number;
        rate: number;
      }>(`
        SELECT
          relatorio,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status = 'ok') AS ok,
          ROUND(COUNT(*) FILTER (WHERE status = 'ok') * 100.0 / NULLIF(COUNT(*), 0), 1) AS rate
        FROM sync_log
        WHERE executado_em >= NOW() - INTERVAL '6 hours'
        GROUP BY relatorio
        ORDER BY rate ASC
      `, undefined, PG_TIMEOUT),

      // 3. Most recent sync per report
      safeQuery<{
        relatorio: string;
        last_ok: string | null;
        last_err: string | null;
        last_error_msg: string | null;
        registros: number | null;
      }>(`
        SELECT
          relatorio,
          MAX(executado_em) FILTER (WHERE status = 'ok')::text AS last_ok,
          MAX(executado_em) FILTER (WHERE status != 'ok')::text AS last_err,
          (SELECT erro FROM sync_log s2
           WHERE s2.relatorio = sync_log.relatorio AND s2.status != 'ok'
           ORDER BY s2.executado_em DESC LIMIT 1) AS last_error_msg,
          (SELECT registros FROM sync_log s3
           WHERE s3.relatorio = sync_log.relatorio AND s3.status = 'ok'
           ORDER BY s3.executado_em DESC LIMIT 1) AS registros
        FROM sync_log
        WHERE executado_em >= NOW() - INTERVAL '24 hours'
        GROUP BY relatorio
        ORDER BY relatorio
      `, undefined, PG_TIMEOUT),

      // 4. Smoke tests — latest per check
      safeQuery<{
        check_name: string;
        status: string;
        value: string;
        checked_at: string;
      }>(`
        SELECT DISTINCT ON (check_name)
          check_name,
          status,
          COALESCE(valor_observado::text, mensagem, '') AS value,
          executado_em::text AS checked_at
        FROM card_health
        ORDER BY check_name, executado_em DESC
      `, undefined, PG_TIMEOUT),

      // 5. Total DB size
      safeQuery<{ size_bytes: number }>(`
        SELECT pg_database_size(current_database()) AS size_bytes
      `, undefined, PG_TIMEOUT),

      // 6. Active PG connections
      safeQuery<{ count: number; max_conn: number; states: string }>(`
        SELECT
          COUNT(*)::int AS count,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_conn,
          STRING_AGG(DISTINCT state, ', ') AS states
        FROM pg_stat_activity
        WHERE datname = current_database()
      `, undefined, PG_TIMEOUT),

      // 7. sync_log growth (entries per day, last 7 days)
      safeQuery<{ day: string; entries: number; ok: number; err: number }>(`
        SELECT
          executado_em::date::text AS day,
          COUNT(*)::int AS entries,
          COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
          COUNT(*) FILTER (WHERE status != 'ok')::int AS err
        FROM sync_log
        WHERE executado_em >= NOW() - INTERVAL '7 days'
        GROUP BY executado_em::date
        ORDER BY day
      `, undefined, PG_TIMEOUT),

      // 8. custos_operacao_historico month coverage
      safeQuery<{ mes: string; rows: number }>(`
        SELECT
          TO_CHAR(
            TO_DATE(dados->>'DATA', 'DD/MM/YYYY'),
            'YYYY-MM'
          ) AS mes,
          COUNT(*) AS rows
        FROM custos_operacao_historico
        GROUP BY mes
        ORDER BY mes
      `, undefined, PG_TIMEOUT),

      // 9. Sync hourly pattern (last 48h, for heatmap)
      safeQuery<{ hour: number; day: string; ok: number; err: number }>(`
        SELECT
          EXTRACT(HOUR FROM executado_em AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
          (executado_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,
          COUNT(*) FILTER (WHERE status = 'ok')::int AS ok,
          COUNT(*) FILTER (WHERE status != 'ok')::int AS err
        FROM sync_log
        WHERE executado_em >= NOW() - INTERVAL '48 hours'
        GROUP BY day, hour
        ORDER BY day, hour
      `, undefined, PG_TIMEOUT),

      // 10. Sync per-report daily volume (7 days)
      safeQuery<{ day: string; relatorio: string; count: number }>(`
        SELECT
          executado_em::date::text AS day,
          relatorio,
          COUNT(*)::int AS count
        FROM sync_log
        WHERE executado_em >= NOW() - INTERVAL '7 days'
        GROUP BY day, relatorio
        ORDER BY day
      `, undefined, PG_TIMEOUT),

      // Infrastructure checks
      checkService("ARES Web", "https://ares.acertaexpress.app/login"),
      checkService("Grafana", "https://grafana.acertaexpress.app"),
      checkService("Dokploy", `${DOKPLOY}/api/project.all`),

      // Dokploy project/app status
      dokployGet("/api/project.all"),

      // Recent deploys for ares-web (parallel, not sequential)
      dokployGet("/api/deployment.all?applicationId=LJYXf1AlaaRFZ6DmD0OLK"),
    ]);

    // Parse Dokploy data
    type DokployEnvApp = { applicationId: string; name: string; applicationStatus: string };
    type DokployEnvCompose = { composeId: string; name: string; composeStatus: string };
    type DokployEnv = { applications: DokployEnvApp[]; compose: DokployEnvCompose[] };
    type DokployProject = { name: string; projectId: string; environments: DokployEnv[] };

    const dokployApps: { project: string; name: string; type: string; status: string; id: string }[] = [];
    if (Array.isArray(dokployProjects)) {
      for (const p of dokployProjects as DokployProject[]) {
        for (const env of p.environments ?? []) {
          for (const app of env.applications ?? []) {
            dokployApps.push({
              project: p.name, name: app.name, type: "app",
              status: app.applicationStatus, id: app.applicationId,
            });
          }
          for (const c of env.compose ?? []) {
            dokployApps.push({
              project: p.name, name: c.name, type: "compose",
              status: c.composeStatus, id: c.composeId,
            });
          }
        }
      }
    }

    // Parse recent deployments (already fetched in parallel)
    let recentDeploys: { createdAt: string; status: string; title: string; description: string }[] = [];
    if (Array.isArray(recentDeploysRaw)) {
      recentDeploys = recentDeploysRaw.slice(0, 10).map((d: { createdAt: string; status: string; title: string }) => ({
        createdAt: d.createdAt,
        status: d.status,
        title: (d.title ?? "").split("\n")[0].slice(0, 120),
        description: (d.title ?? ""),
      }));
    }

    // Detect if sync is blocking queries (some arrays came back empty due to timeout)
    const syncBlocking = [tableStats, syncRates, recentSync].some(a => a.length === 0);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      sync_in_progress: syncBlocking,
      database: {
        size_bytes: dbSize[0]?.size_bytes ?? 0,
        connections: pgConnections[0]?.count ?? 0,
        max_connections: pgConnections[0]?.max_conn ?? 100,
        connection_states: pgConnections[0]?.states ?? "",
      },
      tables: tableStats,
      sync: {
        rates_6h: syncRates,
        recent_24h: recentSync,
        log_growth_7d: syncLogGrowth,
        hourly_48h: syncHourly,
        daily_by_report: syncDaily,
      },
      smoke_tests: smokeTests,
      historico_coverage: historicoGaps,
      infrastructure: {
        services: [aresCheck, grafanaCheck, dokployCheck],
        dokploy_apps: dokployApps,
        recent_deploys: recentDeploys,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[system-health]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

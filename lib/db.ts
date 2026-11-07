import { Pool } from "pg";
import { requireEnv } from "@/lib/env";

let _pool: Pool | null = null;

/** Pool criado só no primeiro uso (o build não precisa das variáveis do banco). */
function pool(): Pool {
  if (_pool) return _pool;
  _pool = new Pool({
  host: requireEnv("DB_HOST"),
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME ?? "ares_bi",
  user: requireEnv("DB_USER"),
  password: requireEnv("DB_PASSWORD"),
  max: 10,
  idleTimeoutMillis: 30000,
  });
  return _pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
  opts?: { timeoutMs?: number },
): Promise<T[]> {
  const client = await pool().connect();
  try {
    if (opts?.timeoutMs) {
      await client.query(`SET statement_timeout = ${Math.max(1, Math.floor(Number(opts.timeoutMs)))}`);
    }
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    if (opts?.timeoutMs) {
      await client.query("RESET statement_timeout").catch(() => {});
    }
    client.release();
  }
}

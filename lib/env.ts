/**
 * Segredos e configuração vêm SEMPRE de variáveis de ambiente (ver .env.example).
 * Nada de valor padrão no código: sem a variável, a app falha de forma visível.
 */
export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não definida (ver .env.example).`);
  return v;
}

/** Chave HS256 da sessão (cookie ares_session). Usada no middleware, layout e lib/session. */
export function sessionSecret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("SESSION_SECRET"));
}

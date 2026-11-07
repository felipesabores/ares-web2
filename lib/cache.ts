type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function withCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) return hit.value;

  // deduplicação: se já tem uma query em voo pra mesma chave, espera ela
  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const promise = fn().then((value) => {
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    inflight.delete(key);
    return value;
  }).catch((err) => {
    inflight.delete(key);
    throw err;
  });

  inflight.set(key, promise);
  return promise;
}

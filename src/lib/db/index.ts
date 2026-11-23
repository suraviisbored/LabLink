import { createDatabaseClient } from "@/lib/db/pg/client";
import { PgStore } from "@/lib/db/pg/store";
import { postgresMode } from "@/lib/db/mode";
import { boundStore, cacheStore, cachedStore, invalidateCache, runInStore } from "@/lib/db/runtime";
import { getStore, type Store } from "@/lib/db/store";

/**
 * Entry point for request-scoped store access.
 *
 * - API routes go through `withApi`, which wraps them in `runWithStore`: fresh
 *   snapshot, rules run unchanged, diff flushed before the response.
 * - Server components call `loadStore()` so their first paint reads the
 *   database rather than the demo seed. The result is cached for a second so a
 *   page and the shell it renders share one snapshot.
 * - Everything else keeps calling `getStore()`.
 */

const CACHE_TTL_MS = 1000;

export { databaseLabel, postgresMode } from "@/lib/db/mode";
export { getStore };
export type { Store };

export async function loadStore(): Promise<Store> {
  const bound = boundStore();
  if (bound) return bound;

  const cached = cachedStore();
  if (cached && Date.now() - (cached as PgStore).loadedAt < CACHE_TTL_MS) {
    return cached;
  }

  if (!postgresMode()) return getStore();

  const store = await PgStore.load(createDatabaseClient());
  cacheStore(store);
  return store;
}

/**
 * Runs a write path against Postgres and persists its diff. The flush happens
 * after the handler returns and before the response leaves, so a constraint
 * violation (a unit taken in the meantime) becomes a normal API error.
 */
export async function runWithStore<T>(run: () => Promise<T>): Promise<T> {
  const store = await PgStore.load(createDatabaseClient());
  cacheStore(store);
  try {
    const result = await runInStore(store, run);
    await store.flush();
    return result;
  } finally {
    invalidateCache();
  }
}

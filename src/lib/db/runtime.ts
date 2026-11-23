import { AsyncLocalStorage } from "node:async_hooks";
import type { Store } from "@/lib/db/store";

/**
 * Request-scoped store binding.
 *
 * `getStore()` must stay synchronous because the repositories and services were
 * written as plain functions over a snapshot. AsyncLocalStorage carries the
 * store that `runWithStore()` loaded, so nothing downstream needs to change.
 */

const storage = new AsyncLocalStorage<Store>();

let readCache: Store | null = null;

/** The store bound to the current request, if any. */
export function boundStore(): Store | undefined {
  return storage.getStore();
}

export function activeStore(): Store | undefined {
  return storage.getStore() ?? readCache ?? undefined;
}

export function runInStore<T>(store: Store, run: () => Promise<T>): Promise<T> {
  return storage.run(store, run);
}

export function cacheStore(store: Store): void {
  readCache = store;
}

export function cachedStore(): Store | null {
  return readCache;
}

export function invalidateCache(): void {
  readCache = null;
}

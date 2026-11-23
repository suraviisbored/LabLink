import { buildSeedData, type SeedData } from "@/lib/seed";
import { postgresMode } from "@/lib/db/mode";
import { emptySeedData } from "@/lib/db/pg/load";
import { activeStore } from "@/lib/db/runtime";

/**
 * Store: the snapshot the repositories read and mutate.
 *
 * Two adapters implement the same contract:
 *   - `src/lib/db/pg/store.ts` (Postgres via Supabase, when env is configured)
 *   - the seeded in-memory store below (tests, and the zero-credential demo)
 *
 * `getStore()` returns, in order: the store bound to the current request (the
 * Postgres adapter, see `runWithStore`), a cached read snapshot, or the seeded
 * demo data. The memory adapter emulates the same contracts the SQL holds:
 *   - writes are synchronous with respect to each other (no awaits mid-write)
 *   - `bookSlot` applies the same overlap / quota / availability rules
 *   - idempotency keys are unique
 */
export class Store {
  data: SeedData;
  /** Monotonic counter so ids are stable within a process. */
  private counter = 0;

  constructor(seed: SeedData) {
    this.data = seed;
  }

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${Date.now().toString(36)}${this.counter.toString(36)}`;
  }

  /**
   * Readable ids ("opt-<conflict>-<strategy>") are fine in memory; Postgres
   * columns are uuid, so the adapter returns a UUID instead.
   */
  formatId(_kind: string, readable: string): string {
    return readable;
  }

  now(): string {
    return new Date().toISOString();
  }
}

declare global {
  var __lablinkMemoryStore: Store | undefined;
}

/** Never falls back to demo data when Postgres is configured. */
export function getStore(): Store {
  const scoped = activeStore();
  if (scoped) return scoped;

  if (postgresMode()) {
    if (!globalThis.__lablinkMemoryStore) {
      globalThis.__lablinkMemoryStore = new Store(emptySeedData());
    }
    return globalThis.__lablinkMemoryStore;
  }

  if (!globalThis.__lablinkMemoryStore) {
    globalThis.__lablinkMemoryStore = new Store(buildSeedData());
  }
  return globalThis.__lablinkMemoryStore;
}

export function resetStoreForTests(now: Date = new Date()): Store {
  const store = new Store(buildSeedData(now));
  globalThis.__lablinkMemoryStore = store;
  return store;
}

export type { SeedData };

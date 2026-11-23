import { randomUUID } from "node:crypto";
import { Store } from "@/lib/db/store";
import type { SeedData } from "@/lib/seed";
import type { DatabaseClient } from "@/lib/db/pg/client";
import { flushSnapshot, type FlushResult } from "@/lib/db/pg/flush";
import { loadSnapshot } from "@/lib/db/pg/load";

/**
 * Postgres-backed store.
 *
 * The repository interface is synchronous, so the adapter loads one snapshot
 * per request, lets the existing rules run unchanged, and writes the diff back
 * before the response is sent. Ids are UUIDs (the columns are `uuid`), which is
 * why `nextId` is overridden and `formatId` exists for readable ids such as
 * conflict options.
 */
export class PgStore extends Store {
  readonly client: DatabaseClient;
  /** What the database held when this request started. */
  readonly baseline: SeedData;
  readonly loadedAt: number;

  private constructor(client: DatabaseClient, data: SeedData) {
    super(data);
    this.client = client;
    this.baseline = structuredClone(data);
    this.loadedAt = Date.now();
  }

  static async load(client: DatabaseClient): Promise<PgStore> {
    return new PgStore(client, await loadSnapshot(client));
  }

  override nextId(_prefix: string): string {
    return randomUUID();
  }

  /** Opaque ids still need to be UUID columns in Postgres. */
  override formatId(_kind: string, _readable: string): string {
    return randomUUID();
  }

  async flush(): Promise<FlushResult> {
    return flushSnapshot(this.client, this.baseline, this.data);
  }
}

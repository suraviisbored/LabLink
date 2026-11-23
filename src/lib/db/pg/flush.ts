import type { SeedData } from "@/lib/seed";
import { ApiError } from "@/lib/errors";
import type { DatabaseClient, DatabaseError } from "@/lib/db/pg/client";
import { TABLES, type Row, type TableSpec } from "@/lib/db/pg/schema";

/**
 * Writes the changes a request made back to Postgres.
 *
 * The repository functions mutate a snapshot in memory; this diff turns that
 * into the smallest set of upserts and deletes. Deletes run first, children
 * before parents; upserts run parent first so foreign keys always resolve.
 * Postgres stays the authority: the exclusion constraint on bookings, the
 * unique idempotency key and the check constraints reject anything the
 * in-memory rules let through on stale data, and those violations are mapped to
 * the same ApiError codes the memory adapter throws.
 */

export interface FlushResult {
  insertedOrUpdated: number;
  deleted: number;
}

const CHUNK = 200;

function toApiError(error: DatabaseError, table: string): ApiError {
  const code = error.code ?? "";
  const detail = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();

  if (code === "23P01" || (code === "23505" && detail.includes("idempotency"))) {
    // Exclusion constraint or a duplicate idempotency key: another request won
    // the race between our read and our write. A retry reads fresh state.
    return new ApiError("SLOT_TAKEN", "That slot was just taken. Refresh and pick another time.");
  }
  if (code === "23505") {
    return new ApiError(
      "CONFLICT",
      "That record already exists. Refresh the page to see the latest state.",
    );
  }
  if (code === "23503") {
    return new ApiError("VALIDATION_ERROR", "A record this action depends on is missing.");
  }
  if (code === "42501") {
    return new ApiError("FORBIDDEN", "You do not have permission to change that record.");
  }
  if (code === "23514" || code === "22P02" || code === "23502") {
    return new ApiError("VALIDATION_ERROR", "The database rejected that value.");
  }

  console.error(`[db] write to ${table} failed`, error);
  return new ApiError("VALIDATION_ERROR", "The change could not be saved. Try again.");
}

async function deleteRows(
  client: DatabaseClient,
  table: TableSpec,
  rows: unknown[],
): Promise<void> {
  for (const row of rows) {
    const { error } = await client.from(table.table).delete().match(table.where(row));
    if (error) throw toApiError(error, table.table);
  }
}

async function upsertRows(client: DatabaseClient, table: TableSpec, rows: Row[]): Promise<void> {
  for (let index = 0; index < rows.length; index += CHUNK) {
    const chunk = rows.slice(index, index + CHUNK);
    const { error } = await client.from(table.table).upsert(chunk, { onConflict: table.conflict });
    if (error) throw toApiError(error, table.table);
  }
}

export async function flushSnapshot(
  client: DatabaseClient,
  baseline: SeedData,
  current: SeedData,
): Promise<FlushResult> {
  const upserts: { table: TableSpec; rows: Row[]; phase: number }[] = [];
  const deletes: { table: TableSpec; rows: unknown[]; phase: number }[] = [];

  for (const table of TABLES) {
    const before = table.list(baseline);
    const after = table.list(current);

    const beforeEncoded = new Map<string, Row>();
    for (const row of before) beforeEncoded.set(table.key(row), table.encode(row));

    const afterEncoded = new Map<string, Row>();
    for (const row of after) afterEncoded.set(table.key(row), table.encode(row));

    const changed = [...afterEncoded.entries()]
      .filter(([key, row]) => {
        const previous = beforeEncoded.get(key);
        return previous === undefined || JSON.stringify(previous) !== JSON.stringify(row);
      })
      .map(([, row]) => row);
    if (changed.length > 0) upserts.push({ table, rows: changed, phase: table.phase });

    const removed = before.filter((row) => !afterEncoded.has(table.key(row)));
    if (removed.length > 0) deletes.push({ table, rows: removed, phase: table.phase });
  }

  // Children before parents, so no foreign key dangles mid-flush.
  deletes.sort((a, b) => b.phase - a.phase);
  for (const entry of deletes) await deleteRows(client, entry.table, entry.rows);

  // Parents before children; settings and append-only rows come last.
  upserts.sort((a, b) => a.phase - b.phase);
  let count = 0;
  for (const entry of upserts) {
    await upsertRows(client, entry.table, entry.rows);
    count += entry.rows.length;
  }

  return {
    insertedOrUpdated: count,
    deleted: deletes.reduce((sum, entry) => sum + entry.rows.length, 0),
  };
}

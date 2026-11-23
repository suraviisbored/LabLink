import { describe, expect, it, beforeEach } from "vitest";
import { buildSeedData } from "@/lib/seed";
import type { DatabaseClient, DatabaseError, QueryBuilder, SelectResult } from "@/lib/db/pg/client";
import { TABLES, type Row } from "@/lib/db/pg/schema";
import { loadSnapshot } from "@/lib/db/pg/load";
import { PgStore } from "@/lib/db/pg/store";
import { availabilityFor } from "@/lib/repo/catalogue";
import { bookSlot } from "@/lib/repo/bookings";
import { audit } from "@/lib/repo/admin";
import { ApiError } from "@/lib/errors";
import { postgresMode } from "@/lib/db/mode";
import { getStore } from "@/lib/db/store";

/**
 * The adapter is exercised against a fake PostgREST: the point is the mapping
 * and the diff (which columns are written, in what order, and how a rejected
 * write becomes an API error). A live-project test is listed in the README.
 */

interface Write {
  op: "upsert" | "delete";
  table: string;
  rows?: Row[];
  filter?: Row;
}

class FakeDatabase implements DatabaseClient {
  tables = new Map<string, Row[]>();
  writes: Write[] = [];
  failUpsert: { table: string; error: DatabaseError } | null = null;

  seedFrom(data: ReturnType<typeof buildSeedData>) {
    this.tables = new Map();
    for (const table of TABLES) {
      this.tables.set(
        table.table,
        table.list(data).map((row) => table.encode(row)),
      );
    }
    this.tables.set(
      "campus_email_domains",
      data.campusDomains.map((entry) => ({ domain: entry.domain, campus_id: entry.campusId })),
    );
  }

  from(table: string): QueryBuilder {
    const tables = this.tables;
    const writes = this.writes;
    // Arrow: keeps the client's `this` inside the plain-object builder methods.
    const takeFailure = () => {
      const failure = this.failUpsert;
      if (failure) this.failUpsert = null;
      return failure;
    };
    return {
      select() {
        return {
          range(from: number, to: number): PromiseLike<SelectResult> {
            return Promise.resolve({
              data: structuredClone((tables.get(table) ?? []).slice(from, to + 1)),
              error: null,
            });
          },
        };
      },
      upsert(rows, options) {
        const failure = takeFailure();
        if (failure && failure.table === table) {
          return Promise.resolve({ error: failure.error });
        }
        writes.push({ op: "upsert", table, rows: structuredClone(rows) });
        const keys = options.onConflict.split(",");
        const current = tables.get(table) ?? [];
        for (const row of rows) {
          const index = current.findIndex((existing) => keys.every((key) => existing[key] === row[key]));
          if (index >= 0) current[index] = { ...current[index], ...row };
          else current.push(row);
        }
        tables.set(table, current);
        return Promise.resolve({ error: null });
      },
      delete() {
        return {
          match(filter: Row) {
            writes.push({ op: "delete", table, filter });
            const current = tables.get(table) ?? [];
            tables.set(
              table,
              current.filter(
                (row) => !Object.entries(filter).every(([key, value]) => row[key] === value),
              ),
            );
            return Promise.resolve({ error: null });
          },
        };
      },
    };
  }
}

const BASE = new Date("2026-05-04T06:00:00.000Z"); // a Monday, 11:30 IST

describe("Postgres adapter", () => {
  let db: FakeDatabase;

  beforeEach(() => {
    db = new FakeDatabase();
    db.seedFrom(buildSeedData(BASE));
  });

  it("maps PostgREST rows onto the domain snapshot", async () => {
    const data = await loadSnapshot(db);

    expect(data.campuses).toHaveLength(2);
    expect(data.campuses[0]?.allowedEmailDomains.length).toBeGreaterThan(0);
    expect(data.labs[0]?.availableDays).toContain(1);
    expect(data.equipment[0]?.specs).toBeInstanceOf(Object);
    expect(Object.keys(data.equipment[0]?.specs ?? {}).length).toBeGreaterThan(0);
    expect(data.settings[0]?.fairnessWeights.deadline).toBeCloseTo(0.35);
    expect(data.campusDomains.length).toBeGreaterThan(0);

    // Bookings do not store equipment_id; it comes from the unit.
    expect(data.bookings.length).toBeGreaterThan(0);
    expect(data.bookings.every((booking) => booking.equipmentId.length > 0)).toBe(true);

    expect(data.notifications.length).toBeGreaterThan(0);
  });

  it("round-trips a stored conflict option, strategy included", async () => {
    db.tables.get("conflict_options")!.push({
      id: "9f000000-0000-4000-8000-000000000001",
      conflict_id: "conflict-jetson",
      campus_id: "campus-demo",
      strategy: "deadline",
      allocation_json: [],
      fairness_score: 0.81,
      explanation: "Deadline first.",
      tradeoffs: "Defers the least urgent request.",
      rank: 1,
      source: "solver",
      unallocated_ids: ["req-aarav-conflict"],
      counterfactual_json: null,
    });

    const data = await loadSnapshot(db);
    const option = data.conflictOptions.find(
      (entry) => entry.id === "9f000000-0000-4000-8000-000000000001",
    );

    expect(option?.strategy).toBe("deadline");
    expect(option?.unallocated).toEqual(["req-aarav-conflict"]);
    expect(option?.fairnessScore).toBeCloseTo(0.81);
  });

  it("writes only what changed, with snake_case columns", async () => {
    const source = buildSeedData(BASE);
    const store = await PgStore.load(db);
    const equipment = source.equipment.find((item) => item.id === "eq-jetson")!;

    const grid = availabilityFor(store, equipment, BASE.toISOString(), "2026-05-09T00:00:00.000Z");
    const slot = grid.flatMap((day) => day.slots).find((entry) => entry.freeUnits > 0)!;
    expect(slot).toBeDefined();

    const student = source.profiles.find((profile) => profile.role === "student")!;
    const { booking } = bookSlot(store, {
      campusId: "campus-demo",
      userId: student.id,
      equipmentId: equipment.id,
      startTime: slot.start,
      endTime: slot.end,
      idempotencyKey: "adapter-test-key",
    });
    audit(store, {
      campusId: "campus-demo",
      actorId: student.id,
      action: "booking.created",
      entity: "bookings",
      entityId: booking.id,
    });

    const result = await store.flush();

    const upserts = db.writes.filter((write) => write.op === "upsert");
    const bookingWrite = upserts.find((write) => write.table === "bookings");
    expect(bookingWrite).toBeDefined();
    expect(bookingWrite!.rows?.[0]).toMatchObject({
      id: booking.id,
      campus_id: "campus-demo",
      unit_id: booking.unitId,
      idempotency_key: "adapter-test-key",
      status: "confirmed",
    });
    expect(bookingWrite!.rows?.[0]).toHaveProperty("start_time", new Date(slot.start).toISOString());

    // Untouched tables are not rewritten.
    expect(upserts.some((write) => write.table === "campuses")).toBe(false);
    expect(upserts.some((write) => write.table === "equipment")).toBe(false);

    // Parents are written before children.
    const order = upserts.map((write) => write.table);
    expect(order.indexOf("bookings")).toBeLessThan(order.indexOf("audit_log"));
    expect(result.insertedOrUpdated).toBeGreaterThanOrEqual(2);
  });

  it("deletes rows removed from the snapshot before writing", async () => {
    const store = await PgStore.load(db);
    const doomed = store.data.notifications[0]!;
    store.data.notifications = store.data.notifications.filter(
      (entry) => entry.id !== doomed.id,
    );

    const result = await store.flush();

    const deletion = db.writes.find((write) => write.op === "delete");
    expect(deletion?.table).toBe("notifications");
    expect(deletion?.filter).toEqual({ id: doomed.id });
    expect(result.deleted).toBe(1);
  });

  it("turns an exclusion-constraint violation into SLOT_TAKEN", async () => {
    const store = await PgStore.load(db);
    store.data.profiles[0]!.name = "Changed Name";
    db.failUpsert = {
      table: "profiles",
      error: { code: "23P01", message: "conflicting key value violates exclusion constraint" },
    };

    await expect(store.flush()).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("falls back to the seeded demo store when Supabase is not configured", () => {
    expect(postgresMode()).toBe(false);
    const store = getStore();
    expect(store.data.campuses.some((campus) => campus.isDemo)).toBe(true);
    expect(store.nextId("booking")).toMatch(/^booking-/);
  });

  it("uses UUIDs for every id once Postgres is the store", async () => {
    const store = await PgStore.load(db);
    expect(store.nextId("booking")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // Readable ids are preserved by the memory adapter and opaque in Postgres.
    expect(store.formatId("option", "opt-x-fairness")).toMatch(/^[0-9a-f-]{36}$/);
    expect(getStore().formatId("option", "opt-x-fairness")).toBe("opt-x-fairness");
  });
});

describe("adapter error surface", () => {
  it("keeps ApiError codes stable for callers", () => {
    expect(new ApiError("SLOT_TAKEN", "taken").status).toBe(409);
  });
});

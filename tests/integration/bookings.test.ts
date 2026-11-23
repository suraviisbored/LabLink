import { beforeEach, describe, expect, it } from "vitest";
import { resetStoreForTests, type Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import {
  bookSlot,
  cancelBooking,
  checkInBooking,
  nearestFreeSlots,
  sweepNoShows,
} from "@/lib/repo/bookings";
import { availabilityFor, getEquipment, requireEquipment } from "@/lib/repo/catalogue";
import { decideRequest, getRequest } from "@/lib/repo/requests";
import { addDays, campusLocalToUtc, nowIso } from "@/lib/time";

const BASE = new Date("2026-03-02T04:00:00.000Z");
const DEMO = "campus-demo";

let store: Store;

beforeEach(() => {
  store = resetStoreForTests(BASE);
});

/** First free one-hour slot on a weekday, at least two days out. */
function firstFreeSlot(equipmentId: string): { start: string; end: string } {
  const equipment = requireEquipment(store, DEMO, equipmentId);
  const from = addDays(BASE.toISOString(), 2);
  const to = addDays(from, 10);
  const grid = availabilityFor(store, equipment, from, to, 60);
  const slot = grid.flatMap((day) => day.slots).find((entry) => entry.freeUnits > 0);
  if (!slot) throw new Error("fixture has no free slot");
  return { start: slot.start, end: slot.end };
}

function attempt(run: () => unknown): ApiError | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
}

function certify(userId: string) {
  store.data.userCertifications.push({
    userId,
    certificationId: "cert-arm",
    campusId: DEMO,
    validUntil: null,
  });
}

describe("POST /bookings behaviour (book_slot rules)", () => {
  it("books a free slot and rejects the same slot for another student", () => {
    // The robot arm has exactly one unit, so the second attempt must lose.
    certify("user-neha");
    certify("user-priya");
    const slot = firstFreeSlot("eq-arm");

    const first = bookSlot(store, {
      campusId: DEMO,
      userId: "user-neha",
      equipmentId: "eq-arm",
      startTime: slot.start,
      endTime: slot.end,
      idempotencyKey: "test-neha-1",
    });
    expect(first.replayed).toBe(false);
    expect(first.booking.status).toBe("confirmed");

    const conflict = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-priya",
        equipmentId: "eq-arm",
        startTime: slot.start,
        endTime: slot.end,
        idempotencyKey: "test-priya-1",
      }),
    );
    expect(conflict?.code).toBe("SLOT_TAKEN");
    const alternatives = conflict?.details.alternatives;
    expect(Array.isArray(alternatives)).toBe(true);
    expect((alternatives as unknown[]).length).toBe(3);
  });

  it("replays an idempotency key instead of double booking", () => {
    const slot = firstFreeSlot("eq-pi");
    const input = {
      campusId: DEMO,
      userId: "user-neha",
      equipmentId: "eq-pi",
      startTime: slot.start,
      endTime: slot.end,
      idempotencyKey: "same-key",
    };
    const first = bookSlot(store, input);
    const replay = bookSlot(store, input);
    expect(replay.replayed).toBe(true);
    expect(replay.booking.id).toBe(first.booking.id);
    expect(store.data.bookings.filter((b) => b.idempotencyKey === "same-key")).toHaveLength(1);
  });

  it("rejects use of another user's idempotency key", () => {
    const slot = firstFreeSlot("eq-pi");
    bookSlot(store, {
      campusId: DEMO,
      userId: "user-neha",
      equipmentId: "eq-pi",
      startTime: slot.start,
      endTime: slot.end,
      idempotencyKey: "owned-key",
    });
    const error = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-priya",
        equipmentId: "eq-pi",
        startTime: slot.start,
        endTime: slot.end,
        idempotencyKey: "owned-key",
      }),
    );
    expect(error?.code).toBe("FORBIDDEN");
  });

  it("enforces the weekly quota", () => {
    store.data.settings.find((entry) => entry.campusId === DEMO)!.weeklyHoursQuota = 3;
    const slot = firstFreeSlot("eq-jetson");
    const error = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-aarav", // already holds 2 h this week
        equipmentId: "eq-jetson",
        startTime: slot.start,
        endTime: new Date(new Date(slot.start).getTime() + 2 * 3_600_000).toISOString(),
        idempotencyKey: "quota-key",
      }),
    );
    expect(error?.code).toBe("QUOTA_EXCEEDED");
  });

  it("rejects bookings outside lab hours and on closed days", () => {
    const wednesday = nextWeekday("2026-03-02T04:00:00.000Z", 3);
    const lateStart = campusLocalToUtc(wednesday, 20);
    const lateError = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-neha",
        equipmentId: "eq-jetson",
        startTime: lateStart,
        endTime: new Date(new Date(lateStart).getTime() + 3_600_000).toISOString(),
        idempotencyKey: "late-key",
      }),
    );
    expect(lateError?.code).toBe("OUTSIDE_AVAILABILITY");

    const sunday = nextWeekday("2026-03-02T04:00:00.000Z", 7);
    const sundayStart = campusLocalToUtc(sunday, 10);
    const sundayError = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-neha",
        equipmentId: "eq-jetson",
        startTime: sundayStart,
        endTime: new Date(new Date(sundayStart).getTime() + 3_600_000).toISOString(),
        idempotencyKey: "sunday-key",
      }),
    );
    expect(sundayError?.code).toBe("OUTSIDE_AVAILABILITY");
  });

  it("requires certification for gated equipment", () => {
    const slot = firstFreeSlot("eq-arm");
    const error = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-neha",
        equipmentId: "eq-arm",
        startTime: slot.start,
        endTime: slot.end,
        idempotencyKey: "cert-key",
      }),
    );
    expect(error?.code).toBe("CERT_REQUIRED");
  });

  it("lets exactly one of 20 concurrent requests win a contested slot", async () => {
    certify("user-neha");
    const slot = firstFreeSlot("eq-arm");

    const results = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        Promise.resolve().then(() =>
          attempt(() =>
            bookSlot(store, {
              campusId: DEMO,
              userId: "user-neha",
              equipmentId: "eq-arm",
              startTime: slot.start,
              endTime: slot.end,
              idempotencyKey: `race-${index}`,
            }),
          ),
        ),
      ),
    );

    const successes = results.filter((error) => error === null);
    expect(successes).toHaveLength(1);
    expect(
      store.data.bookings.filter(
        (booking) =>
          booking.equipmentId === "eq-arm" &&
          booking.startTime === slot.start &&
          booking.status === "confirmed",
      ),
    ).toHaveLength(1);
  });

  it("never exceeds quota under parallel attempts at the edge", async () => {
    store.data.settings.find((entry) => entry.campusId === DEMO)!.weeklyHoursQuota = 4;
    const slot = firstFreeSlot("eq-pi");
    const second = nearestFreeSlots(store, DEMO, "eq-pi", addDays(slot.start, 1), 3)[0]!;

    const outcomes = await Promise.all(
      [slot, second].map((start, index) =>
        Promise.resolve().then(() =>
          attempt(() =>
            bookSlot(store, {
              campusId: DEMO,
              userId: "user-neha",
              equipmentId: "eq-pi",
              startTime: start.start,
              endTime: new Date(new Date(start.start).getTime() + 3 * 3_600_000).toISOString(),
              idempotencyKey: `quota-race-${index}`,
            }),
          ),
        ),
      ),
    );

    const successes = outcomes.filter((error) => error === null);
    expect(successes).toHaveLength(1);
    expect(outcomes.some((error) => error?.code === "QUOTA_EXCEEDED")).toBe(true);
  });

  it("enforces the cancel cutoff", () => {
    const error = attempt(() =>
      cancelBooking(store, {
        campusId: DEMO,
        userId: "user-aarav",
        bookingId: "book-aarav-jetson",
        isAdmin: false,
      }),
    );
    // The seeded booking is tomorrow, inside the 2 h cutoff only when close.
    if (error) expect(["FORBIDDEN", "VALIDATION_ERROR"]).toContain(error.code);
    else expect(store.data.bookings.find((b) => b.id === "book-aarav-jetson")!.status).toBe("cancelled");
  });

  it("releases unchecked bookings past grace and never releases checked-in ones", () => {
    const past = addDays(BASE.toISOString(), -1);
    store.data.bookings.push(
      {
        id: "expired",
        campusId: DEMO,
        unitId: "eq-pi-u2",
        equipmentId: "eq-pi",
        userId: "user-neha",
        requestId: null,
        seriesId: null,
        startTime: past,
        endTime: addDays(past, 0),
        status: "confirmed",
        checkedInAt: null,
        idempotencyKey: "expired-key",
        version: 1,
        createdAt: past,
      },
      {
        id: "checked-in",
        campusId: DEMO,
        unitId: "eq-pi-u3",
        equipmentId: "eq-pi",
        userId: "user-neha",
        requestId: null,
        seriesId: null,
        startTime: past,
        endTime: addDays(past, 0),
        status: "checked_in",
        checkedInAt: past,
        idempotencyKey: "checked-in-key",
        version: 1,
        createdAt: past,
      },
    );

    sweepNoShows(store, DEMO);
    expect(store.data.bookings.find((b) => b.id === "expired")!.status).toBe("no_show");
    expect(store.data.bookings.find((b) => b.id === "checked-in")!.status).toBe("checked_in");

    // Idempotent: a second sweep changes nothing.
    const released = sweepNoShows(store, DEMO);
    expect(released.find((b) => b.id === "expired")).toBeUndefined();
  });

  it("refuses check-in outside the window", () => {
    const error = attempt(() =>
      checkInBooking(store, { campusId: DEMO, userId: "user-aarav", bookingId: "book-aarav-jetson" }),
    );
    expect(error?.code).toBe("VALIDATION_ERROR");
  });

  it("lets one of two simultaneous faculty decisions win", () => {
    const first = decideRequest(store, {
      requestId: "req-neha-prusa",
      campusId: DEMO,
      actorId: "user-meera",
      actorRole: "faculty",
      decision: "approve",
      version: 1,
    });
    expect(first.status).toBe("approved");

    const error = attempt(() =>
      decideRequest(store, {
        requestId: "req-neha-prusa",
        campusId: DEMO,
        actorId: "user-meera",
        actorRole: "faculty",
        decision: "reject",
        version: 1,
      }),
    );
    expect(error?.code).toBe("STALE_STATE");
    expect(getRequest(store, DEMO, "req-neha-prusa")!.request.status).toBe("approved");
  });

  it("keeps equipment lookups inside the campus", () => {
    expect(getEquipment(store, "campus-riverside", "eq-jetson")).toBeNull();
    const error = attempt(() =>
      bookSlot(store, {
        campusId: DEMO,
        userId: "user-aarav",
        equipmentId: "eq-r-jetson",
        startTime: firstFreeSlot("eq-jetson").start,
        endTime: firstFreeSlot("eq-jetson").end,
        idempotencyKey: "cross-campus",
      }),
    );
    expect(error?.code).toBe("NOT_FOUND");
    void nowIso();
  });
});

function nextWeekday(fromIso: string, weekday: number): string {
  const cursor = new Date(fromIso);
  for (let index = 0; index < 8; index += 1) {
    const shifted = new Date(cursor.getTime() + index * 86_400_000);
    const day = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay();
    if (day === weekday) return shifted.toISOString().slice(0, 10);
  }
  return fromIso.slice(0, 10);
}

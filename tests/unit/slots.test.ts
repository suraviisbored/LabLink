import { describe, expect, it } from "vitest";
import {
  availabilityGrid,
  firstFit,
  freeIntervals,
  openingWindow,
  subtractIntervals,
} from "@/lib/solver/slots";

const LAB = { availableFrom: "09:00", availableTo: "18:00", availableDays: [1, 2, 3, 4, 5] };
// 2026-03-02 is a Monday.
const MONDAY = "2026-03-02T00:00:00.000Z";

describe("calendar geometry", () => {
  it("closes on days the lab is not open", () => {
    const sunday = "2026-03-08T00:00:00.000Z";
    expect(openingWindow(sunday, LAB, MONDAY, "2026-03-31T00:00:00.000Z")).toBeNull();
  });

  it("opens inside lab hours in IST", () => {
    const window = openingWindow("2026-03-02", LAB, MONDAY, "2026-03-31T00:00:00.000Z");
    expect(window).not.toBeNull();
    // 09:00 IST is 03:30 UTC.
    expect(new Date(window!.start).toISOString()).toBe("2026-03-02T03:30:00.000Z");
  });

  it("subtracts a booking in the middle of a window", () => {
    const segments = subtractIntervals(
      { start: "2026-03-02T03:30:00.000Z", end: "2026-03-02T12:30:00.000Z" },
      [{ start: "2026-03-02T05:30:00.000Z", end: "2026-03-02T07:30:00.000Z" }],
    );
    expect(segments).toHaveLength(2);
    expect(segments[0]!.end).toBe("2026-03-02T05:30:00.000Z");
    expect(segments[1]!.start).toBe("2026-03-02T07:30:00.000Z");
  });

  it("allows back-to-back bookings (half-open intervals)", () => {
    const segments = subtractIntervals(
      { start: "2026-03-02T03:30:00.000Z", end: "2026-03-02T05:30:00.000Z" },
      [{ start: "2026-03-02T05:30:00.000Z", end: "2026-03-02T07:30:00.000Z" }],
    );
    expect(segments).toHaveLength(1);
    expect(segments[0]!.end).toBe("2026-03-02T05:30:00.000Z");
  });

  it("excludes maintenance from free intervals", () => {
    const free = freeIntervals({
      unitIds: ["u1", "u2"],
      from: "2026-03-02T00:00:00.000Z",
      to: "2026-03-02T18:00:00.000Z",
      lab: LAB,
      busy: [{ unitId: "u1", start: "2026-03-02T03:30:00.000Z", end: "2026-03-02T05:30:00.000Z" }],
    });
    expect(free.some((slot) => slot.unitId === "u1" && slot.start === "2026-03-02T03:30:00.000Z")).toBe(false);
    expect(free.some((slot) => slot.unitId === "u2" && slot.start === "2026-03-02T03:30:00.000Z")).toBe(true);
  });

  it("counts free units per slot in the grid", () => {
    const grid = availabilityGrid({
      unitIds: ["u1", "u2"],
      from: "2026-03-02T00:00:00.000Z",
      to: "2026-03-02T18:00:00.000Z",
      lab: LAB,
      busy: [{ unitId: "u1", start: "2026-03-02T03:30:00.000Z", end: "2026-03-02T04:30:00.000Z" }],
    });
    const firstSlot = grid[0]!.slots[0]!;
    expect(firstSlot.freeUnits).toBe(1);
    expect(firstSlot.totalUnits).toBe(2);
  });

  it("firstFit refuses a block that does not fit", () => {
    const intervals = [
      { unitId: "u1", start: "2026-03-02T03:30:00.000Z", end: "2026-03-02T05:30:00.000Z" },
    ];
    expect(firstFit(intervals, 3)).toBeNull();
    expect(firstFit(intervals, 2)).not.toBeNull();
  });
});

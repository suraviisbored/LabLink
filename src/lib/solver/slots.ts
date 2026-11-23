import type { Interval } from "@/lib/solver/types";
import {
  campusClock,
  campusDate,
  campusLocalToUtc,
  campusWeekday,
  minutesFromClock,
  overlaps,
} from "@/lib/time";

/**
 * Calendar geometry: turns lab opening rules, bookings and maintenance blocks
 * into the free intervals the solver can place work in. Pure and side-effect
 * free; all boundaries are UTC instants and the comparison is half-open
 * ([start, end)) so back-to-back bookings are allowed.
 */

export interface LabRules {
  availableFrom: string;
  availableTo: string;
  availableDays: number[];
}

export interface BusyInterval {
  unitId: string;
  start: string;
  end: string;
}

export interface FreeInterval {
  unitId: string;
  start: string;
  end: string;
}

export function dayRange(fromIso: string, toIso: string, maxDays = 60): string[] {
  const days: string[] = [];
  const cursor = new Date(`${campusDate(fromIso)}T00:00:00Z`);
  const last = new Date(`${campusDate(toIso)}T00:00:00Z`);
  for (let index = 0; index < maxDays && cursor <= last; index += 1) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Opening instants for one calendar day, clipped to the requested range. */
export function openingWindow(
  dateIso: string,
  lab: LabRules,
  fromIso: string,
  toIso: string,
  offsetMinutes = 330,
): { start: string; end: string } | null {
  const from = campusLocalToUtc(dateIso, Math.floor(minutesFromClock(lab.availableFrom) / 60), 0, offsetMinutes);
  const weekday = campusWeekday(from, offsetMinutes);
  if (!lab.availableDays.includes(weekday)) return null;

  const openMinutes = minutesFromClock(lab.availableFrom);
  const closeMinutes = minutesFromClock(lab.availableTo);
  const dayOpen = campusLocalToUtc(dateIso, 0, openMinutes, offsetMinutes);
  const dayClose = campusLocalToUtc(dateIso, 0, closeMinutes, offsetMinutes);

  const start = new Date(Math.max(new Date(dayOpen).getTime(), new Date(fromIso).getTime()));
  const end = new Date(Math.min(new Date(dayClose).getTime(), new Date(toIso).getTime()));
  if (end <= start) return null;
  return { start: start.toISOString(), end: end.toISOString() };
}

export function subtractIntervals(
  base: { start: string; end: string },
  busy: { start: string; end: string }[],
): { start: string; end: string }[] {
  let segments = [{ start: base.start, end: base.end }];
  for (const block of busy) {
    const next: { start: string; end: string }[] = [];
    for (const segment of segments) {
      if (!overlaps(segment.start, segment.end, block.start, block.end)) {
        next.push(segment);
        continue;
      }
      if (new Date(block.start) > new Date(segment.start)) {
        next.push({ start: segment.start, end: block.start });
      }
      if (new Date(block.end) < new Date(segment.end)) {
        next.push({ start: block.end, end: segment.end });
      }
    }
    segments = next;
  }
  return segments.filter(
    (segment) => new Date(segment.end).getTime() - new Date(segment.start).getTime() >= 60_000,
  );
}

export function freeIntervals(params: {
  unitIds: string[];
  from: string;
  to: string;
  lab: LabRules;
  busy: BusyInterval[];
  blackouts?: { start: string; end: string }[];
  offsetMinutes?: number;
}): FreeInterval[] {
  const { unitIds, from, to, lab, busy, blackouts = [], offsetMinutes = 330 } = params;
  const result: FreeInterval[] = [];

  for (const date of dayRange(from, to)) {
    const window = openingWindow(date, lab, from, to, offsetMinutes);
    if (!window) continue;

    const closedSegments = blackouts.filter((block) =>
      overlaps(window.start, window.end, block.start, block.end),
    );
    const open = subtractIntervals(window, closedSegments);
    for (const segment of open) {
      for (const unitId of unitIds) {
        const unitBusy = busy.filter((block) => block.unitId === unitId);
        for (const free of subtractIntervals(segment, unitBusy)) {
          result.push({ unitId, start: free.start, end: free.end });
        }
      }
    }
  }

  return result.sort((a, b) => {
    const startDelta = new Date(a.start).getTime() - new Date(b.start).getTime();
    return startDelta !== 0 ? startDelta : a.unitId.localeCompare(b.unitId);
  });
}

/**
 * Availability grid for the UI: one row of fixed-length slots per open day.
 * The calendar grid and the equivalent list view both render from this.
 */
export function availabilityGrid(params: {
  unitIds: string[];
  from: string;
  to: string;
  lab: LabRules;
  busy: BusyInterval[];
  blackouts?: { start: string; end: string }[];
  slotMinutes?: number;
  offsetMinutes?: number;
}): {
  date: string;
  slots: { start: string; end: string; freeUnits: number; totalUnits: number }[];
}[] {
  const {
    unitIds,
    from,
    to,
    lab,
    busy,
    blackouts = [],
    slotMinutes = 60,
    offsetMinutes = 330,
  } = params;

  const days = new Map<string, { start: string; end: string; freeUnits: number; totalUnits: number }[]>();

  for (const date of dayRange(from, to)) {
    // Build the grid from the day's own opening boundary so slots stay aligned
    // to the hour (e.g. 09:00, 10:00) even when `from` is mid-morning.
    const dayOpen = campusLocalToUtc(
      date,
      0,
      minutesFromClock(lab.availableFrom),
      offsetMinutes,
    );
    const dayClose = campusLocalToUtc(
      date,
      0,
      minutesFromClock(lab.availableTo),
      offsetMinutes,
    );
    const window = openingWindow(date, lab, dayOpen, dayClose, offsetMinutes);
    if (!window) continue;
    const slots: { start: string; end: string; freeUnits: number; totalUnits: number }[] = [];
    let cursor = new Date(window.start);
    const windowEnd = new Date(window.end);
    const rangeEnd = new Date(to);
    const rangeStart = new Date(from);

    while (cursor.getTime() + slotMinutes * 60_000 <= windowEnd.getTime()) {
      const slotStart = cursor.toISOString();
      const slotEnd = new Date(cursor.getTime() + slotMinutes * 60_000).toISOString();
      let freeUnits = 0;
      for (const unitId of unitIds) {
        const blockedByBooking = busy.some(
          (block) => block.unitId === unitId && overlaps(slotStart, slotEnd, block.start, block.end),
        );
        const blockedByLab = blackouts.some((block) =>
          overlaps(slotStart, slotEnd, block.start, block.end),
        );
        if (!blockedByBooking && !blockedByLab) freeUnits += 1;
      }
      if (new Date(slotStart) >= rangeStart && new Date(slotStart) < rangeEnd) {
        slots.push({ start: slotStart, end: slotEnd, freeUnits, totalUnits: unitIds.length });
      }
      cursor = new Date(cursor.getTime() + slotMinutes * 60_000);
    }
    if (slots.length > 0) days.set(campusDate(window.start, offsetMinutes), slots);
  }

  return [...days.entries()].map(([date, slots]) => ({ date, slots }));
}

/** First free contiguous block of `hours` for any unit. */
export function firstFit(
  intervals: Interval[],
  hours: number,
): Interval | null {
  const needMs = hours * 3_600_000;
  const sorted = [...intervals].sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
  for (const interval of sorted) {
    if (new Date(interval.end).getTime() - new Date(interval.start).getTime() >= needMs) {
      return {
        unitId: interval.unitId,
        start: interval.start,
        end: new Date(new Date(interval.start).getTime() + needMs).toISOString(),
      };
    }
  }
  return null;
}

export function describeClock(value: string): string {
  return `${campusDate(value)} ${campusClock(value)}`;
}

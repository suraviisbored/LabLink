import type { Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import {
  availabilityFor,
  blackoutsForLab,
  busyIntervals,
  equipmentUnits,
  labForEquipment,
  maintenanceIntervals,
  requireEquipment,
} from "@/lib/repo/catalogue";
import type { Booking, CampusSettings, Equipment, WaitlistEntry } from "@/lib/types";
import {
  addMinutes,
  campusClock,
  campusWeekday,
  diffHours,
  minutesFromClock,
  nowIso,
  overlaps,
  sameWeek,
} from "@/lib/time";

/**
 * Booking rules (PRD FR-2). In production `book_slot()` is the single write
 * path and the database holds the invariants; this module mirrors those rules
 * for the in-memory adapter so the same API behaviour is testable offline.
 */

export interface BookingView {
  booking: Booking;
  equipmentName: string;
  assetTag: string;
  labName: string;
  studentName: string;
}

export function getSettings(store: Store, campusId: string): CampusSettings {
  const settings = store.data.settings.find((entry) => entry.campusId === campusId);
  if (settings) return settings;
  const fallback: CampusSettings = {
    campusId,
    weeklyHoursQuota: 10,
    cancelCutoffHours: 2,
    graceMinutes: 15,
    fairnessWeights: {
      deadline: 0.35,
      priority: 0.25,
      recentUsage: 0.2,
      hoursEfficiency: 0.1,
      reliability: 0.1,
    },
  };
  store.data.settings.push(fallback);
  return fallback;
}

export function weeklyUsageHours(store: Store, userId: string, at: string): number {
  return store.data.bookings
    .filter(
      (booking) =>
        booking.userId === userId &&
        ["confirmed", "checked_in", "completed"].includes(booking.status) &&
        sameWeek(booking.startTime, at),
    )
    .reduce((sum, booking) => sum + diffHours(booking.startTime, booking.endTime), 0);
}

export function toBookingView(store: Store, booking: Booking): BookingView {
  const equipment = store.data.equipment.find((item) => item.id === booking.equipmentId);
  const unit = store.data.units.find((item) => item.id === booking.unitId);
  const lab = equipment ? store.data.labs.find((item) => item.id === equipment.labId) : undefined;
  const student = store.data.profiles.find((item) => item.id === booking.userId);
  return {
    booking,
    equipmentName: equipment?.name ?? "Removed equipment",
    assetTag: unit?.assetTag ?? "—",
    labName: lab?.name ?? "—",
    studentName: student?.name ?? "Unknown",
  };
}

function validateInsideLab(
  store: Store,
  equipment: Equipment,
  start: string,
  end: string,
): void {
  const lab = labForEquipment(store, equipment);
  const weekday = campusWeekday(start);
  if (!lab.availableDays.includes(weekday)) {
    throw new ApiError("OUTSIDE_AVAILABILITY", "The lab is closed that day. Choose a weekday slot.");
  }

  const startMinutes = minutesFromClock(campusClock(start));
  const endMinutes = minutesFromClock(campusClock(end));
  const open = minutesFromClock(lab.availableFrom);
  const close = minutesFromClock(lab.availableTo);

  if (startMinutes < open || endMinutes > close || endMinutes <= startMinutes) {
    throw new ApiError(
      "OUTSIDE_AVAILABILITY",
      `The lab is open ${lab.availableFrom}-${lab.availableTo}. Choose a slot inside those hours.`,
    );
  }

  const blackout = blackoutsForLab(store, lab.id).find((block) =>
    overlaps(block.startTime, block.endTime, start, end),
  );
  if (blackout) {
    throw new ApiError(
      "OUTSIDE_AVAILABILITY",
      `The lab is closed for maintenance${blackout.reason ? ` (${blackout.reason})` : ""}.`,
    );
  }
}

export interface BookSlotInput {
  campusId: string;
  userId: string;
  equipmentId: string;
  startTime: string;
  endTime: string;
  idempotencyKey: string;
  requestId?: string | null;
}

export interface BookSlotResult {
  booking: Booking;
  replayed: boolean;
}

/**
 * Mirrors book_slot(): idempotency, availability, quota, maintenance, then a
 * free unit. Throws SLOT_TAKEN with the three nearest alternatives attached.
 */
export function bookSlot(store: Store, input: BookSlotInput): BookSlotResult {
  const existing = store.data.bookings.find(
    (booking) => booking.idempotencyKey === input.idempotencyKey,
  );
  if (existing) {
    if (existing.userId !== input.userId) {
      throw new ApiError("FORBIDDEN", "That idempotency key belongs to another user.");
    }
    return { booking: existing, replayed: true };
  }

  if (new Date(input.endTime) <= new Date(input.startTime)) {
    throw new ApiError("VALIDATION_ERROR", "The end time must be after the start time.");
  }

  const equipment = requireEquipment(store, input.campusId, input.equipmentId);
  if (equipment.status !== "available") {
    throw new ApiError("OUTSIDE_AVAILABILITY", "That equipment is not available right now.");
  }

  validateInsideLab(store, equipment, input.startTime, input.endTime);

  const settings = getSettings(store, input.campusId);
  const duration = diffHours(input.startTime, input.endTime);
  const used = weeklyUsageHours(store, input.userId, input.startTime);
  if (used + duration > settings.weeklyHoursQuota) {
    throw new ApiError(
      "QUOTA_EXCEEDED",
      `That would use ${Number((used + duration).toFixed(1))} h of your ${settings.weeklyHoursQuota} h weekly quota.`,
      { used, quota: settings.weeklyHoursQuota },
    );
  }

  if (equipment.requiresCertification) {
    const valid = store.data.userCertifications.some(
      (cert) =>
        cert.userId === input.userId &&
        cert.campusId === input.campusId &&
        (!cert.validUntil || new Date(cert.validUntil) > new Date()),
    );
    if (!valid) {
      throw new ApiError(
        "CERT_REQUIRED",
        `${equipment.name} needs a safety certification. Ask your campus admin to record one.`,
      );
    }
  }

  const units = equipmentUnits(store, input.campusId, equipment.id).filter(
    (unit) => unit.status === "available",
  );
  if (units.length === 0) {
    throw new ApiError("OUTSIDE_AVAILABILITY", "Every unit of this equipment is unavailable.");
  }

  const freeUnit = units.find((unit) => {
    const booked = store.data.bookings.some(
      (booking) =>
        booking.unitId === unit.id &&
        (booking.status === "confirmed" || booking.status === "checked_in") &&
        overlaps(booking.startTime, booking.endTime, input.startTime, input.endTime),
    );
    if (booked) return false;
    const blocked = store.data.maintenance.some(
      (block) =>
        block.unitId === unit.id &&
        overlaps(block.startTime, block.endTime, input.startTime, input.endTime),
    );
    return !blocked;
  });

  if (!freeUnit) {
    throw new ApiError("SLOT_TAKEN", "That slot was just taken. Here are 3 nearby times.", {
      alternatives: nearestFreeSlots(store, input.campusId, equipment.id, input.startTime, 3),
    });
  }

  const booking: Booking = {
    id: store.nextId("book"),
    campusId: input.campusId,
    unitId: freeUnit.id,
    equipmentId: equipment.id,
    userId: input.userId,
    requestId: input.requestId ?? null,
    seriesId: null,
    startTime: input.startTime,
    endTime: input.endTime,
    status: "confirmed",
    checkedInAt: null,
    idempotencyKey: input.idempotencyKey,
    version: 1,
    createdAt: store.now(),
  };
  store.data.bookings.push(booking);
  return { booking, replayed: false };
}

export function listBookingsForUser(
  store: Store,
  campusId: string,
  userId: string,
): BookingView[] {
  return store.data.bookings
    .filter((booking) => booking.campusId === campusId && booking.userId === userId)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .map((booking) => toBookingView(store, booking));
}

export function listBookingsForEquipment(
  store: Store,
  campusId: string,
  equipmentId: string,
): BookingView[] {
  return store.data.bookings
    .filter((booking) => booking.campusId === campusId && booking.equipmentId === equipmentId)
    .map((booking) => toBookingView(store, booking));
}

export function cancelBooking(
  store: Store,
  params: { campusId: string; userId: string; bookingId: string; isAdmin: boolean },
): Booking {
  const booking = store.data.bookings.find(
    (entry) => entry.id === params.bookingId && entry.campusId === params.campusId,
  );
  if (!booking) throw new ApiError("NOT_FOUND", "That booking does not exist in your campus.");
  if (booking.userId !== params.userId && !params.isAdmin) {
    throw new ApiError("FORBIDDEN", "You can only cancel your own bookings.");
  }
  if (!["confirmed", "checked_in"].includes(booking.status)) {
    throw new ApiError("VALIDATION_ERROR", "That booking is already closed.");
  }

  const settings = getSettings(store, booking.campusId);
  const hoursToStart = diffHours(nowIso(), booking.startTime);
  if (!params.isAdmin && hoursToStart < settings.cancelCutoffHours) {
    throw new ApiError(
      "FORBIDDEN",
      `Bookings can only be cancelled up to ${settings.cancelCutoffHours} h before the start time.`,
    );
  }

  booking.status = "cancelled";
  booking.version += 1;
  return booking;
}

export function checkInBooking(
  store: Store,
  params: { campusId: string; userId: string; bookingId: string },
): Booking {
  const booking = store.data.bookings.find(
    (entry) =>
      entry.id === params.bookingId &&
      entry.campusId === params.campusId &&
      entry.userId === params.userId,
  );
  if (!booking) throw new ApiError("NOT_FOUND", "That booking is not yours.");
  if (booking.status !== "confirmed") {
    throw new ApiError("VALIDATION_ERROR", "Only a confirmed booking can be checked in.");
  }

  const settings = getSettings(store, booking.campusId);
  const now = nowIso();
  const earliest = addMinutes(booking.startTime, -15);
  const graceEnd = addMinutes(booking.startTime, settings.graceMinutes);
  if (new Date(now) < new Date(earliest) || new Date(now) > new Date(graceEnd)) {
    throw new ApiError("VALIDATION_ERROR", "The check-in window is closed.");
  }

  booking.status = "checked_in";
  booking.checkedInAt = now;
  booking.version += 1;
  return booking;
}

/**
 * Lazy no-show sweep (Stretch 1). Idempotent: the update is conditional on the
 * booking still being confirmed and unchecked.
 */
export function sweepNoShows(
  store: Store,
  campusId: string | null,
  now: string = nowIso(),
): Booking[] {
  const released: Booking[] = [];
  for (const booking of store.data.bookings) {
    if (campusId && booking.campusId !== campusId) continue;
    if (booking.status !== "confirmed" || booking.checkedInAt) continue;
    const settings = getSettings(store, booking.campusId);
    if (new Date(addMinutes(booking.startTime, settings.graceMinutes)) < new Date(now)) {
      booking.status = "no_show";
      booking.version += 1;
      released.push(booking);
    }
  }
  return released;
}

/** Three nearest free slots around a start time, for the 409 body. */
export function nearestFreeSlots(
  store: Store,
  campusId: string,
  equipmentId: string,
  around: string,
  count = 3,
  durationHours = 1,
): { start: string; end: string; freeUnits: number }[] {
  const equipment = requireEquipment(store, campusId, equipmentId);
  const from = addMinutes(around, -120);
  const to = addMinutes(around, 60 * 24 * 7);
  const grid = availabilityFor(store, equipment, from, to, 60);

  const target = new Date(around).getTime();
  const candidates = grid
    .flatMap((day) => day.slots)
    .filter((slot) => slot.freeUnits > 0)
    .sort(
      (a, b) =>
        Math.abs(new Date(a.start).getTime() - target) -
        Math.abs(new Date(b.start).getTime() - target),
    )
    .slice(0, count);

  return candidates.map((slot) => ({
    start: slot.start,
    end: addMinutes(slot.start, durationHours * 60),
    freeUnits: slot.freeUnits,
  }));
}

/** Waitlist (Stretch 3): promote the head entry whose desired window is free. */
export function promoteWaitlist(
  store: Store,
  campusId: string,
  equipmentId: string,
  freed: { startTime: string; endTime: string },
): { entry: WaitlistEntry; booking: Booking } | null {
  const head = store.data.waitlist
    .filter(
      (entry) =>
        entry.campusId === campusId &&
        entry.equipmentId === equipmentId &&
        entry.status === "waiting" &&
        overlaps(entry.desiredStart, entry.desiredEnd, freed.startTime, freed.endTime),
    )
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];

  if (!head) return null;

  try {
    const { booking } = bookSlot(store, {
      campusId,
      userId: head.userId,
      equipmentId,
      startTime: head.desiredStart,
      endTime: head.desiredEnd,
      idempotencyKey: `waitlist-${head.id}`,
    });
    head.status = "promoted";
    return { entry: head, booking };
  } catch {
    return null;
  }
}

export function joinWaitlist(
  store: Store,
  campusId: string,
  userId: string,
  input: { equipmentId: string; startTime: string; endTime: string },
): WaitlistEntry {
  const equipment = requireEquipment(store, campusId, input.equipmentId);
  const existing = store.data.waitlist.find(
    (entry) =>
      entry.equipmentId === equipment.id &&
      entry.userId === userId &&
      entry.desiredStart === input.startTime &&
      entry.status === "waiting",
  );
  if (existing) return existing;

  const entry: WaitlistEntry = {
    id: store.nextId("wait"),
    campusId,
    equipmentId: equipment.id,
    userId,
    desiredStart: input.startTime,
    desiredEnd: input.endTime,
    status: "waiting",
    createdAt: store.now(),
  };
  store.data.waitlist.push(entry);
  return entry;
}

export function leaveWaitlist(
  store: Store,
  campusId: string,
  userId: string,
  waitlistId: string,
): void {
  const entry = store.data.waitlist.find(
    (item) => item.id === waitlistId && item.campusId === campusId && item.userId === userId,
  );
  if (!entry) throw new ApiError("NOT_FOUND", "That waitlist entry is not yours.");
  entry.status = "cancelled";
}

export function waitlistForUser(store: Store, campusId: string, userId: string): WaitlistEntry[] {
  return store.data.waitlist.filter(
    (entry) => entry.campusId === campusId && entry.userId === userId && entry.status === "waiting",
  );
}

export function usageStats(
  store: Store,
  userId: string,
  now: string,
): { recentHours: number; noShows: number; completions: number } {
  const since = addMinutes(now, -14 * 24 * 60);
  const recentHours = store.data.bookings
    .filter(
      (booking) =>
        booking.userId === userId &&
        ["confirmed", "checked_in", "completed"].includes(booking.status) &&
        new Date(booking.startTime) >= new Date(since),
    )
    .reduce((sum, booking) => sum + diffHours(booking.startTime, booking.endTime), 0);

  const noShows = store.data.bookings.filter(
    (booking) => booking.userId === userId && booking.status === "no_show",
  ).length;
  const completions = store.data.bookings.filter(
    (booking) => booking.userId === userId && booking.status === "completed",
  ).length;

  return {
    recentHours: Math.round(recentHours * 100) / 100,
    noShows,
    completions,
  };
}

export function conflictBusyFor(
  store: Store,
  campusId: string,
  equipmentId: string,
): { unitId: string; start: string; end: string }[] {
  return busyIntervals(store, equipmentId).filter(() => true);
}

export function equipmentMaintenanceFor(
  store: Store,
  equipmentId: string,
): { unitId: string; start: string; end: string }[] {
  return maintenanceIntervals(store, equipmentId);
}

export function equipmentBlackouts(store: Store, equipment: Equipment) {
  return blackoutsForLab(store, equipment.labId);
}

import type { Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { getSettings } from "@/lib/repo/bookings";
import { equipmentUnits, listEquipment, listLabs } from "@/lib/repo/catalogue";
import type {
  AuditEntry,
  Campus,
  CampusSettings,
  FairnessWeights,
} from "@/lib/types";
import { dayRange } from "@/lib/solver/slots";
import {
  campusClock,
  campusLocalToUtc,
  campusWeekday,
  diffHours,
  minutesFromClock,
  nowIso,
  overlaps,
} from "@/lib/time";

/**
 * Admin analytics and platform administration (PRD FR-6, FR-7, FR-8).
 * Utilisation is computed from bookings and lab opening hours; no query inside
 * a loop, one pass over the campus rows.
 */

export interface UtilisationRow {
  equipmentId: string;
  name: string;
  labName: string;
  departmentName: string;
  units: number;
  bookedHours: number;
  capacityHours: number;
  utilisationPct: number;
  peakHour: string | null;
  idle: boolean;
}

export interface UtilisationReport {
  from: string;
  to: string;
  rows: UtilisationRow[];
  totals: {
    bookedHours: number;
    capacityHours: number;
    utilisationPct: number;
    idleAssets: number;
    peakHour: string | null;
  };
  byHour: { hour: string; hours: number }[];
}

function labOpenHoursBetween(
  lab: { availableFrom: string; availableTo: string; availableDays: number[] },
  from: string,
  to: string,
): number {
  let total = 0;
  for (const date of dayRange(from, to)) {
    const open = campusLocalToUtc(date, 0, minutesFromClock(lab.availableFrom));
    if (!lab.availableDays.includes(campusWeekday(open))) continue;
    const close = campusLocalToUtc(date, 0, minutesFromClock(lab.availableTo));
    const start = Math.max(new Date(open).getTime(), new Date(from).getTime());
    const end = Math.min(new Date(close).getTime(), new Date(to).getTime());
    if (end > start) total += (end - start) / 3_600_000;
  }
  return total;
}

export function utilisation(
  store: Store,
  campusId: string,
  from: string,
  to: string,
): UtilisationReport {
  const equipment = listEquipment(store, campusId, { limit: 60 }).items;
  const labs = listLabs(store, campusId);
  const hourBuckets = new Map<string, number>();

  const rows: UtilisationRow[] = equipment.map((item) => {
    const lab = labs.find((entry) => entry.id === item.equipment.labId);
    const units = equipmentUnits(store, campusId, item.equipment.id).filter(
      (unit) => unit.status === "available",
    );
    const capacityHours = lab ? labOpenHoursBetween(lab, from, to) * units.length : 0;

    const bookings = store.data.bookings.filter(
      (booking) =>
        booking.campusId === campusId &&
        booking.equipmentId === item.equipment.id &&
        ["confirmed", "checked_in", "completed"].includes(booking.status) &&
        overlaps(booking.startTime, booking.endTime, from, to),
    );

    const bookedHours = bookings.reduce((sum, booking) => {
      const start = Math.max(new Date(booking.startTime).getTime(), new Date(from).getTime());
      const end = Math.min(new Date(booking.endTime).getTime(), new Date(to).getTime());
      return sum + Math.max(0, (end - start) / 3_600_000);
    }, 0);

    for (const booking of bookings) {
      const hour = campusClock(booking.startTime).slice(0, 2);
      hourBuckets.set(hour, (hourBuckets.get(hour) ?? 0) + diffHours(booking.startTime, booking.endTime));
    }

    const utilisationPct =
      capacityHours > 0 ? Math.round((bookedHours / capacityHours) * 1000) / 10 : 0;

    const peak = bookings
      .map((booking) => campusClock(booking.startTime).slice(0, 2))
      .sort((a, b) => a.localeCompare(b))[0];

    return {
      equipmentId: item.equipment.id,
      name: item.equipment.name,
      labName: item.labName,
      departmentName: item.departmentName,
      units: units.length,
      bookedHours: Math.round(bookedHours * 10) / 10,
      capacityHours: Math.round(capacityHours * 10) / 10,
      utilisationPct,
      peakHour: peak ? `${peak}:00` : null,
      idle: bookedHours === 0,
    };
  });

  const bookedHours = rows.reduce((sum, row) => sum + row.bookedHours, 0);
  const capacityHours = rows.reduce((sum, row) => sum + row.capacityHours, 0);
  const byHour = [...hourBuckets.entries()]
    .map(([hour, hours]) => ({ hour: `${hour}:00`, hours: Math.round(hours * 10) / 10 }))
    .sort((a, b) => b.hours - a.hours);
  const peakHour = [...hourBuckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    from,
    to,
    rows,
    totals: {
      bookedHours: Math.round(bookedHours * 10) / 10,
      capacityHours: Math.round(capacityHours * 10) / 10,
      utilisationPct: capacityHours > 0 ? Math.round((bookedHours / capacityHours) * 1000) / 10 : 0,
      idleAssets: rows.filter((row) => row.idle).length,
      peakHour: peakHour ? `${peakHour}:00` : null,
    },
    byHour,
  };
}

export function listAudit(store: Store, campusId: string, limit = 100): AuditEntry[] {
  return store.data.audit
    .filter((entry) => entry.campusId === campusId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function audit(
  store: Store,
  params: {
    campusId: string | null;
    actorId: string | null;
    action: string;
    entity: string;
    entityId?: string | null;
    metadata?: Record<string, unknown>;
  },
): void {
  store.data.audit.push({
    id: store.nextId("audit"),
    campusId: params.campusId,
    actorId: params.actorId,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId ?? null,
    metadata: params.metadata ?? {},
    createdAt: nowIso(),
  });
}

export function updateCampusSettings(
  store: Store,
  campusId: string,
  patch: {
    weeklyHoursQuota?: number;
    cancelCutoffHours?: number;
    graceMinutes?: number;
    fairnessWeights?: Partial<FairnessWeights>;
  },
): CampusSettings {
  const settings = getSettings(store, campusId);

  if (patch.weeklyHoursQuota !== undefined) {
    if (patch.weeklyHoursQuota < 1 || patch.weeklyHoursQuota > 60) {
      throw new ApiError("VALIDATION_ERROR", "The weekly quota must be between 1 and 60 hours.");
    }
    settings.weeklyHoursQuota = patch.weeklyHoursQuota;
  }
  if (patch.cancelCutoffHours !== undefined) {
    if (patch.cancelCutoffHours < 0 || patch.cancelCutoffHours > 48) {
      throw new ApiError("VALIDATION_ERROR", "The cancel cutoff must be between 0 and 48 hours.");
    }
    settings.cancelCutoffHours = patch.cancelCutoffHours;
  }
  if (patch.graceMinutes !== undefined) {
    if (patch.graceMinutes < 0 || patch.graceMinutes > 60) {
      throw new ApiError("VALIDATION_ERROR", "The grace period must be between 0 and 60 minutes.");
    }
    settings.graceMinutes = patch.graceMinutes;
  }
  if (patch.fairnessWeights) {
    const next = { ...settings.fairnessWeights, ...patch.fairnessWeights };
    const total = Object.values(next).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 0.001) {
      throw new ApiError("VALIDATION_ERROR", "Fairness weights must add up to 1.00.");
    }
    settings.fairnessWeights = next;
  }

  return settings;
}

export function listCampuses(store: Store): Campus[] {
  return [...store.data.campuses].sort((a, b) => a.name.localeCompare(b.name));
}

export function createCampus(
  store: Store,
  input: { name: string; domains: string[]; timezone?: string },
): Campus {
  const domains = input.domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);

  if (domains.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Add at least one email domain.");
  }

  for (const domain of domains) {
    const existing = store.data.campusDomains.find((entry) => entry.domain === domain);
    if (existing) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `${domain} is already mapped to another campus. One domain maps to exactly one campus.`,
      );
    }
  }

  const campus: Campus = {
    id: store.nextId("campus"),
    name: input.name.trim(),
    timezone: input.timezone ?? "Asia/Kolkata",
    allowedEmailDomains: domains,
    isDemo: false,
    isActive: true,
  };
  store.data.campuses.push(campus);
  for (const domain of domains) {
    store.data.campusDomains.push({ domain, campusId: campus.id });
  }
  return campus;
}

export function campusMembers(store: Store, campusId: string) {
  return store.data.profiles
    .filter((profile) => profile.campusId === campusId)
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

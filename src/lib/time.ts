/**
 * Time helpers. Storage and transport are UTC; the UI renders IST (PRD FR-2).
 * The solver never touches `Date` formatting so its behaviour is deterministic
 * under test injection.
 */

export const IST_OFFSET_MINUTES = 330;

export function nowIso(): string {
  return new Date().toISOString();
}

export function iso(value: Date | string | number): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function addMinutes(isoString: string, minutes: number): string {
  return new Date(new Date(isoString).getTime() + minutes * 60_000).toISOString();
}

export function addDays(isoString: string, days: number): string {
  return addMinutes(isoString, days * 24 * 60);
}

export function diffHours(startIso: string, endIso: string): number {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
}

export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

/** Start of the ISO week (Monday 00:00 UTC) containing `value`. */
export function startOfWeek(value: string): string {
  const date = new Date(value);
  const day = date.getUTCDay(); // 0 = Sunday
  const delta = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() + delta);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

export function sameWeek(a: string, b: string): boolean {
  return startOfWeek(a) === startOfWeek(b);
}

const istDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "2-digit",
  month: "short",
});

const istTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

const istFull = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

export function formatIstTime(value: string): string {
  return istTime.format(new Date(value)).toUpperCase();
}

export function formatIstDate(value: string): string {
  return istDate.format(new Date(value));
}

export function formatIst(value: string): string {
  return istFull.format(new Date(value)).toUpperCase();
}

export function formatIstRange(start: string, end: string): string {
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(start)) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(end));
  return sameDay
    ? `${formatIstDate(start)}, ${formatIstTime(start)} - ${formatIstTime(end)}`
    : `${formatIst(start)} - ${formatIst(end)}`;
}

export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))} h`;
}

export function relativeTime(value: string, from: Date = new Date()): string {
  const deltaMinutes = Math.round((new Date(value).getTime() - from.getTime()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(deltaMinutes);
  if (abs < 60) return formatter.format(deltaMinutes, "minute");
  if (abs < 60 * 24) return formatter.format(Math.round(deltaMinutes / 60), "hour");
  return formatter.format(Math.round(deltaMinutes / (60 * 24)), "day");
}

/**
 * Builds a UTC instant from a campus-local wall clock time, using a fixed
 * offset. India has no DST, so this stays exact for the only timezone we serve.
 */
export function campusLocalToUtc(
  dateIso: string,
  hour: number,
  minute = 0,
  offsetMinutes = IST_OFFSET_MINUTES,
): string {
  const [year, month, day] = dateIso.slice(0, 10).split("-").map(Number);
  const utcMs = Date.UTC(year!, (month ?? 1) - 1, day ?? 1, hour, minute) - offsetMinutes * 60_000;
  return new Date(utcMs).toISOString();
}

/** ISO weekday (1 = Monday) in the campus timezone. */
export function campusWeekday(value: string, offsetMinutes = IST_OFFSET_MINUTES): number {
  const shifted = new Date(new Date(value).getTime() + offsetMinutes * 60_000);
  const day = shifted.getUTCDay();
  return day === 0 ? 7 : day;
}

/** "HH:MM" wall clock in the campus timezone. */
export function campusClock(value: string, offsetMinutes = IST_OFFSET_MINUTES): string {
  const shifted = new Date(new Date(value).getTime() + offsetMinutes * 60_000);
  return `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}`;
}

/** YYYY-MM-DD in the campus timezone. */
export function campusDate(value: string | Date, offsetMinutes = IST_OFFSET_MINUTES): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function minutesFromClock(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

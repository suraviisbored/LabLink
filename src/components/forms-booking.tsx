"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Grid2x2, List } from "lucide-react";
import { ApiClientError, apiFetch } from "@/lib/client/api";
import { formatIstDate, formatIstRange, formatIstTime } from "@/lib/time";

export interface SlotDay {
  date: string;
  slots: { start: string; end: string; freeUnits: number; totalUnits: number }[];
}

export function BookingForm({
  equipmentId,
  days,
  quotaRemaining,
  canBook,
  reason,
}: {
  equipmentId: string;
  days: SlotDay[];
  quotaRemaining: number;
  canBook: boolean;
  reason?: string;
}) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<string | null>(null);
  const [duration, setDuration] = useState(1);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "error" | "done"; message?: string }>({
    kind: "idle",
  });
  const [alternatives, setAlternatives] = useState<{ start: string; end: string }[]>([]);
  const idempotency = useRef<string>(crypto.randomUUID());

  const flatSlots = useMemo(
    () => days.flatMap((day) => day.slots.map((slot) => ({ ...slot, date: day.date }))),
    [days],
  );

  const selectedSlot = flatSlots.find((slot) => slot.start === selected) ?? null;

  const maxDuration = useMemo(() => {
    if (!selectedSlot) return 1;
    const day = days.find((entry) => entry.date === selectedSlot.date);
    if (!day) return 1;
    const index = day.slots.findIndex((slot) => slot.start === selectedSlot.start);
    let run = 0;
    for (let cursor = index; cursor < day.slots.length; cursor += 1) {
      const slot = day.slots[cursor];
      if (!slot || slot.freeUnits === 0) break;
      run += 1;
    }
    return Math.max(0.5, Math.min(4, run));
  }, [days, selectedSlot]);

  async function book(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedSlot) return;

    const start = selectedSlot.start;
    const end = new Date(new Date(start).getTime() + duration * 3_600_000).toISOString();

    setStatus({ kind: "busy" });
    setAlternatives([]);
    try {
      const result = await apiFetch<{ booking: { booking: { id: string } }; replayed: boolean }>(
        "/api/v1/bookings",
        {
          method: "POST",
          body: JSON.stringify({
            equipmentId,
            startTime: start,
            endTime: end,
            idempotencyKey: idempotency.current,
          }),
        },
      );
      setStatus({
        kind: "done",
        message: result.replayed
          ? "That booking was already confirmed."
          : `Booked: ${formatIstRange(start, end)}.`,
      });
      idempotency.current = crypto.randomUUID();
      router.refresh();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setStatus({ kind: "error", message: caught.message });
        const raw = caught.details.alternatives;
        if (Array.isArray(raw)) {
          setAlternatives(
            raw
              .filter((entry): entry is { start: string; end: string } => Boolean(entry))
              .map((entry) => ({ start: entry.start, end: entry.end })),
          );
        }
      } else {
        setStatus({ kind: "error", message: "That did not go through. Try another slot." });
      }
    }
  }

  if (!canBook) {
    return (
      <div className="card p-4">
        <p className="text-sm">
          You cannot book this equipment yet. {reason ?? "Ask your campus admin for access."}
        </p>
      </div>
    );
  }

  return (
    <form className="card p-4" onSubmit={book}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg">Pick a slot</h2>
        <div className="flex gap-1" role="group" aria-label="Availability view">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <Grid2x2 aria-hidden="true" size={14} strokeWidth={1.75} /> Grid
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List aria-hidden="true" size={14} strokeWidth={1.75} /> List
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-muted">
        Times are IST. {quotaRemaining > 0 ? `${quotaRemaining} h left in your weekly quota.` : "Your weekly quota is used up."}
      </p>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Available slots for the next 7 days</legend>
        <div className={view === "grid" ? "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-col gap-2"}>
          {days.map((day) =>
            day.slots.map((slot, index) => {
              const showDayHeading = view === "list" && index === 0;
              return (
                <div key={slot.start}>
                  {showDayHeading ? (
                    <p className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {formatIstDate(day.date)}
                    </p>
                  ) : null}
                  <label
                    className="grid-slot cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink"
                    data-selected={selected === slot.start}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">
                        {view === "grid" ? formatIstTime(slot.start) : `${formatIstDate(slot.start)} · ${formatIstTime(slot.start)}`}
                      </span>
                      <small>
                        {slot.freeUnits} of {slot.totalUnits} free
                      </small>
                    </span>
                    <input
                      type="radio"
                      name="slot"
                      value={slot.start}
                      className="sr-only"
                      checked={selected === slot.start}
                      onChange={() => {
                        setSelected(slot.start);
                        setDuration(1);
                        setStatus({ kind: "idle" });
                        setAlternatives([]);
                      }}
                    />
                  </label>
                </div>
              );
            }),
          )}
        </div>
        {flatSlots.length === 0 ? (
          <p className="text-sm text-muted">
            No free slots in the next week. Join the waitlist or check another machine.
          </p>
        ) : null}
      </fieldset>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-40">
          <label className="label" htmlFor="duration">
            Duration
          </label>
          <select
            className="select"
            id="duration"
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value))}
          >
            {Array.from({ length: Math.round(maxDuration * 2) }, (_, index) => (index + 1) / 2).map((value) => (
              <option key={value} value={value}>
                {value} h
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" type="submit" disabled={!selectedSlot || status.kind === "busy"}>
          {status.kind === "busy" ? "Booking..." : "Book this slot"}
        </button>
      </div>

      <div aria-live="polite" className="mt-3">
        {status.kind === "done" ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.75} />
            {status.message}
          </p>
        ) : null}
        {status.kind === "error" ? (
          <div className="text-sm text-danger">
            <p>{status.message}</p>
            {alternatives.length > 0 ? (
              <div className="mt-2">
                <p className="text-ink">Nearest free times:</p>
                <ul className="mt-1 flex flex-wrap gap-2">
                  {alternatives.map((slot) => (
                    <li key={slot.start}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSelected(slot.start);
                          setStatus({ kind: "idle" });
                          setAlternatives([]);
                        }}
                      >
                        {formatIstRange(slot.start, slot.end)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </form>
  );
}

export function CancelBookingButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    if (!window.confirm("Cancel this booking? This cannot be undone.")) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "cancel" }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Could not cancel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={cancel} disabled={busy}>
        {busy ? "Cancelling..." : "Cancel booking"}
      </button>
      {error ? (
        <p aria-live="polite" className="mt-1 max-w-[220px] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CheckInButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function checkIn() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/v1/bookings/${bookingId}/check-in`, { method: "POST", body: "{}" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : "Could not check in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={checkIn} disabled={busy}>
        {busy ? "Checking in..." : "Check in"}
      </button>
      {error ? (
        <p aria-live="polite" className="mt-1 max-w-[220px] text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

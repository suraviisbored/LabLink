import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, CircleCheck, UserX } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, TierNote } from "@/components/ui";
import { CancelBookingButton, CheckInButton } from "@/components/forms-booking";
import { getSession } from "@/lib/auth/server";
import { loadStore } from "@/lib/db";
import { listBookingsForUser, sweepNoShows } from "@/lib/repo/bookings";
import { activeWaitlist } from "@/lib/repo/waitlist";
import { formatIstRange, addMinutes, nowIso } from "@/lib/time";

export default async function BookingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.campusId) redirect("/admin/campuses");

  const store = await loadStore();
  // Lazy sweep before reading, so the list never shows an expired confirmation.
  sweepNoShows(store, session.campusId);

  const bookings = listBookingsForUser(store, session.campusId, session.userId);
  const waitlist = activeWaitlist(store, session.campusId, session.userId);
  const now = nowIso();
  const live = bookings.filter((entry) => entry.booking.status === "confirmed");
  const past = bookings.filter((entry) => entry.booking.status !== "confirmed");

  return (
    <div>
      <PageHeader
        eyebrow={session.campusName}
        title="My bookings"
        description="Slots you hold across your campus. Check in within the grace period or the slot is released to the waitlist."
        actions={
          <Link className="btn btn-secondary" href="/equipment">
            <CalendarClock aria-hidden="true" size={16} strokeWidth={1.75} />
            Book another slot
          </Link>
        }
      />

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl">Upcoming</h2>
          <TierNote tier="Stretch 1" />
        </div>
        {live.length === 0 ? (
          <EmptyState
            title="No live bookings"
            description="Pick an equipment item and a free slot; your booking appears here immediately."
            action={{ href: "/equipment", label: "Browse equipment" }}
          />
        ) : (
          <ul className="space-y-3">
            {live.map(({ booking, equipmentName, assetTag, labName }) => {
              const checkInOpen =
                new Date(now) >= new Date(addMinutes(booking.startTime, -15)) &&
                new Date(now) <= new Date(addMinutes(booking.startTime, 15));
              return (
                <Card as="li" key={booking.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg">
                        <Link className="link" href={`/equipment/${booking.equipmentId}`}>
                          {equipmentName}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {formatIstRange(booking.startTime, booking.endTime)} · {labName} ·{" "}
                        <span className="font-mono text-xs">{assetTag}</span>
                      </p>
                    </div>
                    <StatusBadge status={booking.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <CancelBookingButton bookingId={booking.id} />
                    {checkInOpen ? <CheckInButton bookingId={booking.id} /> : null}
                    <p className="text-xs text-muted">
                      {checkInOpen
                        ? "Check in now to keep this slot."
                        : "Check-in opens 15 minutes before the start time."}
                    </p>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 flex items-center gap-2 text-xl">
          Waitlist
          <TierNote tier="Stretch 3" />
        </h2>
        {waitlist.length === 0 ? (
          <p className="text-sm text-muted">
            You are not waiting for anything. Cancellations and no-shows promote the head of the
            waitlist automatically.
          </p>
        ) : (
          <Card className="p-4">
            <table className="table">
              <caption className="sr-only">Your waitlist entries</caption>
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">Window</th>
                  <th scope="col">Position</th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.equipmentName}</td>
                    <td>{formatIstRange(entry.desiredStart, entry.desiredEnd)}</td>
                    <td>#{entry.position}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl">Past and cancelled</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted">Nothing here yet.</p>
        ) : (
          <Card className="p-4">
            <table className="table">
              <caption className="sr-only">Past bookings</caption>
              <thead>
                <tr>
                  <th scope="col">Equipment</th>
                  <th scope="col">Window</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {past.map(({ booking, equipmentName }) => (
                  <tr key={booking.id}>
                    <td>{equipmentName}</td>
                    <td>{formatIstRange(booking.startTime, booking.endTime)}</td>
                    <td>
                      <StatusBadge status={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge tone="success" icon={CircleCheck}>
            Confirmed
          </Badge>
          <Badge tone="danger" icon={UserX}>
            No-show
          </Badge>
          Status is always written out, never colour alone.
        </p>
      </section>
    </div>
  );
}

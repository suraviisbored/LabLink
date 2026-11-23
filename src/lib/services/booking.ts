import { getStore } from "@/lib/db/store";
import { flushEmails } from "@/lib/email";
import { ApiError } from "@/lib/errors";
import {
  bookSlot,
  cancelBooking as cancelBookingRecord,
  checkInBooking,
  listBookingsForUser,
  promoteWaitlist,
  sweepNoShows,
  toBookingView,
  type BookingView,
} from "@/lib/repo/bookings";
import { notify } from "@/lib/repo/notifications";
import { audit } from "@/lib/repo/admin";
import type { Session } from "@/lib/auth/session";
import { formatIstRange } from "@/lib/time";

/**
 * Booking service: repository rules + the side effects PRD FR-9 requires
 * (notification, audit, email). The email send happens after the state change,
 * so a provider failure can never undo a booking.
 */

export async function createBooking(
  session: Session,
  input: {
    equipmentId: string;
    startTime: string;
    endTime: string;
    idempotencyKey: string;
    requestId?: string | null;
  },
): Promise<{ booking: BookingView; replayed: boolean }> {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();

  // Lazy sweep: no cron required (Stretch 1).
  sweepNoShows(store, session.campusId);

  const { booking, replayed } = bookSlot(store, {
    campusId: session.campusId,
    userId: session.userId,
    equipmentId: input.equipmentId,
    startTime: input.startTime,
    endTime: input.endTime,
    idempotencyKey: input.idempotencyKey,
    requestId: input.requestId ?? null,
  });

  if (!replayed) {
    const view = toBookingView(store, booking);
    notify(store, {
      campusId: session.campusId,
      userId: session.userId,
      type: "booking_confirmed",
      title: "Booking confirmed",
      body: `${view.equipmentName} (${view.assetTag}) on ${formatIstRange(booking.startTime, booking.endTime)}.`,
      link: "/bookings",
    });
    audit(store, {
      campusId: session.campusId,
      actorId: session.userId,
      action: "booking.created",
      entity: "bookings",
      entityId: booking.id,
      metadata: { equipmentId: booking.equipmentId, unitId: booking.unitId },
    });
    await flushEmails(store);
  }

  return { booking: toBookingView(store, booking), replayed };
}

export async function cancelBooking(
  session: Session,
  bookingId: string,
): Promise<{ booking: BookingView; promoted: boolean }> {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();

  const booking = cancelBookingRecord(store, {
    campusId: session.campusId,
    userId: session.userId,
    bookingId,
    isAdmin: session.role === "campus_admin",
  });

  notify(store, {
    campusId: booking.campusId,
    userId: booking.userId,
    type: "booking_cancelled",
    title: "Booking cancelled",
    body: `Your booking on ${formatIstRange(booking.startTime, booking.endTime)} was cancelled.`,
    link: "/bookings",
  });
  audit(store, {
    campusId: booking.campusId,
    actorId: session.userId,
    action: "booking.cancelled",
    entity: "bookings",
    entityId: booking.id,
    metadata: {},
  });

  let promoted = false;
  if (session.role === "campus_admin" || booking.userId === session.userId) {
    const result = promoteWaitlist(store, booking.campusId, booking.equipmentId, {
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
    if (result) {
      promoted = true;
      notify(store, {
        campusId: result.booking.campusId,
        userId: result.booking.userId,
        type: "waitlist_promoted",
        title: "A slot opened up",
        body: `You were promoted from the waitlist for ${formatIstRange(result.booking.startTime, result.booking.endTime)}.`,
        link: "/bookings",
        email: true,
      });
    }
  }

  await flushEmails(store);
  return { booking: toBookingView(store, booking), promoted };
}

export async function checkIn(session: Session, bookingId: string): Promise<BookingView> {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();
  const booking = checkInBooking(store, {
    campusId: session.campusId,
    userId: session.userId,
    bookingId,
  });
  audit(store, {
    campusId: booking.campusId,
    actorId: session.userId,
    action: "booking.checked_in",
    entity: "bookings",
    entityId: booking.id,
    metadata: {},
  });
  return toBookingView(store, booking);
}

export async function releaseNoShows(campusId: string): Promise<number> {
  const store = getStore();
  const released = sweepNoShows(store, campusId);
  for (const booking of released) {
    notify(store, {
      campusId: booking.campusId,
      userId: booking.userId,
      type: "no_show",
      title: "Booking released",
      body: `You did not check in, so the slot on ${formatIstRange(booking.startTime, booking.endTime)} was released.`,
      link: "/bookings",
    });
    promoteWaitlist(store, booking.campusId, booking.equipmentId, {
      startTime: booking.startTime,
      endTime: booking.endTime,
    });
  }
  return released.length;
}

export function myBookings(session: Session): BookingView[] {
  if (!session.campusId) return [];
  return listBookingsForUser(getStore(), session.campusId, session.userId);
}

import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { activeWaitlist } from "@/lib/repo/waitlist";
import { createBooking, myBookings } from "@/lib/services/booking";
import { bookingCreateSchema } from "@/lib/validation/schemas";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    return ok({
      bookings: myBookings(session),
      waitlist: activeWaitlist(getStore(), session.campusId, session.userId),
    });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    checkRateLimit(`mut:booking:${session.userId}`, RATE_LIMITS.mutation);
    const input = await readJson(request, bookingCreateSchema);
    const result = await createBooking(session, input);
    return ok(result, result.replayed ? 200 : 201);
  });
}

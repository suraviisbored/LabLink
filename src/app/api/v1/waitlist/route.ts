import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { joinWaitlist, leaveWaitlist } from "@/lib/repo/bookings";
import { activeWaitlist } from "@/lib/repo/waitlist";
import { waitlistSchema } from "@/lib/validation/schemas";

/** Stretch 3: join a waitlist for a full window; promotion is automatic. */
export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    return ok({ waitlist: activeWaitlist(getStore(), session.campusId, session.userId) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const input = await readJson(request, waitlistSchema);
    const entry = joinWaitlist(getStore(), session.campusId, session.userId, input);
    return ok({ entry }, 201);
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new Error("missing id");
    leaveWaitlist(getStore(), session.campusId, session.userId, id);
    return ok({ removed: true });
  });
}

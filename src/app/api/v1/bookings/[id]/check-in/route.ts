import { ok, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { checkIn } from "@/lib/services/booking";

/** Stretch 1: check in within the grace period, or the slot is auto-released. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const { id } = await params;
    const booking = await checkIn(session, id);
    return ok({ booking });
  });
}

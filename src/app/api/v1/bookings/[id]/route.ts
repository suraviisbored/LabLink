import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { cancelBooking } from "@/lib/services/booking";
import { bookingPatchSchema } from "@/lib/validation/schemas";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const { id } = await params;
    await readJson(request, bookingPatchSchema);
    const result = await cancelBooking(session, id);
    return ok(result);
  });
}

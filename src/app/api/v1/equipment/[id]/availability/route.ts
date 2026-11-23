import { ok, withApi } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { availabilityFor, getEquipment } from "@/lib/repo/catalogue";
import { releaseNoShows } from "@/lib/services/booking";
import { addDays, nowIso } from "@/lib/time";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    const { id } = await params;
    const url = new URL(request.url);

    // Reading availability is what triggers the lazy no-show sweep (Stretch 1).
    await releaseNoShows(session.campusId);

    const store = getStore();
    const equipment = getEquipment(store, session.campusId, id);
    if (!equipment) throw new ApiError("NOT_FOUND", "That equipment is not in your campus.");

    const from = url.searchParams.get("from") ?? nowIso();
    const to = url.searchParams.get("to") ?? addDays(from, 7);
    return ok({ availability: availabilityFor(store, equipment, from, to, 60) });
  });
}

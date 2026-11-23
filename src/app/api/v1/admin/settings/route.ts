import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { audit, updateCampusSettings } from "@/lib/repo/admin";
import { getSettings } from "@/lib/repo/bookings";
import { ApiError } from "@/lib/errors";
import { settingsSchema } from "@/lib/validation/schemas";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireRole("campus_admin");
    return ok({ settings: getSettings(getStore(), session.campusId!) });
  });
}

export async function PATCH(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("campus_admin");
    if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
    const input = await readJson(request, settingsSchema);

    const store = getStore();
    const settings = updateCampusSettings(store, session.campusId, input);
    audit(store, {
      campusId: session.campusId,
      actorId: session.userId,
      action: "settings.updated",
      entity: "settings",
      entityId: null,
      metadata: { ...input },
    });
    return ok({ settings });
  });
}

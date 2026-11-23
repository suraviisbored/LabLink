import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { updateEmailPreference } from "@/lib/repo/notifications";
import { preferencesSchema } from "@/lib/validation/schemas";

/** Email opt-out; in-app notifications stay on (FR-9). */
export async function PATCH(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireSession();
    const { emailNotifications } = await readJson(request, preferencesSchema);
    updateEmailPreference(getStore(), session.userId, emailNotifications);
    return ok({ emailNotifications });
  });
}

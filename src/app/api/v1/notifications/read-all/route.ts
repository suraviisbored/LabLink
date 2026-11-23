import { ok, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { markAllRead } from "@/lib/repo/notifications";

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const updated = markAllRead(getStore(), session.campusId, session.userId);
    return ok({ updated, unread: 0 });
  });
}

import { ok, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { markRead, unreadCount } from "@/lib/repo/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const { id } = await params;
    const store = getStore();
    const notification = markRead(store, session.campusId, session.userId, id);
    return ok({ notification, unread: unreadCount(store, session.campusId, session.userId) });
  });
}

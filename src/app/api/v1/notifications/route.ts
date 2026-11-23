import { ok, withApi } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { listNotifications, unreadCount } from "@/lib/repo/notifications";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    const store = getStore();
    return ok({
      notifications: listNotifications(store, session.campusId, session.userId),
      unread: unreadCount(store, session.campusId, session.userId),
    });
  });
}

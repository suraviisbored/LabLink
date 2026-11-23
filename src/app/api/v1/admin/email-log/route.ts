import { ok, withApi } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { emailLog } from "@/lib/repo/notifications";
import { flushEmails } from "@/lib/email";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireRole("campus_admin");
    const store = getStore();
    // Drain anything pending so the log reflects reality when an admin opens it.
    await flushEmails(store);
    return ok({ entries: emailLog(store, session.campusId!) });
  });
}

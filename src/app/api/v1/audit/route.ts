import { ok, withApi } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { listAudit } from "@/lib/repo/admin";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireRole("campus_admin");
    return ok({ entries: listAudit(getStore(), session.campusId!) });
  });
}

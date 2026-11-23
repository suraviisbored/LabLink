import { ok, withApi } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { utilisation } from "@/lib/repo/admin";
import { addDays, nowIso } from "@/lib/time";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const session = await requireRole("campus_admin");
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? nowIso();
    const to = url.searchParams.get("to") ?? addDays(from, 7);
    return ok(utilisation(getStore(), session.campusId!, from, to));
  });
}

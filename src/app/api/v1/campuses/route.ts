import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { audit, createCampus, listCampuses } from "@/lib/repo/admin";
import { campusCreateSchema } from "@/lib/validation/schemas";

/** Platform-level: a super admin sees campuses and domains, never campus content. */
export async function GET(): Promise<Response> {
  return withApi(async () => {
    await requireRole("super_admin");
    return ok({ campuses: listCampuses(getStore()) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("super_admin");
    const input = await readJson(request, campusCreateSchema);
    const store = getStore();
    const campus = createCampus(store, input);
    audit(store, {
      campusId: null,
      actorId: session.userId,
      action: "campus.created",
      entity: "campuses",
      entityId: campus.id,
      metadata: { domains: campus.allowedEmailDomains },
    });
    return ok({ campus }, 201);
  });
}

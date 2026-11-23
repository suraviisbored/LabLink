import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { audit } from "@/lib/repo/admin";
import { addFacultyRole } from "@/lib/repo/requests";
import { facultyGrantSchema } from "@/lib/validation/schemas";

/** Faculty is granted by a campus admin, never inferred from an email (PRD 1.2). */
export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("campus_admin");
    const { userId } = await readJson(request, facultyGrantSchema);
    const store = getStore();
    addFacultyRole(store, session.campusId!, userId);
    audit(store, {
      campusId: session.campusId!,
      actorId: session.userId,
      action: "role.granted.faculty",
      entity: "profiles",
      entityId: userId,
      metadata: {},
    });
    return ok({ granted: true });
  });
}

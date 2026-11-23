import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { decide } from "@/lib/services/requests";
import { decisionSchema } from "@/lib/validation/schemas";

/** FR-4 approvals. The version check makes a racing reviewer fail with 409. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("faculty", "campus_admin");
    const { id } = await params;
    const input = await readJson(request, decisionSchema);
    const result = await decide(session, {
      requestId: id,
      decision: input.decision,
      note: input.note,
      priority: input.priority,
      hoursNeeded: input.hoursNeeded,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      version: input.version,
    });
    return ok({ request: result.request, project: result.project });
  });
}

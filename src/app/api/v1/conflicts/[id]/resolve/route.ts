import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { resolve } from "@/lib/services/conflicts";
import { resolveSchema } from "@/lib/validation/schemas";

/** FR-5 step 5: apply the chosen allocation atomically. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("faculty", "campus_admin");
    const { id } = await params;
    const body = await readJson(request, resolveSchema);
    const result = await resolve(session, {
      conflictId: id,
      optionId: body.optionId,
      overrideNote: body.overrideNote,
    });
    return ok(result);
  });
}

import { ok, withApi } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/server";
import { ApiError } from "@/lib/errors";
import { substitutesFor } from "@/lib/services/substitutes";
import { addDays, nowIso } from "@/lib/time";

/**
 * N2 Smart substitution (Stretch 2). Matching and availability are computed;
 * the AI only writes the capability-difference summary.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    const session = await requireSession();
    if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
    const { id } = await params;
    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? nowIso();
    const to = url.searchParams.get("to") ?? addDays(from, 2);

    return ok(await substitutesFor(session, id, { from, to }));
  });
}

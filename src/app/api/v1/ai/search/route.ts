import { ok, readJson, withApi } from "@/lib/api/handler";
import { requireSession } from "@/lib/auth/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { searchEquipment } from "@/lib/services/search";
import { nlSearchSchema } from "@/lib/validation/schemas";

/** FR-1 natural-language search: query → filter → database results. */
export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    const session = await requireSession();
    checkRateLimit(`ai:search:${session.userId}`, RATE_LIMITS.ai);
    const { query } = await readJson(request, nlSearchSchema);
    const { result, parsed } = await searchEquipment(session, {
      q: query,
      limit: 24,
    });
    return ok({ items: result.items, total: result.total, parsed });
  });
}

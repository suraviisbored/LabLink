import { ok, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { recommend } from "@/lib/services/conflicts";

/**
 * FR-5 steps 2-4: solver candidates → AI ranking and explanation → schema and
 * feasibility validation → a human decides. Never applies anything.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("faculty", "campus_admin");
    checkRateLimit(`ai:conflict:${session.userId}`, RATE_LIMITS.ai);
    const { id } = await params;
    const recommendation = await recommend(session, id);
    return ok({
      options: recommendation.options,
      fallback: recommendation.fallback,
      fallbackReason: recommendation.fallbackReason,
      demandHours: recommendation.demandHours,
      capacityHours: recommendation.capacityHours,
    });
  });
}

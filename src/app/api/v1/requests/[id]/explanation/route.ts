import { ok, withApi } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { explanation } from "@/lib/services/conflicts";

/** N4: top factors + the computed smallest flipping change, phrased by the AI. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    const { id } = await params;
    const result = await explanation(session, id);
    return ok(result);
  });
}

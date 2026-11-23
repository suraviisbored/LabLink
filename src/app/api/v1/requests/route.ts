import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { listRequests } from "@/lib/repo/requests";
import { getStore } from "@/lib/db/store";
import { submitRequest } from "@/lib/services/requests";
import { requestCreateSchema } from "@/lib/validation/schemas";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const isStaff = session.role === "faculty" || session.role === "campus_admin";

    const requests = listRequests(getStore(), session.campusId, {
      status:
        status === "pending" || status === "submitted" || status === "under_review" ||
        status === "approved" || status === "rejected" || status === "modified" || status === "all"
          ? status
          : undefined,
      facultyId: session.role === "faculty" ? session.userId : undefined,
      studentId: isStaff ? undefined : session.userId,
    });

    return ok({ requests });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    if (session.role === "student") {
      checkRateLimit(`mut:request:${session.userId}`, RATE_LIMITS.mutation);
    }
    const input = await readJson(request, requestCreateSchema);
    const result = await submitRequest(session, {
      ...input,
      newProject: input.newProject
        ? {
            ...input.newProject,
            description: input.newProject.description ?? "",
            facultyId: input.newProject.facultyId ?? null,
          }
        : undefined,
    });
    return ok(result, 201);
  });
}

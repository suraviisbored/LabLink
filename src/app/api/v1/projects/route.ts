import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { createProject, projectForStudent } from "@/lib/repo/requests";
import { audit } from "@/lib/repo/admin";
import { projectCreateSchema } from "@/lib/validation/schemas";

export async function GET(): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    return ok({ projects: projectForStudent(getStore(), session.campusId, session.userId) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireCampus();
    const input = await readJson(request, projectCreateSchema);
    const store = getStore();
    const project = createProject(store, session.campusId, session.userId, {
      title: input.title,
      description: input.description ?? "",
      deadline: input.deadline,
      facultyId: input.facultyId ?? null,
    });
    audit(store, {
      campusId: session.campusId,
      actorId: session.userId,
      action: "project.created",
      entity: "projects",
      entityId: project.id,
      metadata: { title: project.title },
    });
    return ok({ project }, 201);
  });
}

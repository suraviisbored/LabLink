import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireCampus, requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { audit } from "@/lib/repo/admin";
import { createEquipment, listEquipment } from "@/lib/repo/catalogue";
import { searchSchema, equipmentCreateSchema } from "@/lib/validation/schemas";

export async function GET(request: Request): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    const url = new URL(request.url);
    const params = searchSchema.parse(Object.fromEntries(url.searchParams.entries()));
    const result = listEquipment(getStore(), session.campusId, {
      q: params.q,
      departmentId: params.departmentId,
      category: params.category,
      status: params.status,
      labId: params.labId,
      availableFrom: params.availableFrom,
      availableTo: params.availableTo,
      offset: params.offset,
      limit: params.limit,
    });
    return ok(result);
  });
}

export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("campus_admin");
    if (!session.campusId) throw new Error("campus required");
    const input = await readJson(request, equipmentCreateSchema);

    const store = getStore();
    const equipment = createEquipment(store, session.campusId, {
      ...input,
      description: input.description ?? "",
      specs: input.specs ?? {},
      tags: input.tags ?? [],
      requiresCertification: input.requiresCertification ?? false,
      units: input.units ?? 1,
    });
    audit(store, {
      campusId: session.campusId,
      actorId: session.userId,
      action: "equipment.created",
      entity: "equipment",
      entityId: equipment.id,
      metadata: { name: input.name, units: input.units },
    });
    return ok({ equipment }, 201);
  });
}

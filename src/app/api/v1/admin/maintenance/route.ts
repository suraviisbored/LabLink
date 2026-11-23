import { ok, readJson, withApi, assertSameOrigin } from "@/lib/api/handler";
import { requireRole } from "@/lib/auth/server";
import { getStore } from "@/lib/db/store";
import { audit } from "@/lib/repo/admin";
import { addBlackout, addMaintenance, setUnitStatus } from "@/lib/repo/catalogue";
import { blackoutSchema, maintenanceSchema, unitStatusSchema } from "@/lib/validation/schemas";

/** Equipment units, maintenance blocks and lab blackouts (FR-7). */
export async function POST(request: Request): Promise<Response> {
  return withApi(async () => {
    assertSameOrigin(request);
    const session = await requireRole("campus_admin");
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "maintenance";
    const store = getStore();

    if (kind === "unit") {
      const input = await readJson(request, unitStatusSchema);
      const unit = setUnitStatus(store, session.campusId!, input.unitId, input.status);
      audit(store, {
        campusId: session.campusId!,
        actorId: session.userId,
        action: "unit.status",
        entity: "equipment_units",
        entityId: unit.id,
        metadata: { status: input.status },
      });
      return ok({ unit });
    }

    if (kind === "blackout") {
      const input = await readJson(request, blackoutSchema);
      const block = addBlackout(store, session.campusId!, { ...input, reason: input.reason ?? "" });
      audit(store, {
        campusId: session.campusId!,
        actorId: session.userId,
        action: "blackout.created",
        entity: "blackouts",
        entityId: block.id,
        metadata: { reason: block.reason },
      });
      return ok({ block }, 201);
    }

    const input = await readJson(request, maintenanceSchema);
    const block = addMaintenance(store, session.campusId!, { ...input, reason: input.reason ?? "" });
    audit(store, {
      campusId: session.campusId!,
      actorId: session.userId,
      action: "maintenance.created",
      entity: "maintenance_blocks",
      entityId: block.id,
      metadata: { reason: block.reason },
    });
    return ok({ block }, 201);
  });
}

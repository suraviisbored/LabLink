import { ok, withApi } from "@/lib/api/handler";
import { requireCampus } from "@/lib/auth/server";
import { ApiError } from "@/lib/errors";
import { getStore } from "@/lib/db/store";
import { availabilityFor, equipmentUnits, getEquipment, toEquipmentListItem } from "@/lib/repo/catalogue";
import { addDays, nowIso } from "@/lib/time";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  return withApi(async () => {
    const session = await requireCampus();
    const { id } = await params;
    const store = getStore();
    const equipment = getEquipment(store, session.campusId, id);
    if (!equipment) throw new ApiError("NOT_FOUND", "That equipment is not in your campus.");

    const availability = availabilityFor(store, equipment, nowIso(), addDays(nowIso(), 14));
    return ok({
      item: toEquipmentListItem(store, equipment),
      units: equipmentUnits(store, session.campusId, equipment.id).map((unit) => ({
        id: unit.id,
        assetTag: unit.assetTag,
        status: unit.status,
      })),
      availability,
    });
  });
}

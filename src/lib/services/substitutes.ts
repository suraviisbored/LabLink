import { summariseSubstitution } from "@/lib/ai";
import { getStore } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { availabilityFor, equipmentUnits, getEquipment, listEquipment } from "@/lib/repo/catalogue";
import { rankSubstitutes } from "@/lib/solver/substitutes";
import type { Session } from "@/lib/auth/session";
import { addDays, nowIso } from "@/lib/time";

/**
 * N2 (Stretch 2): deterministically matched substitutes, with an AI-written
 * capability summary. Availability is verified before a substitute is offered.
 */
export async function substitutesFor(
  session: Session,
  equipmentId: string,
  input: { from?: string; to?: string } = {},
) {
  if (!session.campusId) throw new ApiError("FORBIDDEN", "A campus account is required.");
  const store = getStore();
  const original = getEquipment(store, session.campusId, equipmentId);
  if (!original) throw new ApiError("NOT_FOUND", "That equipment is not in your campus.");

  const from = input.from ?? nowIso();
  const to = input.to ?? addDays(from, 2);
  const catalogue = listEquipment(store, session.campusId, { limit: 60 }).items;

  const candidates = catalogue.map((item) => {
    const grid = availabilityFor(store, item.equipment, from, to, 60);
    const freeSlot = grid.flatMap((day) => day.slots).find((slot) => slot.freeUnits > 0);
    return {
      equipment: item.equipment,
      labName: item.labName,
      available: Boolean(freeSlot),
      windowStart: freeSlot?.start ?? null,
      windowEnd: freeSlot?.end ?? null,
    };
  });

  const matches = rankSubstitutes(original, candidates);
  const enriched = await Promise.all(
    matches.map(async (match) => ({
      equipmentId: match.candidate.equipment.id,
      name: match.candidate.equipment.name,
      category: match.candidate.equipment.category,
      labName: match.candidate.labName,
      score: match.score,
      available: match.available,
      windowStart: match.candidate.windowStart,
      windowEnd: match.candidate.windowEnd,
      specDiff: match.specDiff,
      summary: await summariseSubstitution(
        original.name,
        match.candidate.equipment.name,
        match.specDiff,
      ),
    })),
  );

  const nextFree = availabilityFor(store, original, to, addDays(to, 14), 60)
    .flatMap((day) => day.slots)
    .find((slot) => slot.freeUnits > 0);

  return {
    substitutes: enriched.filter((match) => match.available),
    unavailable: enriched.filter((match) => !match.available).map((match) => match.name),
    nextFreeWindow: nextFree?.start ?? null,
    units: equipmentUnits(store, session.campusId, original.id).length,
  };
}

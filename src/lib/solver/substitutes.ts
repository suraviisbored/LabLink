import type { Equipment, EquipmentListItem } from "@/lib/types";

/**
 * N2 Smart substitution (Stretch 2). Matching is deterministic: same campus,
 * same category (or strong tag overlap), and available in the requested window.
 * The AI layer may only describe the computed capability difference; it never
 * chooses the substitute.
 */

export interface SpecDiff {
  key: string;
  original: string | null;
  substitute: string | null;
  direction: "better" | "worse" | "different" | "missing";
}

export interface SubstituteMatch {
  equipmentId: string;
  name: string;
  score: number;
  specDiff: SpecDiff[];
  availableFrom: string;
  availableUntil: string;
}

export interface SubstitutionCandidate {
  equipment: Equipment;
  labName: string;
  available: boolean;
  windowStart: string | null;
  windowEnd: string | null;
}

function compareSpecs(
  original: Record<string, string>,
  candidate: Record<string, string>,
): SpecDiff[] {
  const keys = [...new Set([...Object.keys(original), ...Object.keys(candidate)])];
  return keys.map((key) => {
    const a = original[key] ?? null;
    const b = candidate[key] ?? null;
    if (a === b) return { key, original: a, substitute: b, direction: "different" };
    if (a && !b) return { key, original: a, substitute: null, direction: "missing" };
    if (!a && b) return { key, original: null, substitute: b, direction: "better" };
    return { key, original: a, substitute: b, direction: "different" };
  });
}

export function scoreSubstitute(original: Equipment, candidate: Equipment): number {
  let score = 0;
  if (candidate.category === original.category) score += 4;
  const sharedTags = candidate.tags.filter((tag) => original.tags.includes(tag)).length;
  score += sharedTags * 1.5;
  const sharedSpecKeys = Object.keys(candidate.specs).filter((key) => key in original.specs).length;
  score += sharedSpecKeys * 0.5;
  if (candidate.requiresCertification === original.requiresCertification) score += 0.25;
  return Math.round(score * 100) / 100;
}

/**
 * Rank candidates by deterministic similarity. Availability and certification
 * eligibility are applied by the caller, which owns live booking data.
 */
export function rankSubstitutes(
  original: Equipment,
  candidates: SubstitutionCandidate[],
  limit = 3,
): { candidate: SubstitutionCandidate; score: number; specDiff: SpecDiff[]; available: boolean }[] {
  return candidates
    .filter((candidate) => candidate.equipment.id !== original.id)
    .filter((candidate) => candidate.equipment.campusId === original.campusId)
    .map((candidate) => ({
      candidate,
      score: scoreSubstitute(original, candidate.equipment),
      specDiff: compareSpecs(original.specs, candidate.equipment.specs),
      available: candidate.available,
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        Number(b.available) - Number(a.available) ||
        b.score - a.score ||
        a.candidate.equipment.name.localeCompare(b.candidate.equipment.name),
    )
    .slice(0, limit);
}

export function catalogueToSubstitutionCandidate(
  item: EquipmentListItem,
  available: boolean,
  windowStart: string | null,
  windowEnd: string | null,
): SubstitutionCandidate {
  return {
    equipment: item.equipment,
    labName: item.labName,
    available,
    windowStart,
    windowEnd,
  };
}

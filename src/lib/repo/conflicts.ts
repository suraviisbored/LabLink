import type { Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { recommendConflict, type RecommendationResult } from "@/lib/ai";
import {
  availabilityFor,
  busyIntervals,
  equipmentUnits,
  maintenanceIntervals,
  requireEquipment,
} from "@/lib/repo/catalogue";
import { getSettings, usageStats } from "@/lib/repo/bookings";
import { getRequest } from "@/lib/repo/requests";
import { generateCandidates, detectConflict } from "@/lib/solver/conflict";
import { findCounterfactual } from "@/lib/solver/counterfactual";
import type { Candidate, SolverInput } from "@/lib/solver/types";
import type { Allocation, Conflict, ConflictOption, Resolution } from "@/lib/types";
import { nowIso } from "@/lib/time";

/** Conflict detection, recommendation and atomic application (PRD FR-5 / FR-10). */

export function getConflict(store: Store, campusId: string, conflictId: string): Conflict {
  const conflict = store.data.conflicts.find(
    (entry) => entry.id === conflictId && entry.campusId === campusId,
  );
  if (!conflict) throw new ApiError("NOT_FOUND", "That conflict does not exist in your campus.");
  return conflict;
}

export function listConflicts(store: Store, campusId: string): Conflict[] {
  return store.data.conflicts
    .filter((conflict) => conflict.campusId === campusId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function storedOptions(store: Store, conflictId: string): ConflictOption[] {
  return store.data.conflictOptions
    .filter((option) => option.conflictId === conflictId)
    .sort((a, b) => a.rank - b.rank);
}

/** Rebuilds the solver input from live data. Nothing is cached across requests. */
export function buildSolverInput(
  store: Store,
  conflict: Conflict,
  now: string = nowIso(),
): SolverInput {
  const equipment = requireEquipment(store, conflict.campusId, conflict.equipmentId);
  const lab = store.data.labs.find((entry) => entry.id === equipment.labId);
  if (!lab) throw new ApiError("NOT_FOUND", "That equipment's lab is missing.");

  const units = equipmentUnits(store, conflict.campusId, equipment.id)
    .filter((unit) => unit.status === "available")
    .map((unit) => ({ id: unit.id, assetTag: unit.assetTag }));

  const requests = conflict.requestIds
    .map((requestId) => getRequest(store, conflict.campusId, requestId))
    .filter((context): context is NonNullable<typeof context> => Boolean(context))
    .map((context) => {
      const stats = usageStats(store, context.studentId, now);
      return {
        requestId: context.request.id,
        userId: context.studentId,
        deadline: context.project.deadline,
        priority: context.request.priority,
        hoursNeeded: context.request.hoursNeeded,
        windowStart: context.request.windowStart,
        windowEnd: context.request.windowEnd,
        recentHours: stats.recentHours,
        noShows: stats.noShows,
        completions: stats.completions,
        createdAt: context.request.createdAt,
      };
    });

  return {
    windowStart: conflict.windowStart,
    windowEnd: conflict.windowEnd,
    units,
    requests,
    busy: busyIntervals(store, equipment.id),
    maintenance: maintenanceIntervals(store, equipment.id),
    blackouts: store.data.blackouts
      .filter((block) => block.labId === lab.id)
      .map((block) => ({ start: block.startTime, end: block.endTime })),
    lab: {
      availableFrom: lab.availableFrom,
      availableTo: lab.availableTo,
      availableDays: lab.availableDays,
    },
    weights: getSettings(store, conflict.campusId).fairnessWeights,
    now,
  };
}

export function conflictSummary(store: Store, conflict: Conflict) {
  const input = buildSolverInput(store, conflict);
  const detection = detectConflict(input);
  const equipment = store.data.equipment.find((entry) => entry.id === conflict.equipmentId);
  const requests = conflict.requestIds
    .map((requestId) => getRequest(store, conflict.campusId, requestId))
    .filter((context): context is NonNullable<typeof context> => Boolean(context));

  return {
    conflict,
    equipmentName: equipment?.name ?? "Unknown equipment",
    demandHours: detection.demand,
    capacityHours: detection.capacity,
    requests,
    unitCount: input.units.length,
  };
}

function unitIsFree(store: Store, allocation: Allocation): boolean {
  const unit = store.data.units.find((entry) => entry.id === allocation.unitId);
  if (!unit || unit.status !== "available") return false;
  const booked = store.data.bookings.some(
    (booking) =>
      booking.unitId === unit.id &&
      (booking.status === "confirmed" || booking.status === "checked_in") &&
      new Date(booking.startTime) < new Date(allocation.endTime) &&
      new Date(allocation.startTime) < new Date(booking.endTime),
  );
  if (booked) return false;
  const blocked = store.data.maintenance.some(
    (block) =>
      block.unitId === unit.id &&
      new Date(block.startTime) < new Date(allocation.endTime) &&
      new Date(allocation.startTime) < new Date(block.endTime),
  );
  return !blocked;
}

export interface Recommendation {
  conflict: Conflict;
  options: ConflictOption[];
  fallback: boolean;
  fallbackReason: string | null;
  demandHours: number;
  capacityHours: number;
}

export async function recommendForConflict(
  store: Store,
  campusId: string,
  conflictId: string,
  actorId: string,
): Promise<Recommendation> {
  const conflict = getConflict(store, campusId, conflictId);
  if (conflict.status === "resolved") {
    throw new ApiError("STALE_STATE", "This conflict is already resolved.");
  }

  const input = buildSolverInput(store, conflict);
  const candidates = generateCandidates(input);
  const detection = detectConflict(input);
  const equipment = requireEquipment(store, campusId, conflict.equipmentId);

  const recommendation: RecommendationResult = await recommendConflict({
    input,
    candidates,
    equipmentName: equipment.name,
    userId: actorId,
    revalidate: (candidate: Candidate) =>
      candidate.allocation.every((allocation) => unitIsFree(store, allocation)),
  });

  // Replace any previous recommendation for this conflict.
  store.data.conflictOptions = store.data.conflictOptions.filter(
    (option) => option.conflictId !== conflict.id,
  );

  const options: ConflictOption[] = recommendation.options.map((option) => ({
    id: store.formatId("option", `opt-${conflict.id}-${option.candidateId}`),
    conflictId: conflict.id,
    strategy: option.candidateId,
    campusId: conflict.campusId,
    allocation: option.candidate.allocation,
    unallocated: option.candidate.unallocated,
    fairnessScore: option.candidate.score,
    explanation: option.explanation,
    tradeoffs: option.tradeoffs,
    rank: option.rank,
    source: option.source,
    counterfactual: null,
    factors: option.candidate.factors,
  }));

  store.data.conflictOptions.push(...options);
  conflict.status = "recommended";
  conflict.version += 1;

  store.data.audit.push({
    id: store.nextId("audit"),
    campusId,
    actorId,
    action: recommendation.fallback ? "conflict.recommended.solver" : "conflict.recommended.ai",
    entity: "conflicts",
    entityId: conflict.id,
    metadata: {
      options: options.length,
      fallbackReason: recommendation.fallbackReason,
      candidateIds: options.map((option) => option.strategy),
    },
    createdAt: nowIso(),
  });

  return {
    conflict,
    options,
    fallback: recommendation.fallback,
    fallbackReason: recommendation.fallbackReason,
    demandHours: detection.demand,
    capacityHours: detection.capacity,
  };
}

export interface ResolveInput {
  campusId: string;
  conflictId: string;
  optionId: string;
  actorId: string;
  overrideNote?: string;
}

/** Applies every allocation or none. Re-validates against live data first. */
export function applyOption(store: Store, input: ResolveInput): {
  resolution: Resolution;
  bookings: number;
  affectedUserIds: string[];
} {
  const conflict = getConflict(store, input.campusId, input.conflictId);
  if (conflict.status === "resolved") {
    throw new ApiError("STALE_STATE", "This conflict was already resolved.");
  }

  const option = store.data.conflictOptions.find(
    (entry) => entry.id === input.optionId && entry.conflictId === conflict.id,
  );
  if (!option) throw new ApiError("VALIDATION_ERROR", "That option is not part of this conflict.");

  for (const allocation of option.allocation) {
    if (!unitIsFree(store, allocation)) {
      throw new ApiError(
        "STALE_STATE",
        "The recommendation is out of date. Regenerate it before applying.",
      );
    }
    const request = getRequest(store, input.campusId, allocation.requestId);
    if (!request) {
      throw new ApiError("VALIDATION_ERROR", "An allocation references a missing request.");
    }
  }

  const affectedUserIds: string[] = [];
  let created = 0;

  for (const allocation of option.allocation) {
    const request = getRequest(store, input.campusId, allocation.requestId);
    if (!request) continue;

    const idempotencyKey = `conflict-${option.id}-${allocation.requestId}`;
    if (store.data.bookings.some((booking) => booking.idempotencyKey === idempotencyKey)) {
      continue;
    }

    store.data.bookings.push({
      id: store.nextId("book"),
      campusId: conflict.campusId,
      unitId: allocation.unitId,
      equipmentId: conflict.equipmentId,
      userId: request.studentId,
      requestId: allocation.requestId,
      seriesId: null,
      startTime: allocation.startTime,
      endTime: allocation.endTime,
      status: "confirmed",
      checkedInAt: null,
      idempotencyKey,
      version: 1,
      createdAt: store.now(),
    });
    created += 1;
    affectedUserIds.push(request.studentId);
  }

  const resolution: Resolution = {
    id: store.nextId("res"),
    conflictId: conflict.id,
    optionId: option.id,
    decidedBy: input.actorId,
    overrideNote: input.overrideNote ?? null,
    decidedAt: nowIso(),
  };
  store.data.resolutions.push(resolution);
  conflict.status = "resolved";
  conflict.version += 1;

  for (const allocation of option.allocation) {
    store.data.fairnessLedger.push({
      id: store.nextId("ledger"),
      campusId: conflict.campusId,
      userId:
        getRequest(store, input.campusId, allocation.requestId)?.studentId ?? "unknown",
      event: option.source === "ai" ? "allocation.ai" : "allocation.solver",
      delta: 0,
      createdAt: nowIso(),
    });
  }

  store.data.audit.push({
    id: store.nextId("audit"),
    campusId: input.campusId,
    actorId: input.actorId,
    action: "conflict.resolved",
    entity: "conflicts",
    entityId: conflict.id,
    metadata: {
      optionId: option.id,
      strategy: option.strategy,
      source: option.source,
      fairnessScore: option.fairnessScore,
      bookings: created,
      overrideNote: input.overrideNote ?? null,
    },
    createdAt: nowIso(),
  });

  return { resolution, bookings: created, affectedUserIds: [...new Set(affectedUserIds)] };
}

export interface RequestExplanation {
  request: ReturnType<typeof getRequest>;
  inConflict: boolean;
  allocated: boolean;
  factors: { label: string; weight: number; score: number }[];
  counterfactual: ReturnType<typeof findCounterfactual>;
  narrative: string;
}

export async function explainRequest(
  store: Store,
  campusId: string,
  requestId: string,
  actorId: string,
): Promise<RequestExplanation | null> {
  const context = getRequest(store, campusId, requestId);
  if (!context) return null;

  const conflict = store.data.conflicts.find(
    (entry) => entry.campusId === campusId && entry.requestIds.includes(requestId),
  );

  if (!conflict) {
    const allocated = store.data.bookings.some(
      (booking) => booking.requestId === requestId && booking.status !== "cancelled",
    );
    return {
      request: context,
      inConflict: false,
      allocated,
      factors: [],
      counterfactual: null,
      narrative:
        context.request.status === "approved"
          ? "This request is approved and no competing demand was detected, so no fairness decision was needed."
          : "This request has not entered a fairness decision yet.",
    };
  }

  const input = buildSolverInput(store, conflict);
  const candidates = generateCandidates(input);
  const best = candidates[0];
  const counterfactual = findCounterfactual(input, requestId);
  const allocated = Boolean(
    best?.allocation.some((allocation) => allocation.requestId === requestId),
  );

  const { phraseCounterfactual } = await import("@/lib/ai");
  const narrative = counterfactual
    ? await phraseCounterfactual(
        counterfactual,
        {
          equipmentName: context.equipment.name,
          outcome: allocated ? "allocated" : "moved or deferred",
        },
        actorId,
      )
    : allocated
      ? "You received an allocation in the recommended plan. No counterfactual is needed."
      : "No single small change flips this outcome.";

  return {
    request: context,
    inConflict: true,
    allocated,
    factors: counterfactual?.factors ?? [],
    counterfactual,
    narrative,
  };
}

/** Detects demand above capacity for any approved request group (admin view). */
export function detectOpenConflicts(store: Store, campusId: string) {
  const conflicts = listConflicts(store, campusId).filter(
    (conflict) => conflict.status !== "resolved",
  );
  return conflicts.map((conflict) => {
    const input = buildSolverInput(store, conflict);
    const detection = detectConflict(input);
    const equipment = store.data.equipment.find((entry) => entry.id === conflict.equipmentId);
    return {
      conflict,
      equipmentName: equipment?.name ?? "Unknown",
      demandHours: detection.demand,
      capacityHours: detection.capacity,
      oversubscribed: detection.conflict,
      options: storedOptions(store, conflict.id).length,
    };
  });
}

export function availabilityPreview(store: Store, campusId: string, conflict: Conflict) {
  const equipment = requireEquipment(store, campusId, conflict.equipmentId);
  return availabilityFor(store, equipment, conflict.windowStart, conflict.windowEnd, 60);
}

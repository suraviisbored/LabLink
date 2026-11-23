import type { FairnessFactor, FairnessWeights, Priority } from "@/lib/types";
import { diffHours } from "@/lib/time";

/**
 * Fairness scoring (PRD FR-5). Pure functions with no I/O so the solver can be
 * unit tested exhaustively. Every factor returns 0..1 and the weighted score is
 * a convex combination, so the weights are directly interpretable in the UI.
 */

export const DEFAULT_WEIGHTS: FairnessWeights = {
  deadline: 0.35,
  priority: 0.25,
  recentUsage: 0.2,
  hoursEfficiency: 0.1,
  reliability: 0.1,
};

export const FACTOR_LABELS: Record<keyof FairnessWeights, string> = {
  deadline: "Deadline proximity",
  priority: "Faculty priority",
  recentUsage: "Recent usage",
  hoursEfficiency: "Hours efficiency",
  reliability: "Reliability",
};

const PRIORITY_SCORE: Record<Priority, number> = {
  high: 1,
  normal: 0.6,
  low: 0.3,
};

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Normalises configured weights so they always sum to 1. */
export function normalizeWeights(weights: FairnessWeights): FairnessWeights {
  const entries = Object.entries(weights) as [keyof FairnessWeights, number][];
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, value), 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return entries.reduce(
    (acc, [key, value]) => ({ ...acc, [key]: Math.max(0, value) / total }),
    {} as FairnessWeights,
  ) as FairnessWeights;
}

export function deadlineScore(deadline: string, now: string, horizonDays = 14): number {
  const daysLeft = Math.max(0, diffHours(now, deadline) / 24);
  return clamp01(1 - daysLeft / horizonDays);
}

export function priorityScore(priority: Priority): number {
  return PRIORITY_SCORE[priority];
}

/** Less recent use scores higher: a 0 h user is at 1.0, a 20 h user at 0. */
export function recentUsageScore(recentHours: number, ceiling = 20): number {
  return clamp01(1 - Math.max(0, recentHours) / ceiling);
}

/** Smaller requests keep more of the window available, so they score higher. */
export function hoursEfficiencyScore(hoursNeeded: number, reference = 40): number {
  return clamp01(1 - Math.max(0, hoursNeeded) / reference);
}

/**
 * Neutral (1.0) until there is a track record, then penalised by the no-show
 * rate. With fewer than two completed bookings we deliberately stay neutral so
 * a single missed session does not brand a student.
 */
export function reliabilityScore(noShows: number, completions: number): number {
  const total = noShows + completions;
  if (total < 2) return 1;
  return clamp01(1 - noShows / total);
}

export interface ScoringRequest {
  deadline: string;
  priority: Priority;
  recentHours: number;
  hoursNeeded: number;
  noShows: number;
  completions: number;
}

export interface ScoringResult {
  score: number;
  factors: FairnessFactor[];
  /** Factors that held the request back most, biggest first. */
  blockers: FairnessFactor[];
}

export function scoreRequest(
  request: ScoringRequest,
  weightsInput: FairnessWeights,
  now: string,
): ScoringResult {
  const weights = normalizeWeights(weightsInput);

  const raw: Record<keyof FairnessWeights, number> = {
    deadline: deadlineScore(request.deadline, now),
    priority: priorityScore(request.priority),
    recentUsage: recentUsageScore(request.recentHours),
    hoursEfficiency: hoursEfficiencyScore(request.hoursNeeded),
    reliability: reliabilityScore(request.noShows, request.completions),
  };

  const factors: FairnessFactor[] = (
    Object.keys(raw) as (keyof FairnessWeights)[]
  ).map((key) => ({
    key,
    label: FACTOR_LABELS[key],
    weight: weights[key],
    score: raw[key],
  }));

  const score = factors.reduce((sum, factor) => sum + factor.weight * factor.score, 0);
  const blockers = [...factors].sort(
    (a, b) => b.weight * (1 - b.score) - a.weight * (1 - a.score),
  );

  return { score: Math.round(score * 10_000) / 10_000, factors, blockers: blockers.slice(0, 3) };
}

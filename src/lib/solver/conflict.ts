import type { Allocation, FairnessFactor } from "@/lib/types";
import { scoreRequest } from "@/lib/solver/fairness";
import { freeIntervals, type FreeInterval } from "@/lib/solver/slots";
import type {
  Candidate,
  CandidateStrategy,
  SolverInput,
  SolverRequest,
} from "@/lib/solver/types";

/**
 * Deterministic conflict solver (PRD FR-5, step 2).
 *
 * The solver owns every hard rule: capacity, per-unit overlap, lab hours,
 * maintenance, blackouts. It produces up to five feasible candidates and a
 * fairness score for each. It performs no I/O, so the same inputs always
 * produce the same candidates and a candidate can be re-verified later.
 */

const EPSILON = 1e-6;
const MINUTES = (hours: number) => Math.round(hours * 60);

export function totalRequestedHours(input: SolverInput): number {
  return input.requests.reduce((sum, request) => sum + request.hoursNeeded, 0);
}

/** Free per-unit intervals for the contested window. */
export function solverFreeIntervals(input: SolverInput): FreeInterval[] {
  const unitIds = input.units.map((unit) => unit.id);
  const busy = [...input.busy, ...input.maintenance];
  return freeIntervals({
    unitIds,
    from: input.windowStart,
    to: input.windowEnd,
    lab: input.lab,
    busy,
    blackouts: input.blackouts,
    offsetMinutes: input.offsetMinutes ?? 330,
  });
}

export function capacityHours(input: SolverInput): number {
  return (
    solverFreeIntervals(input).reduce(
      (sum, interval) =>
        sum + (new Date(interval.end).getTime() - new Date(interval.start).getTime()) / 3_600_000,
      0,
    )
  );
}

export function detectConflict(input: SolverInput): {
  conflict: boolean;
  demand: number;
  capacity: number;
} {
  const capacity = Math.round(capacityHours(input) * 100) / 100;
  const demand = Math.round(totalRequestedHours(input) * 100) / 100;
  return { conflict: demand > capacity + EPSILON, demand, capacity };
}

function orderRequests(
  input: SolverInput,
  strategy: CandidateStrategy,
): { request: SolverRequest; score: number; factors: FairnessFactor[]; blockers: FairnessFactor[] }[] {
  const scored = input.requests.map((request) => {
    const result = scoreRequest(
      {
        deadline: request.deadline,
        priority: request.priority,
        recentHours: request.recentHours,
        hoursNeeded: request.hoursNeeded,
        noShows: request.noShows,
        completions: request.completions,
      },
      input.weights,
      input.now,
    );
    return {
      request,
      score: result.score,
      factors: result.factors,
      blockers: result.blockers,
    };
  });

  const priorityRank = { high: 0, normal: 1, low: 2 } as const;
  const sorters: Record<CandidateStrategy, (a: typeof scored[number], b: typeof scored[number]) => number> = {
    fairness: (a, b) => b.score - a.score,
    deadline: (a, b) =>
      new Date(a.request.deadline).getTime() - new Date(b.request.deadline).getTime(),
    priority: (a, b) =>
      priorityRank[a.request.priority] - priorityRank[b.request.priority] ||
      new Date(a.request.deadline).getTime() - new Date(b.request.deadline).getTime(),
    fcfs: (a, b) =>
      new Date(a.request.createdAt).getTime() - new Date(b.request.createdAt).getTime(),
    split: (a, b) => b.score - a.score,
  };

  return [...scored].sort(sorters[strategy]);
}

/**
 * Places requests into free intervals, mutating the working copy.
 *
 * Each request may only use time inside its own requested window, so the free
 * intervals are clipped per request. A placement that cannot cover the full
 * ask is discarded rather than left as a partial booking.
 */
function place(
  ordered: ReturnType<typeof orderRequests>,
  intervals: FreeInterval[],
  allowSplit: boolean,
): { allocation: Allocation[]; unallocated: string[] } {
  const working = intervals.map((interval) => ({ ...interval }));
  const allocation: Allocation[] = [];
  const unallocated: string[] = [];

  for (const { request } of ordered) {
    let remaining = MINUTES(request.hoursNeeded);
    const placed: Allocation[] = [];

    // Earliest-first placement keeps the rest of the window usable.
    for (let index = 0; index < working.length && remaining > 0; index += 1) {
      const interval = working[index];
      if (!interval) continue;

      const clippedStart = new Date(
        Math.max(new Date(interval.start).getTime(), new Date(request.windowStart).getTime()),
      );
      const clippedEnd = new Date(
        Math.min(new Date(interval.end).getTime(), new Date(request.windowEnd).getTime()),
      );
      if (clippedEnd <= clippedStart) continue;

      const available = Math.round((clippedEnd.getTime() - clippedStart.getTime()) / 60_000);
      if (available < 30) continue;

      const take = allowSplit ? Math.min(available, remaining) : remaining;
      if (take > available) continue;
      if (!allowSplit && available < remaining) continue;

      const start = clippedStart.toISOString();
      const end = new Date(clippedStart.getTime() + take * 60_000).toISOString();
      placed.push({
        requestId: request.requestId,
        unitId: interval.unitId,
        startTime: start,
        endTime: end,
        hours: take / 60,
      });
      remaining -= take;

      if (end === interval.end) {
        working.splice(index, 1);
        index -= 1;
      } else if (start === interval.start) {
        working[index] = { ...interval, start: end };
      } else {
        // Consumed the middle: keep the part after, and let the earlier part be
        // considered again by a later request.
        working[index] = { ...interval, start: end };
      }
    }

    if (remaining > 0) {
      unallocated.push(request.requestId);
    } else {
      allocation.push(...placed);
    }
  }

  return { allocation, unallocated };
}

function evaluateCandidate(
  input: SolverInput,
  strategy: CandidateStrategy,
): Candidate {
  const ordered = orderRequests(input, strategy);
  const intervals = solverFreeIntervals(input);
  const { allocation, unallocated } = place(ordered, intervals, strategy === "split");

  const factors: Record<string, FairnessFactor[]> = {};
  const blockers: Record<string, FairnessFactor[]> = {};
  let weighted = 0;

  for (const { request, score, factors: requestFactors, blockers: requestBlockers } of ordered) {
    factors[request.requestId] = requestFactors;
    blockers[request.requestId] = requestBlockers;

    const allocatedMinutes = allocation
      .filter((entry) => entry.requestId === request.requestId)
      .reduce((sum, entry) => sum + MINUTES(entry.hours), 0);
    const coverage = Math.min(1, allocatedMinutes / Math.max(1, MINUTES(request.hoursNeeded)));
    weighted += score * coverage;
  }

  const score = input.requests.length === 0 ? 0 : weighted / input.requests.length;
  const hoursAllocated =
    allocation.reduce((sum, entry) => sum + entry.hours, 0);

  return {
    allocation,
    unallocated,
    score: Math.round(score * 10_000) / 10_000,
    strategy,
    factors,
    blockers,
    hoursAllocated: Math.round(hoursAllocated * 100) / 100,
  };
}

export function generateCandidates(input: SolverInput): Candidate[] {
  const strategies: CandidateStrategy[] = ["fairness", "deadline", "priority", "fcfs", "split"];
  const seen = new Set<string>();

  const candidates = strategies
    .map((strategy) => evaluateCandidate(input, strategy))
    .filter((candidate) => {
      const key = JSON.stringify(
        candidate.allocation
          .map((entry) => `${entry.requestId}:${entry.unitId}:${entry.startTime}:${entry.endTime}`)
          .sort(),
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 0.0001) return b.score - a.score;
      if (b.allocation.length !== a.allocation.length) return b.allocation.length - a.allocation.length;
      return b.hoursAllocated - a.hoursAllocated;
    });

  return candidates.slice(0, 5);
}

/** Fallback explanation, used whenever the AI is unavailable or its output fails validation. */
export function explainCandidate(candidate: Candidate): string {
  if (candidate.allocation.length === 0) {
    return "No feasible allocation fits this window. Widen the window or add unit capacity.";
  }

  const byRequest = new Map<string, Allocation[]>();
  for (const entry of candidate.allocation) {
    byRequest.set(entry.requestId, [...(byRequest.get(entry.requestId) ?? []), entry]);
  }

  const parts: string[] = [];
  for (const [requestId, entries] of byRequest) {
    const hours = entries.reduce((sum, entry) => sum + entry.hours, 0);
    const units = [...new Set(entries.map((entry) => entry.unitId))].join(", ");
    parts.push(`${requestId.split("-").slice(-1)[0] ?? requestId} gets ${Number(hours.toFixed(2))} h on ${units}`);
  }

  const deferred = candidate.unallocated.length
    ? ` ${candidate.unallocated.length} request(s) cannot be placed in this window.`
    : "";

  return `Rule-based ranking (${candidate.strategy} order): ${parts.join("; ")}. Fairness ${(
    candidate.score * 100
  ).toFixed(1)}%.${deferred}`;
}

export function explainTradeoff(candidate: Candidate, input: SolverInput): string {
  const requested = totalRequestedHours(input);
  const free = capacityHours(input);
  if (requested > free) {
    return `Demand (${Number(requested.toFixed(1))} h) exceeds capacity (${Number(free.toFixed(1))} h); at least one request must move or shrink.`;
  }
  return "All requests fit, but later requests start later in the window.";
}

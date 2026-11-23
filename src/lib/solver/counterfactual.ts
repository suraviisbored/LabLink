import { generateCandidates } from "@/lib/solver/conflict";
import { scoreRequest } from "@/lib/solver/fairness";
import type {
  Candidate,
  RequestPerturbation,
  SolverInput,
  SolverRequest,
} from "@/lib/solver/types";
import type { Counterfactual, FairnessFactor, Priority } from "@/lib/types";

/**
 * N4 "Why didn't I get this slot?" (PRD FR-10).
 *
 * The minimal flipping change is *computed*, not written by a model: we perturb
 * the request one step at a time, re-run the solver, and keep the smallest
 * perturbation that makes the request allocatable in the best candidate.
 * The AI layer may only rephrase this result.
 */

const PRIORITY_UP: Record<Priority, Priority | null> = {
  low: "normal",
  normal: "high",
  high: null,
};

export function applyPerturbation(
  request: SolverRequest,
  perturbation: RequestPerturbation,
): SolverRequest {
  switch (perturbation.field) {
    case "hoursNeeded":
      return { ...request, hoursNeeded: perturbation.value };
    case "windowStart":
      return { ...request, windowStart: perturbation.value };
    case "priority":
      return { ...request, priority: perturbation.value };
    case "deadline":
      return { ...request, deadline: perturbation.value };
  }
}

export function applyCounterfactual(
  input: SolverInput,
  requestId: string,
  counterfactual: Counterfactual,
): SolverInput {
  const kind = counterfactual.change.kind;
  const value = counterfactual.change.value;
  return {
    ...input,
    requests: input.requests.map((request) => {
      if (request.requestId !== requestId) return request;
      switch (kind) {
        case "hours":
          return { ...request, hoursNeeded: Number(value) };
        case "windowStart":
          return { ...request, windowStart: String(value) };
        case "priority":
          return { ...request, priority: String(value) as Priority };
        case "deadline":
          return { ...request, deadline: String(value) };
      }
    }),
  };
}

function coverageFor(candidate: Candidate, requestId: string, hoursNeeded: number): number {
  const allocated = candidate.allocation
    .filter((entry) => entry.requestId === requestId)
    .reduce((sum, entry) => sum + entry.hours, 0);
  return Math.min(1, allocated / Math.max(0.5, hoursNeeded));
}

interface Perturbation {
  magnitude: number;
  change: Counterfactual["change"];
  perturbation: RequestPerturbation;
}

function candidatePerturbations(request: SolverRequest): Perturbation[] {
  const perturbations: Perturbation[] = [];

  // 1. Shrink the request. One hour is a meaningful, student-controlled change.
  for (let drop = 0.5; drop <= request.hoursNeeded - 0.5 + 1e-9; drop += 0.5) {
    const value = Math.round((request.hoursNeeded - drop) * 100) / 100;
    perturbations.push({
      magnitude: drop,
      change: {
        kind: "hours",
        label: "Reduce the hours you need",
        from: `${request.hoursNeeded} h`,
        to: `${value} h`,
        value,
      },
      perturbation: { field: "hoursNeeded", value },
    });
  }

  // 2. Move the requested window earlier (it extends the contested range).
  for (let days = 1; days <= 3; days += 1) {
    const value = new Date(
      new Date(request.windowStart).getTime() - days * 24 * 60 * 60_000,
    ).toISOString();
    perturbations.push({
      magnitude: days * 1.5,
      change: {
        kind: "windowStart",
        label: "Start the requested window earlier",
        from: request.windowStart,
        to: value,
        value,
      },
      perturbation: { field: "windowStart", value },
    });
  }

  // 3. Raise priority (requires the faculty guide).
  const upgraded = PRIORITY_UP[request.priority];
  if (upgraded) {
    perturbations.push({
      magnitude: 2,
      change: {
        kind: "priority",
        label: "Ask your faculty guide for a higher priority tier",
        from: request.priority,
        to: upgraded,
        value: upgraded,
      },
      perturbation: { field: "priority", value: upgraded },
    });
  }

  // 4. An earlier deadline raises urgency, which is the last resort.
  for (let days = 1; days <= 5; days += 1) {
    const value = new Date(new Date(request.deadline).getTime() - days * 24 * 60 * 60_000).toISOString();
    perturbations.push({
      magnitude: 3 * days,
      change: {
        kind: "deadline",
        label: "Bring the project deadline forward",
        from: request.deadline,
        to: value,
        value,
      },
      perturbation: { field: "deadline", value },
    });
  }

  return perturbations.sort((a, b) => a.magnitude - b.magnitude);
}

export function findCounterfactual(
  input: SolverInput,
  requestId: string,
): Counterfactual | null {
  const request = input.requests.find((entry) => entry.requestId === requestId);
  if (!request) return null;

  const baseline = generateCandidates(input)[0];
  if (!baseline) return null;
  if (coverageFor(baseline, requestId, request.hoursNeeded) >= 0.999) {
    // The request already wins: there is no counterfactual to explain.
    return null;
  }

  const scored = scoreRequest(
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

  for (const candidatePerturbation of candidatePerturbations(request)) {
    const modifiedRequest = applyPerturbation(request, candidatePerturbation.perturbation);
    const modifiedInput: SolverInput = {
      ...input,
      requests: input.requests.map((entry) =>
        entry.requestId === requestId ? modifiedRequest : entry,
      ),
    };
    const best = generateCandidates(modifiedInput)[0];
    if (best && coverageFor(best, requestId, modifiedRequest.hoursNeeded) >= 0.999) {
      return {
        requestId,
        change: candidatePerturbation.change,
        factors: scored.blockers,
        wouldWin: true,
      };
    }
  }

  // Nothing in the perturbation grid flips it: report the dominant blockers.
  return {
    requestId,
    change: {
      kind: "hours",
      label: "No single small change flips this outcome",
      from: `${request.hoursNeeded} h`,
      to: "—",
      value: request.hoursNeeded,
    },
    factors: scored.blockers,
    wouldWin: false,
  };
}

/** Top factors that held this request back, for the N4 panel. */
export function counterfactualFactors(
  input: SolverInput,
  requestId: string,
): FairnessFactor[] {
  const request = input.requests.find((entry) => entry.requestId === requestId);
  if (!request) return [];
  return scoreRequest(
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
  ).blockers;
}

import type { Allocation, FairnessFactor, FairnessWeights, Priority } from "@/lib/types";
import type { LabRules } from "@/lib/solver/slots";

/** A half-open [start, end) block on one unit. */
export interface Interval {
  unitId: string;
  start: string;
  end: string;
}

export interface SolverUnit {
  id: string;
  assetTag: string;
}

/**
 * Everything the solver is allowed to see about a competing request. No names,
 * no emails: fairness is computed from facts, and the AI is never given PII.
 */
export interface SolverRequest {
  requestId: string;
  userId: string;
  deadline: string;
  priority: Priority;
  hoursNeeded: number;
  windowStart: string;
  windowEnd: string;
  /** Hours this user has booked in the recent window (fairness: less is better). */
  recentHours: number;
  noShows: number;
  completions: number;
  createdAt: string;
}

export interface SolverInput {
  /** The contested window. */
  windowStart: string;
  windowEnd: string;
  units: SolverUnit[];
  requests: SolverRequest[];
  /** Live bookings across every unit of this equipment. */
  busy: Interval[];
  maintenance: Interval[];
  blackouts: { start: string; end: string }[];
  lab: LabRules;
  weights: FairnessWeights;
  now: string;
  offsetMinutes?: number;
}

export type CandidateStrategy = "fairness" | "deadline" | "priority" | "fcfs" | "split";

export interface Candidate {
  allocation: Allocation[];
  unallocated: string[];
  /** Mean weighted fairness across requests, weighted by hours covered. */
  score: number;
  strategy: CandidateStrategy;
  factors: Record<string, FairnessFactor[]>;
  blockers: Record<string, FairnessFactor[]>;
  hoursAllocated: number;
}

export type RequestPerturbation =
  | { field: "hoursNeeded"; value: number }
  | { field: "windowStart"; value: string }
  | { field: "priority"; value: Priority }
  | { field: "deadline"; value: string };

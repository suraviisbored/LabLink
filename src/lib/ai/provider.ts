import type { Allocation, FairnessFactor, Priority } from "@/lib/types";

/**
 * The AI boundary: rank, parseQuery, phrase, summariseDiff, planFromCatalogue.
 * Everything is advisory. Implementations return `unknown` on purpose so the
 * orchestrator must validate before use, and a provider can be swapped without
 * touching a single caller (PRD GenAI 5.3).
 */

export interface RankCandidatePayload {
  candidateId: string;
  allocation: Allocation[];
  fairnessScore: number;
}

export interface RankRequestPayload {
  requestId: string;
  deadlineDays: number;
  hoursNeeded: number;
  priority: Priority;
  factors: FairnessFactor[];
}

export interface RankPrompt {
  equipmentName: string;
  windowStart: string;
  windowEnd: string;
  candidates: RankCandidatePayload[];
  requests: RankRequestPayload[];
}

export interface ParsePrompt {
  query: string;
  allowedCategories: string[];
  allowedTags: string[];
}

export interface PhrasePrompt {
  kind: "counterfactual" | "explanation";
  /** Deterministic facts the model may restate, never invent around. */
  facts: Record<string, unknown>;
}

export interface DiffPrompt {
  original: string;
  substitute: string;
  specDiff: { key: string; original: string | null; substitute: string | null }[];
}

export interface PlanPrompt {
  description: string;
  deadlineDays: number;
  teamSize: number;
  candidates: { equipmentId: string; name: string; category: string; tags: string[] }[];
}

export interface AIProvider {
  readonly name: string;
  readonly available: boolean;
  rankConflict(prompt: RankPrompt): Promise<unknown>;
  parseQuery(prompt: ParsePrompt): Promise<unknown>;
  phrase(prompt: PhrasePrompt): Promise<unknown>;
  summariseDiff(prompt: DiffPrompt): Promise<unknown>;
  planFromCatalogue(prompt: PlanPrompt): Promise<unknown>;
}

/** Used when no key is configured: every call fails fast into the fallback. */
export class DisabledAIProvider implements AIProvider {
  readonly name = "disabled";
  readonly available = false;
  async rankConflict(): Promise<never> {
    throw new Error("AI provider is not configured");
  }
  async parseQuery(): Promise<never> {
    throw new Error("AI provider is not configured");
  }
  async phrase(): Promise<never> {
    throw new Error("AI provider is not configured");
  }
  async summariseDiff(): Promise<never> {
    throw new Error("AI provider is not configured");
  }
  async planFromCatalogue(): Promise<never> {
    throw new Error("AI provider is not configured");
  }
}

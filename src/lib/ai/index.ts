import { env } from "@/lib/env";
import { GeminiProvider } from "@/lib/ai/gemini";
import { DisabledAIProvider, type AIProvider } from "@/lib/ai/provider";
import {
  diffSummarySchema,
  parsedQuerySchema,
  phraseResponseSchema,
  rankResponseSchema,
} from "@/lib/ai/schemas";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { explainCandidate, explainTradeoff } from "@/lib/solver/conflict";
import type { Candidate, SolverInput } from "@/lib/solver/types";
import type { Counterfactual } from "@/lib/types";
import { diffHours, formatIstRange } from "@/lib/time";

/**
 * The advisory GenAI layer (GenAI doc 5.1): the AI ranks and explains, the
 * solver guarantees feasibility, a human decides. Every function here has a
 * deterministic fallback, so the product works with no key at all.
 */

let provider: AIProvider | null = null;

export function getAIProvider(): AIProvider {
  if (!provider) {
    provider = env.geminiKey
      ? new GeminiProvider(env.geminiKey, env.geminiModel)
      : new DisabledAIProvider();
  }
  return provider;
}

export function setAIProviderForTests(next: AIProvider | null): void {
  provider = next;
}

export interface RecommendedOption {
  candidateId: string;
  rank: number;
  explanation: string;
  tradeoffs: string;
  source: "ai" | "solver";
  candidate: Candidate;
}

export interface RecommendationResult {
  options: RecommendedOption[];
  source: "ai" | "solver";
  fallback: boolean;
  fallbackReason: string | null;
}

export interface RecommendParams {
  input: SolverInput;
  candidates: Candidate[];
  equipmentName: string;
  userId: string;
  /** Re-checks a candidate against live data; returns false to force a fallback. */
  revalidate?: (candidate: Candidate) => boolean;
}

function solverOptions(candidates: Candidate[], input: SolverInput): RecommendedOption[] {
  return candidates.map((candidate, index) => ({
    candidateId: candidate.strategy,
    rank: index + 1,
    explanation: explainCandidate(candidate),
    tradeoffs: explainTradeoff(candidate, input),
    source: "solver" as const,
    candidate,
  }));
}

export async function recommendConflict(params: RecommendParams): Promise<RecommendationResult> {
  const { input, candidates, equipmentName, userId } = params;
  const fallbackOptions = solverOptions(candidates, input);

  if (candidates.length === 0) {
    return {
      options: [],
      source: "solver",
      fallback: true,
      fallbackReason: "No feasible allocation exists for this window.",
    };
  }

  const ai = getAIProvider();
  if (!ai.available) {
    return {
      options: fallbackOptions,
      source: "solver",
      fallback: true,
      fallbackReason: "AI is not configured. Showing the rule-based ranking.",
    };
  }

  try {
    checkRateLimit(`ai:rank:${userId}`, RATE_LIMITS.ai);

    const raw = await ai.rankConflict({
      equipmentName,
      windowStart: input.windowStart,
      windowEnd: input.windowEnd,
      candidates: candidates.map((candidate) => ({
        candidateId: candidate.strategy,
        allocation: candidate.allocation,
        fairnessScore: candidate.score,
      })),
      requests: input.requests.map((request) => ({
        requestId: request.requestId,
        deadlineDays: Math.max(0, Math.round(diffHours(input.now, request.deadline) / 24)),
        hoursNeeded: request.hoursNeeded,
        priority: request.priority,
        factors: candidates[0]?.factors[request.requestId] ?? [],
      })),
    });

    const parsed = rankResponseSchema.parse(raw);
    const byId = new Map<string, Candidate>(
      candidates.map((candidate) => [candidate.strategy as string, candidate]),
    );

    // Hallucination controls: unknown ids, duplicates and non-live feasibility
    // all invalidate the AI response as a whole.
    const seen = new Set<string>();
    for (const option of parsed.options) {
      if (!byId.has(option.candidateId)) {
        throw new Error(`Unknown candidate id: ${option.candidateId}`);
      }
      if (seen.has(option.candidateId)) {
        throw new Error(`Duplicate candidate id: ${option.candidateId}`);
      }
      seen.add(option.candidateId);
    }

    const ranked = [...parsed.options].sort((a, b) => a.rank - b.rank);
    for (const option of ranked) {
      const candidate = byId.get(option.candidateId)!;
      if (params.revalidate && !params.revalidate(candidate)) {
        throw new Error("Candidate no longer feasible on live data");
      }
    }

    const options: RecommendedOption[] = ranked.map((option, index) => ({
      candidateId: option.candidateId,
      rank: index + 1,
      explanation: option.explanation.trim(),
      tradeoffs: option.tradeoffs.trim(),
      source: "ai",
      candidate: byId.get(option.candidateId)!,
    }));

    // Any candidate the model skipped keeps its solver explanation.
    for (const candidate of candidates) {
      if (!seen.has(candidate.strategy)) {
        options.push({
          candidateId: candidate.strategy,
          rank: options.length + 1,
          explanation: explainCandidate(candidate),
          tradeoffs: explainTradeoff(candidate, input),
          source: "solver",
          candidate,
        });
      }
    }

    return { options, source: "ai", fallback: false, fallbackReason: null };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "The AI response could not be validated";
    return {
      options: fallbackOptions,
      source: "solver",
      fallback: true,
      fallbackReason: `AI unavailable, showing rule-based result. (${reason})`,
    };
  }
}

export interface ParsedFilter {
  category: string | null;
  tags: string[];
  keywords: string[];
  windowDays: number | null;
  source: "ai" | "keywords";
}

/** FR-1: the model produces a filter, the database produces the results. */
export async function parseSearchQuery(
  query: string,
  allowed: { categories: string[]; tags: string[] },
  userId: string,
): Promise<ParsedFilter> {
  const keywords = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 8);

  const localTags = keywords.filter((word) =>
    allowed.tags.some((tag) => tag.includes(word) || word.includes(tag)),
  );
  const localCategory =
    allowed.categories.find((category) => query.toLowerCase().includes(category.toLowerCase())) ??
    null;

  const ai = getAIProvider();
  if (!ai.available) {
    return { category: localCategory, tags: localTags, keywords, windowDays: null, source: "keywords" };
  }

  try {
    checkRateLimit(`ai:parse:${userId}`, RATE_LIMITS.ai);
    const raw = await ai.parseQuery({
      query,
      allowedCategories: allowed.categories,
      allowedTags: allowed.tags,
    });
    const parsed = parsedQuerySchema.parse(raw);

    const category =
      parsed.category && allowed.categories.includes(parsed.category) ? parsed.category : null;
    const tags = (parsed.tags ?? []).filter((tag) => allowed.tags.includes(tag));
    return {
      category,
      tags,
      keywords: parsed.keywords?.length ? parsed.keywords.slice(0, 8) : keywords,
      windowDays: parsed.windowDays ?? null,
      source: "ai",
    };
  } catch {
    return {
      category: localCategory,
      tags: localTags,
      keywords,
      windowDays: null,
      source: "keywords",
    };
  }
}

/** N4 phrasing: the model may only restate computed facts. */
export async function phraseCounterfactual(
  counterfactual: Counterfactual,
  context: { equipmentName: string; outcome: string },
  userId: string,
): Promise<string> {
  const fallback = counterfactual.wouldWin
    ? `You lost this slot on ${context.equipmentName}. The smallest change that would have flipped it: ${counterfactual.change.label.toLowerCase()} from ${counterfactual.change.from} to ${counterfactual.change.to}. Requests were ranked on deadline proximity, faculty priority, recent usage, hours efficiency and reliability.`
    : `You lost this slot on ${context.equipmentName}. No single small change flips the outcome: the window is oversubscribed. Ask your faculty guide or the campus admin to widen the window.`;

  const ai = getAIProvider();
  if (!ai.available) return fallback;

  try {
    checkRateLimit(`ai:phrase:${userId}`, RATE_LIMITS.ai);
    const raw = await ai.phrase({
      kind: "counterfactual",
      facts: {
        equipment: context.equipmentName,
        outcome: context.outcome,
        change: counterfactual.change,
        factors: counterfactual.factors.map((factor) => ({
          label: factor.label,
          weight: factor.weight,
          score: factor.score,
        })),
      },
    });
    return phraseResponseSchema.parse(raw).text;
  } catch {
    return fallback;
  }
}

export async function summariseSubstitution(
  original: string,
  substitute: string,
  specDiff: { key: string; original: string | null; substitute: string | null }[],
): Promise<string> {
  const differences = specDiff
    .filter((entry) => entry.original !== entry.substitute)
    .slice(0, 4)
    .map((entry) => `${entry.key}: ${entry.original ?? "not specified"} → ${entry.substitute ?? "not specified"}`);

  const fallback = differences.length
    ? `${substitute} is the closest match. Differences: ${differences.join("; ")}.`
    : `${substitute} is the closest available match with the same specifications.`;

  const ai = getAIProvider();
  if (!ai.available) return fallback;

  try {
    const raw = await ai.summariseDiff({ original, substitute, specDiff });
    return diffSummarySchema.parse(raw).summary;
  } catch {
    return fallback;
  }
}

/** N1 (Specified) is implemented so the ID-validation contract is testable. */
export async function planFromCatalogue(input: {
  description: string;
  deadline: string;
  teamSize: number;
  candidates: { equipmentId: string; name: string; category: string; tags: string[] }[];
  now: string;
}): Promise<{ available: { equipmentId: string; name: string; hours: number; rationale: string }[]; unavailable: string[]; rationale: string }> {
  const byId = new Map(input.candidates.map((candidate) => [candidate.equipmentId, candidate]));
  const deadlineDays = Math.max(0, diffHours(input.now, input.deadline) / 24);

  const ai = getAIProvider();
  if (ai.available) {
    try {
      const raw = await ai.planFromCatalogue({
        description: input.description,
        deadlineDays,
        teamSize: input.teamSize,
        candidates: input.candidates,
      });
      const parsed = (
        await import("@/lib/ai/schemas")
      ).planResponseSchema.parse(raw);

      const available = parsed.items
        .filter((item) => byId.has(item.equipmentId))
        .map((item) => ({
          equipmentId: item.equipmentId,
          name: byId.get(item.equipmentId)!.name,
          hours: item.hours,
          rationale: item.rationale,
        }));

      if (available.length > 0) {
        return { available, unavailable: parsed.unavailable ?? [], rationale: parsed.rationale };
      }
    } catch {
      // fall through to the deterministic plan
    }
  }

  // Deterministic fallback: pick catalogue items whose tags match the brief.
  const words = input.description.toLowerCase().split(/\W+/).filter(Boolean);
  const scored = input.candidates
    .map((candidate) => ({
      candidate,
      match:
        candidate.tags.filter((tag) => words.includes(tag)).length * 2 +
        (words.some((word) => candidate.category.toLowerCase().includes(word)) ? 1 : 0),
    }))
    .sort((a, b) => b.match - a.match)
    .slice(0, 3);

  return {
    available: scored.map(({ candidate }, index) => ({
      equipmentId: candidate.equipmentId,
      name: candidate.name,
      hours: Math.max(2, Math.round((deadlineDays * (index === 0 ? 1.5 : 0.75)) / 0.5) * 0.5),
      rationale: "Estimated from the brief and the time remaining. Estimate only.",
    })),
    unavailable: [],
    rationale:
      "Rule-based plan from your campus catalogue. Hours are estimates and nothing has been booked.",
  };
}

export { formatIstRange };

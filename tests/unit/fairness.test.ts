import { describe, expect, it } from "vitest";
import {
  deadlineScore,
  hoursEfficiencyScore,
  normalizeWeights,
  priorityScore,
  recentUsageScore,
  reliabilityScore,
  scoreRequest,
} from "@/lib/solver/fairness";

const NOW = "2026-03-02T04:00:00.000Z";
const WEIGHTS = {
  deadline: 0.35,
  priority: 0.25,
  recentUsage: 0.2,
  hoursEfficiency: 0.1,
  reliability: 0.1,
};

describe("fairness factors", () => {
  it("scores a nearer deadline higher", () => {
    expect(deadlineScore("2026-03-03T04:00:00.000Z", NOW)).toBeGreaterThan(
      deadlineScore("2026-03-10T04:00:00.000Z", NOW),
    );
  });

  it("clamps deadline proximity to 0..1", () => {
    expect(deadlineScore("2025-01-01T00:00:00.000Z", NOW)).toBe(1);
    expect(deadlineScore("2027-01-01T00:00:00.000Z", NOW)).toBe(0);
  });

  it("orders priority tiers", () => {
    expect(priorityScore("high")).toBeGreaterThan(priorityScore("normal"));
    expect(priorityScore("normal")).toBeGreaterThan(priorityScore("low"));
  });

  it("rewards less recent usage", () => {
    expect(recentUsageScore(0)).toBeGreaterThan(recentUsageScore(10));
    expect(recentUsageScore(20)).toBe(0);
    expect(recentUsageScore(200)).toBe(0);
  });

  it("rewards smaller requests", () => {
    expect(hoursEfficiencyScore(2)).toBeGreaterThan(hoursEfficiencyScore(30));
  });

  it("stays neutral on reliability until there is a track record", () => {
    expect(reliabilityScore(0, 0)).toBe(1);
    expect(reliabilityScore(1, 0)).toBe(1);
    expect(reliabilityScore(1, 3)).toBe(0.75);
  });

  it("normalises weights to sum to 1", () => {
    const weights = normalizeWeights({ ...WEIGHTS, deadline: 0.7 });
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("produces a weighted score in range and ranks a tight deadline first", () => {
    const base = {
      priority: "normal" as const,
      recentHours: 2,
      hoursNeeded: 3,
      noShows: 0,
      completions: 2,
    };
    const near = scoreRequest({ ...base, deadline: "2026-03-03T04:00:00.000Z" }, WEIGHTS, NOW);
    const far = scoreRequest({ ...base, deadline: "2026-03-12T04:00:00.000Z" }, WEIGHTS, NOW);

    expect(near.score).toBeGreaterThan(far.score);
    for (const factor of near.factors) {
      expect(factor.score).toBeGreaterThanOrEqual(0);
      expect(factor.score).toBeLessThanOrEqual(1);
    }
    expect(near.blockers.length).toBe(3);
  });
});

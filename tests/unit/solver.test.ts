import { describe, expect, it } from "vitest";
import { resetStoreForTests } from "@/lib/db/store";
import { buildSolverInput } from "@/lib/repo/conflicts";
import { detectConflict, generateCandidates, totalRequestedHours } from "@/lib/solver/conflict";
import {
  applyCounterfactual,
  findCounterfactual,
} from "@/lib/solver/counterfactual";
import type { SolverInput } from "@/lib/solver/types";

const BASE = new Date("2026-03-02T04:00:00.000Z"); // Monday, 09:30 IST

function fixture(): { input: SolverInput; requestId: string } {
  const store = resetStoreForTests(BASE);
  const conflict = store.data.conflicts[0]!;
  const built = buildSolverInput(store, conflict, BASE.toISOString());
  return { input: built, requestId: "req-aarav-conflict" };
}

describe("conflict solver", () => {
  it("detects demand above capacity", () => {
    const { input } = fixture();
    const detection = detectConflict(input);
    expect(totalRequestedHours(input)).toBe(14);
    expect(detection.capacity).toBe(12);
    expect(detection.conflict).toBe(true);
  });

  it("produces feasible candidates only", () => {
    const { input } = fixture();
    const candidates = generateCandidates(input);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.length).toBeLessThanOrEqual(5);

    const unitIds = new Set(input.units.map((unit) => unit.id));
    for (const candidate of candidates) {
      expect(candidate.score).toBeGreaterThan(0);
      expect(candidate.score).toBeLessThanOrEqual(1);

      for (const allocation of candidate.allocation) {
        expect(unitIds.has(allocation.unitId)).toBe(true);
        expect(new Date(allocation.startTime) >= new Date(input.windowStart)).toBe(true);
        expect(new Date(allocation.endTime) <= new Date(input.windowEnd)).toBe(true);
        expect(new Date(allocation.endTime) > new Date(allocation.startTime)).toBe(true);
      }

      // No unit holds two overlapping allocations inside one candidate.
      for (const a of candidate.allocation) {
        for (const b of candidate.allocation) {
          if (a === b || a.unitId !== b.unitId) continue;
          const overlaps =
            new Date(a.startTime) < new Date(b.endTime) &&
            new Date(b.startTime) < new Date(a.endTime);
          expect(overlaps).toBe(false);
        }
      }
    }

    // Something has to give: no candidate can honour every hour.
    expect(candidates[0]!.hoursAllocated).toBeLessThanOrEqual(12);
  });

  it("ranks by fairness and keeps unallocated requests explicit", () => {
    const { input } = fixture();
    const best = generateCandidates(input)[0]!;
    expect(best.unallocated.length + best.allocation.filter((a) => a.requestId === "req-priya-conflict").length)
      .toBeGreaterThan(0);
    expect(best.score).toBeGreaterThan(0);
  });

  it("computes a counterfactual that flips the outcome when applied", () => {
    const { input, requestId } = fixture();
    const counterfactual = findCounterfactual(input, requestId);

    expect(counterfactual).not.toBeNull();
    expect(counterfactual!.wouldWin).toBe(true);
    expect(counterfactual!.factors.length).toBeGreaterThan(0);

    // The acceptance criterion: applying the reported change flips the outcome.
    const patched = applyCounterfactual(input, requestId, counterfactual!);
    const after = generateCandidates(patched)[0]!;
    expect(after.allocation.some((entry) => entry.requestId === requestId)).toBe(true);
  });

  it("returns no counterfactual for a request that already wins", () => {
    const { input } = fixture();
    const best = generateCandidates(input)[0]!;
    const winner = best.allocation[0]!.requestId;
    expect(findCounterfactual(input, winner)).toBeNull();
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import { resetStoreForTests, type Store } from "@/lib/db/store";
import { ApiError } from "@/lib/errors";
import { listEquipment } from "@/lib/repo/catalogue";
import { getConflict } from "@/lib/repo/conflicts";
import { listRequests } from "@/lib/repo/requests";
import { decide } from "@/lib/services/requests";
import { recommend } from "@/lib/services/conflicts";
import type { Session } from "@/lib/auth/session";

const BASE = new Date("2026-03-02T04:00:00.000Z");
const DEMO = "campus-demo";
const RIVERSIDE = "campus-riverside";

const riversideStudent: Session = {
  userId: "user-kiran",
  campusId: RIVERSIDE,
  campusName: "Riverside Institute",
  name: "Kiran Rao",
  email: "kiran@riverside.edu.in",
  role: "student",
  emailNotifications: true,
};

const demoStudent: Session = {
  userId: "user-aarav",
  campusId: DEMO,
  campusName: "Demo Campus",
  name: "Aarav Sharma",
  email: "student@demo.lablink.example",
  role: "student",
  emailNotifications: true,
};

const demoAdmin: Session = {
  userId: "user-sana",
  campusId: DEMO,
  campusName: "Demo Campus",
  name: "Sana Qureshi",
  email: "admin@demo.lablink.example",
  role: "campus_admin",
  emailNotifications: true,
};

let store: Store;

beforeEach(() => {
  store = resetStoreForTests(BASE);
});

async function expectApiError(promise: Promise<unknown>, code: string) {
  try {
    await promise;
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
  }
}

describe("tenant isolation (application layer)", () => {
  it("never returns another campus's catalogue", () => {
    const demo = listEquipment(store, DEMO, { limit: 60 });
    const riverside = listEquipment(store, RIVERSIDE, { limit: 60 });

    expect(demo.items.some((item) => item.equipment.id === "eq-r-jetson")).toBe(false);
    expect(riverside.items.some((item) => item.equipment.id === "eq-jetson")).toBe(false);
    expect(riverside.items.every((item) => item.equipment.campusId === RIVERSIDE)).toBe(true);
  });

  it("never returns another campus's requests", () => {
    const riverside = listRequests(store, RIVERSIDE, { status: "all" });
    expect(riverside.map((entry) => entry.request.id)).toEqual(["req-kiran"]);

    const demo = listRequests(store, DEMO, { status: "all" });
    expect(demo.some((entry) => entry.request.id === "req-kiran")).toBe(false);
  });

  it("cannot resolve a conflict from another campus", () => {
    expect(() => getConflict(store, RIVERSIDE, "conflict-jetson")).toThrow(ApiError);
    expect(() => getConflict(store, DEMO, "conflict-jetson")).not.toThrow();
  });

  it("cannot decide another campus's request", async () => {
    await expectApiError(
      decide(riversideStudent, {
        requestId: "req-neha-prusa",
        decision: "approve",
        version: 1,
      }),
      "NOT_FOUND",
    );
  });

  it("requires staff roles for allocation work", async () => {
    await expectApiError(recommend(demoStudent, "conflict-jetson"), "FORBIDDEN");
    await expectApiError(
      (await import("@/lib/services/conflicts")).resolve(demoStudent, {
        conflictId: "conflict-jetson",
        optionId: "opt-conflict-jetson-fairness",
      }),
      "FORBIDDEN",
    );
  });

  it("scopes the recommendation to the caller's campus", async () => {
    await expectApiError(
      recommend({ ...riversideStudent, role: "campus_admin", userId: "user-vikram" }, "conflict-jetson"),
      "NOT_FOUND",
    );
    const result = await recommend(demoAdmin, "conflict-jetson");
    expect(result.options.length).toBeGreaterThan(0);
  });
});

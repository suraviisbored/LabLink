import { describe, expect, it } from "vitest";
import { emailDomain, isValidEmail, resolveCampusForEmail } from "@/lib/auth/tenancy";
import type { Campus } from "@/lib/types";

const CAMPUSES: Campus[] = [
  {
    id: "a",
    name: "Demo Campus",
    timezone: "Asia/Kolkata",
    allowedEmailDomains: ["demo.lablink.example"],
    isDemo: true,
    isActive: true,
  },
  {
    id: "b",
    name: "Riverside Institute",
    timezone: "Asia/Kolkata",
    allowedEmailDomains: ["riverside.edu.in"],
    isDemo: false,
    isActive: true,
  },
  {
    id: "c",
    name: "Inactive Campus",
    timezone: "Asia/Kolkata",
    allowedEmailDomains: ["inactive.edu"],
    isDemo: false,
    isActive: false,
  },
];

describe("domain -> campus mapping", () => {
  it("extracts the domain case-insensitively", () => {
    expect(emailDomain("Student@Demo.LabLink.Example")).toBe("demo.lablink.example");
  });

  it("validates obvious malformed addresses", () => {
    expect(isValidEmail("no-at-sign")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("a@b.edu")).toBe(true);
  });

  it("maps a supported domain to exactly one campus", () => {
    const result = resolveCampusForEmail("someone@riverside.edu.in", CAMPUSES);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.campus.id).toBe("b");
  });

  it("rejects an unmapped domain", () => {
    const result = resolveCampusForEmail("someone@gmail.com", CAMPUSES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("campus_not_supported");
  });

  it("rejects an invalid email", () => {
    const result = resolveCampusForEmail("not-an-email", CAMPUSES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invalid_email");
  });

  it("ignores inactive campuses", () => {
    const result = resolveCampusForEmail("someone@inactive.edu", CAMPUSES);
    expect(result.ok).toBe(false);
  });

  it("refuses to pick when a domain is mapped twice", () => {
    const duplicated = [
      ...CAMPUSES,
      { ...CAMPUSES[0]!, id: "dup", name: "Duplicate" },
    ];
    const result = resolveCampusForEmail("someone@demo.lablink.example", duplicated);
    expect(result.ok).toBe(false);
  });
});

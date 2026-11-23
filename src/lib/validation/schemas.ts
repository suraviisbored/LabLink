import { z } from "zod";

/** Shared Zod schemas: every route validates its input with one of these. */

const isoDate = z.string().datetime({ offset: true });

export const demoLoginSchema = z
  .object({ role: z.enum(["student", "faculty", "campus_admin", "super_admin"]) })
  .strict();

export const signupSchema = z
  .object({
    name: z.string().min(2).max(80),
    email: z.string().email().max(160),
  })
  .strict();

export const searchSchema = z
  .object({
    q: z.string().max(200).optional(),
    departmentId: z.string().max(80).optional(),
    category: z.string().max(80).optional(),
    status: z.enum(["available", "unavailable", "retired"]).optional(),
    labId: z.string().max(80).optional(),
    availableFrom: isoDate.optional(),
    availableTo: isoDate.optional(),
    offset: z.coerce.number().int().min(0).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
    naturalLanguage: z.coerce.boolean().optional(),
  })
  .strict();

export const nlSearchSchema = z
  .object({ query: z.string().min(2).max(240) })
  .strict();

export const bookingCreateSchema = z
  .object({
    equipmentId: z.string().min(1).max(80),
    startTime: isoDate,
    endTime: isoDate,
    idempotencyKey: z.string().min(8).max(120),
    requestId: z.string().max(80).nullable().optional(),
  })
  .strict();

export const bookingPatchSchema = z.object({ action: z.literal("cancel") }).strict();

export const projectCreateSchema = z
  .object({
    title: z.string().min(3).max(140),
    description: z.string().max(2000).default(""),
    deadline: isoDate,
    facultyId: z.string().max(80).nullable().optional(),
  })
  .strict();

export const requestCreateSchema = z
  .object({
    projectId: z.string().max(80).optional(),
    newProject: projectCreateSchema.optional(),
    equipmentId: z.string().min(1).max(80),
    hoursNeeded: z.number().min(0.5).max(200),
    windowStart: isoDate,
    windowEnd: isoDate,
    justification: z.string().min(5).max(2000),
  })
  .strict()
  .refine((value) => Boolean(value.projectId || value.newProject), {
    message: "Choose a project or describe a new one.",
    path: ["projectId"],
  });

export const decisionSchema = z
  .object({
    decision: z.enum(["approve", "reject", "modify"]),
    note: z.string().max(500).optional(),
    priority: z.enum(["low", "normal", "high"]).optional(),
    hoursNeeded: z.number().min(0.5).max(200).optional(),
    windowStart: isoDate.optional(),
    windowEnd: isoDate.optional(),
    version: z.number().int().min(1).optional(),
  })
  .strict();

export const resolveSchema = z
  .object({
    optionId: z.string().min(1).max(120),
    overrideNote: z.string().max(500).optional(),
  })
  .strict();

export const preferencesSchema = z.object({ emailNotifications: z.boolean() }).strict();

export const notificationReadSchema = z.object({ id: z.string().min(1).max(80) }).strict();

export const settingsSchema = z
  .object({
    weeklyHoursQuota: z.number().min(1).max(60).optional(),
    cancelCutoffHours: z.number().min(0).max(48).optional(),
    graceMinutes: z.number().min(0).max(60).optional(),
    fairnessWeights: z
      .object({
        deadline: z.number().min(0).max(1).optional(),
        priority: z.number().min(0).max(1).optional(),
        recentUsage: z.number().min(0).max(1).optional(),
        hoursEfficiency: z.number().min(0).max(1).optional(),
        reliability: z.number().min(0).max(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const equipmentCreateSchema = z
  .object({
    labId: z.string().min(1).max(80),
    name: z.string().min(2).max(120),
    category: z.string().min(2).max(80),
    description: z.string().max(1000).default(""),
    specs: z.record(z.string().max(40), z.string().max(80)).default({}),
    tags: z.array(z.string().min(1).max(30)).max(10).default([]),
    requiresCertification: z.boolean().default(false),
    units: z.number().int().min(1).max(30).default(1),
    assetPrefix: z.string().max(8).optional(),
  })
  .strict();

export const unitStatusSchema = z
  .object({
    unitId: z.string().min(1).max(120),
    status: z.enum(["available", "maintenance", "retired"]),
  })
  .strict();

export const maintenanceSchema = z
  .object({
    unitId: z.string().min(1).max(120),
    startTime: isoDate,
    endTime: isoDate,
    reason: z.string().max(200).default(""),
  })
  .strict();

export const blackoutSchema = z
  .object({
    labId: z.string().min(1).max(80),
    startTime: isoDate,
    endTime: isoDate,
    reason: z.string().max(200).default(""),
  })
  .strict();

export const waitlistSchema = z
  .object({
    equipmentId: z.string().min(1).max(80),
    startTime: isoDate,
    endTime: isoDate,
  })
  .strict();

export const campusCreateSchema = z
  .object({
    name: z.string().min(2).max(120),
    domains: z.array(z.string().min(3).max(120)).min(1).max(10),
    timezone: z.string().max(60).optional(),
  })
  .strict();

export const facultyGrantSchema = z
  .object({ userId: z.string().min(1).max(80) })
  .strict();

export type SearchInput = z.infer<typeof searchSchema>;

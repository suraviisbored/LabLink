import { z } from "zod";

/**
 * Every AI response passes through one of these schemas before it can affect
 * the UI. Unknown rank fields are rejected; a schema failure means the caller
 * falls back to the solver (PRD GenAI 5.6).
 */

export const rankResponseSchema = z
  .object({
    options: z
      .array(
        z
          .object({
            candidateId: z.string().min(1).max(80),
            rank: z.number().int().min(1).max(10),
            explanation: z.string().min(1).max(700),
            tradeoffs: z.string().min(1).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();

export type RankResponse = z.infer<typeof rankResponseSchema>;

export const parsedQuerySchema = z
  .object({
    category: z.string().max(80).optional().nullable(),
    tags: z.array(z.string().max(40)).max(8).optional(),
    keywords: z.array(z.string().max(40)).max(8).optional(),
    windowDays: z.number().int().min(0).max(60).optional().nullable(),
  })
  .strip();

export type ParsedQuery = z.infer<typeof parsedQuerySchema>;

export const phraseResponseSchema = z
  .object({
    text: z.string().min(1).max(600),
  })
  .strict();

export const diffSummarySchema = z
  .object({
    summary: z.string().min(1).max(600),
  })
  .strict();

export const planResponseSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            equipmentId: z.string().min(1).max(80),
            hours: z.number().min(0.5).max(80),
            rationale: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(8),
    rationale: z.string().min(1).max(600),
    unavailable: z.array(z.string().max(120)).max(8).optional(),
  })
  .strict();

export type PlanResponse = z.infer<typeof planResponseSchema>;

import { z } from "zod"

export const EventEntrySchema = z.object({
  ts: z.string(),
  event: z.string(),
  sessionId: z.string(),
  tool: z.string().optional(),
  agentType: z.string().optional(),
  action: z.string().optional(),
  durationMs: z.number().optional(),
  error: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})
export type EventEntry = z.infer<typeof EventEntrySchema>

export const ConversationSummarySchema = z.object({
  sessionId: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  durationMs: z.number(),
  totalEvents: z.number(),
  toolCounts: z.record(z.string(), z.number()),
  dispatchCounts: z.record(z.string(), z.number()),
  errorCount: z.number(),
  denyCount: z.number(),
  hookCounts: z.record(z.string(), z.number()),
  errors: z.array(
    z.object({
      ts: z.string(),
      tool: z.string(),
      error: z.string(),
    }),
  ),
  denies: z.array(
    z.object({
      ts: z.string(),
      tool: z.string(),
      reason: z.string(),
    }),
  ),
})
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>

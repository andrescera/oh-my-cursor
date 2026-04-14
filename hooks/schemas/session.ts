import { z } from "zod"

export const RalphLoopStateSchema = z.object({
  active: z.boolean(),
  iteration: z.number(),
  maxIterations: z.number(),
  startedAt: z.string(),
})
export type RalphLoopState = z.infer<typeof RalphLoopStateSchema>

export const BoulderStateSchema = z.object({
  active: z.boolean(),
  failureCount: z.number(),
  lastContinuationAt: z.string().nullable(),
})
export type BoulderState = z.infer<typeof BoulderStateSchema>

export const SubagentOutcomeSchema = z.object({
  agentId: z.string(),
  agentType: z.string(),
  description: z.string(),
  status: z.enum(["completed", "failed"]),
  errorContext: z.string().optional(),
  completedAt: z.string(),
  durationMs: z.number().optional(),
})
export type SubagentOutcome = z.infer<typeof SubagentOutcomeSchema>

export const RecentToolTrailEntrySchema = z.object({
  tool: z.string(),
  path: z.string().optional(),
  commandSnippet: z.string().optional(),
})
export type RecentToolTrailEntry = z.infer<typeof RecentToolTrailEntrySchema>

export const SessionStateSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  env: z.record(z.string(), z.string()),
  dispatchCounts: z.record(z.string(), z.number()),
  contextHistory: z.array(z.string()),
  // Set<string> serializes to array in JSON
  readPaths: z.array(z.string()),
  injectedPaths: z.array(z.string()),
  // Map<string, unknown> serializes to object in JSON
  pendingWriteArgs: z.record(z.string(), z.unknown()),
  toolCallCount: z.number(),
  reminderInjected: z.boolean(),
  recentToolTrail: z.array(RecentToolTrailEntrySchema),
  toolCallsSinceTaskDispatch: z.number(),
  ralphState: RalphLoopStateSchema.nullable(),
  boulderState: BoulderStateSchema.nullable(),
  stoppedAt: z.string().nullable(),
  errorCount: z.number(),
  lastCompactionEpoch: z.number(),
  compactionSnapshot: z.unknown().nullable(),
  activePlan: z
    .object({
      path: z.string(),
      phase: z.string(),
      completedTasks: z.array(z.string()),
    })
    .nullable(),
  // Map<string, "pending"|"in_progress"|"completed"|"cancelled"> serializes to object
  todoStates: z.record(z.string(), z.enum(["pending", "in_progress", "completed", "cancelled"])),
  continuationCooldownUntil: z.number().nullable(),
  consecutiveContinuationFailures: z.number(),
  lastTodoSnapshot: z.string(),
  momusIterations: z.number(),
  composerMode: z.string().nullable(),
  abortDetectedAt: z.number().nullable(),
  subagentOutcomes: z.array(SubagentOutcomeSchema),
  subagentFailureCounts: z.record(z.string(), z.number()),
  delegateRetryState: z.record(z.string(), z.number()),
})
export type SessionState = z.infer<typeof SessionStateSchema>

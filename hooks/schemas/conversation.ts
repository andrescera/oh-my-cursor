import { z } from "zod"

export const RalphLoopStateSchema = z.object({
  active: z.boolean(),
  iteration: z.number(),
  maxIterations: z.number(),
  startedAt: z.string(),
  lastProcessedIndex: z.number().default(0),
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

export const ConversationStateSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  displayTitle: z.string().nullable(),
  env: z.record(z.string(), z.string()),
  dispatchCounts: z.record(z.string(), z.number()),
  dispatchCountsThisTurn: z.record(z.string(), z.number()),
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
  toolCallCountAtLastStop: z.number(),
  consecutiveZeroDeltas: z.number(),
  lastTodoSnapshot: z.string(),
  momusIterations: z.number(),
  composerMode: z.string().nullable(),
  abortDetectedAt: z.number().nullable(),
  subagentOutcomes: z.array(SubagentOutcomeSchema),
  subagentFailureCounts: z.record(z.string(), z.number()),
  delegateRetryState: z.record(z.string(), z.number()),
  shellFailureCounts: z.number(),
  fileEditCounts: z.record(z.string(), z.number()),
  mcpCallCounts: z.record(z.string(), z.number()),
  responseCount: z.number(),
  estimatedTokens: z.number(),
  tokenWarningEmitted: z.boolean(),
  wisdomLearnings: z.array(z.object({ source: z.string(), learning: z.string(), timestamp: z.string() })),
  createdViaFallback: z.boolean(),
})
export type ConversationState = z.infer<typeof ConversationStateSchema>

// Persisted shape (schemaVersion 2): only durable fields + identity stamps.
// Ephemeral fields (composerMode, ralphState, boulderState, continuationCooldownUntil,
// consecutiveContinuationFailures, toolCallCountAtLastStop, consecutiveZeroDeltas,
// lastTodoSnapshot, abortDetectedAt, reminderInjected) are intentionally absent.
export const DurableConversationFieldsSchema = ConversationStateSchema.pick({
  id: true,
  startedAt: true,
  displayTitle: true,
  env: true,
  dispatchCounts: true,
  dispatchCountsThisTurn: true,
  contextHistory: true,
  readPaths: true,
  injectedPaths: true,
  pendingWriteArgs: true,
  toolCallCount: true,
  recentToolTrail: true,
  toolCallsSinceTaskDispatch: true,
  stoppedAt: true,
  errorCount: true,
  lastCompactionEpoch: true,
  compactionSnapshot: true,
  activePlan: true,
  todoStates: true,
  momusIterations: true,
  subagentOutcomes: true,
  subagentFailureCounts: true,
  delegateRetryState: true,
  shellFailureCounts: true,
  fileEditCounts: true,
  mcpCallCounts: true,
  responseCount: true,
  estimatedTokens: true,
  tokenWarningEmitted: true,
  wisdomLearnings: true,
  createdViaFallback: true,
})

export const PersistedRecordSchema = DurableConversationFieldsSchema.extend({
  schemaVersion: z.literal(2),
  projectRoot: z.string(),
  daemonBootId: z.string(),
})
export type PersistedRecord = z.infer<typeof PersistedRecordSchema>

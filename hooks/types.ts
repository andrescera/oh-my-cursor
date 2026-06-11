export type RalphLoopState = {
  active: boolean
  iteration: number
  maxIterations: number
  startedAt: string
  lastProcessedIndex: number
}

export type BoulderState = {
  active: boolean
  failureCount: number
  lastContinuationAt: string | null
  loopStartedAt: string | null
}

export type SubagentOutcome = {
  agentId: string
  agentType: string
  description: string
  status: "completed" | "failed"
  errorContext?: string
  completedAt: string
  durationMs?: number
}

export type AgentHistoryStatus = "running" | "completed" | "failed" | "abandoned"

export type AgentHistoryEntry = {
  agentId: string
  agentType: string
  description: string
  startTime: number
  completedAt: number | null
  durationMs: number
  status: AgentHistoryStatus
  errorContext: string | null
  projectRoot: string
  daemonBootId: string
  schemaVersion: 1
}

export type RecentToolTrailEntry = {
  tool: string
  path?: string
  commandSnippet?: string
}

export type ConversationState = {
  id: string
  startedAt: string
  displayTitle: string | null
  env: Record<string, string>
  dispatchCounts: Record<string, number>
  dispatchCountsThisTurn: Record<string, number>
  contextHistory: string[]
  readPaths: Set<string>
  injectedPaths: Set<string>
  pendingWriteArgs: Map<string, unknown>
  toolCallCount: number
  reminderInjected: boolean
  recentToolTrail: RecentToolTrailEntry[]
  toolCallsSinceTaskDispatch: number
  ralphState: RalphLoopState | null
  boulderState: BoulderState | null
  stoppedAt: string | null
  errorCount: number
  lastCompactionEpoch: number
  compactionSnapshot: unknown | null
  activePlan: { path: string; phase: string; completedTasks: string[] } | null
  // Durable tombstone (ISO ts): set when continuation is stopped, cleared on
  // /start-work reactivation. Blocks boulder resurrection across restarts.
  continuationStoppedAt: string | null
  todoStates: Map<string, "pending" | "in_progress" | "completed" | "cancelled">
  continuationCooldownUntil: number | null
  consecutiveContinuationFailures: number
  toolCallCountAtLastStop: number
  consecutiveZeroDeltas: number
  lastTodoSnapshot: string
  momusIterations: number
  composerMode: string | null
  abortDetectedAt: number | null
  subagentOutcomes: SubagentOutcome[]
  subagentFailureCounts: Record<string, number>
  delegateRetryState: Record<string, number>
  shellFailureCounts: number
  fileEditCounts: Record<string, number>
  mcpCallCounts: Record<string, number>
  responseCount: number
  estimatedTokens: number
  tokenWarningEmitted: boolean
  wisdomLearnings: Array<{ source: string; learning: string; timestamp: string }>
  createdViaFallback: boolean
}

export type DurableConversationFields = Pick<
  ConversationState,
  | "id"
  | "startedAt"
  | "displayTitle"
  | "env"
  | "dispatchCounts"
  | "dispatchCountsThisTurn"
  | "contextHistory"
  | "readPaths"
  | "injectedPaths"
  | "pendingWriteArgs"
  | "toolCallCount"
  | "recentToolTrail"
  | "toolCallsSinceTaskDispatch"
  | "stoppedAt"
  | "errorCount"
  | "lastCompactionEpoch"
  | "compactionSnapshot"
  | "activePlan"
  | "continuationStoppedAt"
  | "todoStates"
  | "momusIterations"
  | "subagentOutcomes"
  | "subagentFailureCounts"
  | "delegateRetryState"
  | "shellFailureCounts"
  | "fileEditCounts"
  | "mcpCallCounts"
  | "responseCount"
  | "estimatedTokens"
  | "tokenWarningEmitted"
  | "wisdomLearnings"
  | "createdViaFallback"
>

export type EphemeralConversationFields = Pick<
  ConversationState,
  | "composerMode"
  | "ralphState"
  | "boulderState"
  | "continuationCooldownUntil"
  | "consecutiveContinuationFailures"
  | "toolCallCountAtLastStop"
  | "consecutiveZeroDeltas"
  | "lastTodoSnapshot"
  | "abortDetectedAt"
  | "reminderInjected"
>

export type PersistedRecord = DurableConversationFields & {
  projectRoot: string
  daemonBootId: string
  schemaVersion: 2
}

type Equals<A, B> = (
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? ((<T>() => T extends B ? 1 : 2) extends (<T>() => T extends A ? 1 : 2) ? true : false)
    : false
)

type AssertTrue<T extends true> = T
type _ConversationStateCheck = AssertTrue<Equals<ConversationState, DurableConversationFields & EphemeralConversationFields>>

export type HandlerFn = (input: Record<string, unknown>) => Record<string, unknown>

export type HandlerMap = Record<string, HandlerFn>

export type { OhMyCursorConfig } from "./schemas/config"

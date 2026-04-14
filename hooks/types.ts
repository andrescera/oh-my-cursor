export type RalphLoopState = {
  active: boolean
  iteration: number
  maxIterations: number
  startedAt: string
}

export type BoulderState = {
  active: boolean
  failureCount: number
  lastContinuationAt: string | null
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

export type RecentToolTrailEntry = {
  tool: string
  path?: string
  commandSnippet?: string
}

export type ConversationState = {
  id: string
  startedAt: string
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
}

export type HandlerFn = (input: Record<string, unknown>) => Record<string, unknown>

export type HandlerMap = Record<string, HandlerFn>

export type { OhMyCursorConfig } from "./schemas/config"

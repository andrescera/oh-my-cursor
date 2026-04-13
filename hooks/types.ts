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

export type SessionState = {
  id: string
  startedAt: string
  env: Record<string, string>
  dispatchCounts: Record<string, number>
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
  lastTodoSnapshot: string
  momusIterations: number
  composerMode: string | null
  subagentOutcomes: SubagentOutcome[]
  subagentFailureCounts: Record<string, number>
  delegateRetryState: Record<string, number>
}

export type HandlerFn = (input: Record<string, unknown>) => Record<string, unknown>

export type HandlerMap = Record<string, HandlerFn>

export type OhMyCursorConfig = {
  version: number
  disabled_hooks: string[]
  disabled_agents: string[]
  subagent_limits: { explore: number; worker: number }
  state_persistence: { enabled: boolean; path: string }
  daemon: { port: number; mcp_port: number }
  context_collector: { enabled: boolean; max_context_chars: number }
  compaction: { prompt_enabled: boolean; user_message_template?: string }
  experimental: {
    cloud_agents: boolean
    webhooks: boolean
    automations: boolean
  }
  mcp_allowlist: string[]
  notifications: { enabled: boolean; sound: boolean }
  orchestration: { mode: "native" | "subagent" }
  continuation: { cooldown_ms: number; max_failures: number; backoff_multiplier: number }
  momus: { max_iterations: number }
  model_routing: {
    retry_on_errors: number[]
    max_retry_attempts: number
    defaults: Record<string, string>
  }
}

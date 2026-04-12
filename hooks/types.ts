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
  stagnationCount: number
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
  ralphState: RalphLoopState | null
  boulderState: BoulderState | null
  stoppedAt: string | null
  errorCount: number
  lastCompactionEpoch: number
  compactionSnapshot: unknown | null
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
  mdc_writer: { debounce_ms: number; enabled: boolean }
  experimental: {
    cloud_agents: boolean
    webhooks: boolean
    automations: boolean
  }
  mcp_allowlist: string[]
  notifications: { enabled: boolean; sound: boolean }
  orchestration: { mode: "native" | "subagent" }
}

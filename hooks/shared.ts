import type { SessionState } from "./types"

export const sessions = new Map<string, SessionState>()

export const globalReadPaths = new Set<string>()

export function getOrCreateSession(conversationId: string): SessionState {
  if (!sessions.has(conversationId)) {
    sessions.set(conversationId, {
      id: conversationId,
      startedAt: new Date().toISOString(),
      env: {},
      dispatchCounts: {},
      contextHistory: [],
      readPaths: new Set(),
      injectedPaths: new Set(),
      pendingWriteArgs: new Map(),
      toolCallCount: 0,
      reminderInjected: false,
      recentToolTrail: [],
      toolCallsSinceTaskDispatch: 0,
      ralphState: null,
      boulderState: null,
      stoppedAt: null,
      errorCount: 0,
      lastCompactionEpoch: 0,
      compactionSnapshot: null,
      activePlan: null,
      todoStates: new Map(),
      continuationCooldownUntil: null,
      consecutiveContinuationFailures: 0,
      lastTodoSnapshot: "",
      momusIterations: 0,
      composerMode: null,
      subagentOutcomes: [],
      subagentFailureCounts: {},
    })
  }
  return sessions.get(conversationId)!
}

export function parseInput(body: unknown): Record<string, unknown> {
  if (typeof body === "string") return JSON.parse(body)
  return body as Record<string, unknown>
}

export function extractMeta(
  event: string,
  input: Record<string, unknown>,
  toolInput: Record<string, unknown>,
  result: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {}

  if (toolInput.file_path || input.file_path) {
    meta.file = (toolInput.file_path || input.file_path) as string
  }

  if (event === "/beforeShellExecution") {
    meta.command = ((input.command as string) || (toolInput.command as string) || "").slice(0, 200)
  }

  if (event === "/preToolUse" && ["Task", "task", "Agent", "agent"].includes((input.tool_name as string) || "")) {
    meta.description = ((toolInput.description as string) || "").slice(0, 100)
  }

  if (event === "/sessionStart" || event === "/sessionEnd") {
    meta.project = ((input.workspace_roots as string[])?.[0]) || (input.cwd as string) || ""
  }

  if (event === "/stop") {
    meta.status = (input.status as string) || ""
  }

  if (result.permission === "deny") {
    meta.reason = (result.userMessage as string) || (result.agentMessage as string) || ""
  }

  return Object.keys(meta).length > 0 ? meta : undefined
}

export function parseTodoStates(toolInput: Record<string, unknown>): Map<string, string> {
  const result = new Map<string, string>()
  const todos = toolInput.todos as Array<{ id: string; status: string }> | undefined
  if (!todos || !Array.isArray(todos)) return result
  for (const todo of todos) {
    if (todo.id && todo.status) result.set(todo.id, todo.status)
  }
  return result
}

export function hashTodoStates(states: Map<string, string>): string {
  const sorted = Array.from(states.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  return JSON.stringify(sorted)
}

export function isInCooldown(session: SessionState): boolean {
  return session.continuationCooldownUntil !== null && Date.now() < session.continuationCooldownUntil
}

export function setCooldown(session: SessionState, durationMs: number): void {
  session.continuationCooldownUntil = Date.now() + durationMs
}

export function incrementContinuationFailure(session: SessionState): void {
  session.consecutiveContinuationFailures++
}

export function resetContinuationFailure(session: SessionState): void {
  session.consecutiveContinuationFailures = 0
  session.continuationCooldownUntil = null
}

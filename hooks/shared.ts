import type { ConversationState } from "./types"
import type { StatePersistence } from "./state-persistence"

export const conversations = new Map<string, ConversationState>()

let _persistence: StatePersistence | null = null

export function setPersistence(p: StatePersistence): void {
  _persistence = p
}

export function markDirty(convId: string): void {
  _persistence?.markDirty(convId)
}

export function getOrCreateConversation(conversationId: string): ConversationState {
  if (conversations.has(conversationId)) {
    return conversations.get(conversationId)!
  }
  let state: ConversationState | undefined
  if (_persistence) {
    const loaded = _persistence.loadOne(conversationId)
    if (loaded) {
      conversations.set(conversationId, loaded)
      state = loaded
    }
  }
  if (!state) {
    const created: ConversationState = {
      id: conversationId,
      startedAt: new Date().toISOString(),
      env: {},
      dispatchCounts: {},
      dispatchCountsThisTurn: {},
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
      toolCallCountAtLastStop: 0,
      consecutiveZeroDeltas: 0,
      lastTodoSnapshot: "",
      momusIterations: 0,
      composerMode: null,
      abortDetectedAt: null,
      subagentOutcomes: [],
      subagentFailureCounts: {},
      delegateRetryState: {},
      shellFailureCounts: 0,
      fileEditCounts: {},
      mcpCallCounts: {},
      responseCount: 0,
      estimatedTokens: 0,
      tokenWarningEmitted: false,
      wisdomLearnings: [],
      createdViaFallback: false,
    }
    conversations.set(conversationId, created)
    state = created
  }
  _persistence?.markDirty(conversationId)
  return state
}

export function parseInput(body: unknown): Record<string, unknown> {
  if (body === null || body === undefined) return {}
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body)
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed
      return {}
    } catch {
      return {}
    }
  }
  if (Array.isArray(body)) return {}
  if (typeof body === "object") return body as Record<string, unknown>
  return {}
}

export function resolveConversationId(input: Record<string, unknown>): string {
  const convId = (input.conversation_id as string) || (input.session_id as string)
  if (convId) return convId
  const fallbackId = crypto.randomUUID()
  console.warn(`[oh-my-cursor][resolveConversationId] No conversation_id or session_id provided, using fallback UUID: ${fallbackId}`)
  return fallbackId
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

export function isInCooldown(conversation: ConversationState): boolean {
  return conversation.continuationCooldownUntil !== null && Date.now() < conversation.continuationCooldownUntil
}

export function setCooldown(conversation: ConversationState, durationMs: number): void {
  conversation.continuationCooldownUntil = Date.now() + durationMs
}

export function incrementContinuationFailure(conversation: ConversationState): void {
  conversation.consecutiveContinuationFailures++
}

export function resetContinuationFailure(conversation: ConversationState): void {
  conversation.consecutiveContinuationFailures = 0
  conversation.continuationCooldownUntil = null
}

export const PLAN_PHASE_IDS = [
  "plan-draft", "plan-explore", "plan-interview", "plan-metis",
  "plan-write", "plan-review", "plan-decisions", "plan-momus", "plan-handoff",
]

export function transitionFromPlanMode(conversation: ConversationState): void {
  conversation.composerMode = "agent"
  for (const phaseId of PLAN_PHASE_IDS) {
    conversation.todoStates.delete(phaseId)
  }
}

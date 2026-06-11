import type { ConversationState } from "./types"
import type { StatePersistence } from "./state-persistence"
import { contextCollector } from "./context-collector"

export const conversations = new Map<string, ConversationState>()

let fallbackConversationsCreatedSinceBoot = 0

let _persistence: StatePersistence | null = null

export function getFallbackConversationsCreatedSinceBoot(): number {
  return fallbackConversationsCreatedSinceBoot
}

export function setPersistence(p: StatePersistence): void {
  _persistence = p
}

export function markDirty(convId: string): void {
  _persistence?.markDirty(convId)
}

// Synchronous write-through flush (bypasses debounced save()) for stop paths
// that must persist a cleared plan before returning, even across a crash.
export function forceFlush(): void {
  _persistence?.forceFlush(conversations)
}

export function getOrCreateConversation(
  conversationId: string,
  viaFallback?: boolean,
  projectRoot?: string,
): ConversationState {
  if (conversations.has(conversationId)) {
    return conversations.get(conversationId)!
  }
  let state: ConversationState | undefined
  if (_persistence) {
    const loaded = _persistence.loadOne(conversationId, projectRoot)
    if (loaded) {
      conversations.set(conversationId, loaded)
      state = loaded
      // Fix C (task-8): drop in-memory advisories from a prior daemon lifecycle
      // so a rehydrated conversation starts clean and never replays stale context.
      contextCollector.clear(conversationId)
    }
  }
  if (!state) {
    const createdViaFb = Boolean(viaFallback)
    if (createdViaFb) {
      fallbackConversationsCreatedSinceBoot++
    }
    const created: ConversationState = {
      id: conversationId,
      startedAt: new Date().toISOString(),
      displayTitle: null,
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
      continuationStoppedAt: null,
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
      createdViaFallback: createdViaFb,
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

export function wasResolvedViaFallback(input: Record<string, unknown>): boolean {
  const convId = (input.conversation_id as string) || (input.session_id as string)
  return !convId
}

export function resolveConversationId(input: Record<string, unknown>): string {
  const convId = (input.conversation_id as string) || (input.session_id as string)
  if (convId) return convId
  const fallbackId = crypto.randomUUID()
  console.warn(`[oh-my-cursor][resolveConversationId] No conversation_id or session_id provided, using fallback UUID: ${fallbackId}`)
  return fallbackId
}

// Reads the requesting hook's project root from a hook input payload.
// Cursor passes `workspace_roots` as a string array; `cwd` is a fallback
// for older payloads. Empty string when unknown — handlers that opt into
// project verification should pass this to getOrCreateConversation so the
// daemon refuses to rehydrate state stamped with a different project.
export function derivedProjectRoot(input: Record<string, unknown>): string {
  const workspaceRoots = input.workspace_roots
  if (Array.isArray(workspaceRoots) && workspaceRoots.length > 0 && typeof workspaceRoots[0] === "string") {
    return workspaceRoots[0]
  }
  const cwd = input.cwd
  if (typeof cwd === "string" && cwd) return cwd
  return ""
}

export function extractMeta(
  event: string,
  input: Record<string, unknown>,
  toolInput: Record<string, unknown>,
  result: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const meta: Record<string, unknown> = {}

  const filePath = (toolInput.file_path || input.file_path || toolInput.path || input.path) as string | undefined
  if (filePath) {
    meta.file = filePath
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

  if (event === "/preCompact") {
    meta.userMessageSize = typeof result.user_message === "string" ? result.user_message.length : 0
  }

  if (event === "/afterShellExecution") {
    meta.exitCode = (input.exit_code as number) ?? (input.exitCode as number) ?? undefined
  }

  if (event === "/beforeMCPExecution" || event === "/afterMCPExecution") {
    meta.mcpServer = (input.server_name as string) || (input.mcp_server_name as string) || (toolInput.serverName as string) || ""
  }

  if (event === "/beforeSubmitPrompt") {
    meta.promptLength = typeof input.prompt === "string" ? input.prompt.length : 0
  }

  if (event === "/subagentStart") {
    meta.subagentType = (input.subagent_type as string) || (toolInput.subagent_type as string) || (input.agent_type as string) || ""
    const desc = ((input.task as string) || (toolInput.description as string) || "").slice(0, 100)
    if (desc) meta.description = desc
  }

  if (event === "/subagentStop") {
    meta.subagentStatus = (input.status as string) || ""
    const description = (input.description as string) || (toolInput.description as string) || undefined
    if (description !== undefined) meta.description = description
    if (input.message_count !== undefined) meta.messageCount = input.message_count as number
    if (input.tool_call_count !== undefined) meta.toolCallCount = input.tool_call_count as number
  }

  if (result.permission === "deny") {
    meta.reason = (result.userMessage as string) || (result.agentMessage as string) || ""
  }

  if (result.decision === "block" && result.reason) {
    meta.reason = result.reason as string
  }

  return Object.keys(meta).length > 0 ? meta : undefined
}

export function classifyAction(event: string, result: Record<string, unknown>): string {
  if (event === "/postToolUseFailure") return "error"
  if (typeof result.permission === "string" && result.permission) return result.permission
  if (result.followup_message) return "continue"
  if (result.decision === "block") return "block"
  if (result.modified_output !== undefined) return "output_modified"
  if ((typeof result.user_message === "string" && result.user_message !== "") ||
      (typeof result.additional_context === "string" && result.additional_context !== ""))
    return "context_injected"
  return "noop"
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

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
      ralphState: null,
      boulderState: null,
      stoppedAt: null,
      errorCount: 0,
      lastCompactionEpoch: 0,
      compactionSnapshot: null,
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

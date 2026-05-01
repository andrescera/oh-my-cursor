import type { HandlerFn } from "../types"
import { AgentHistoryStore, getDefaultAgentHistoryStore, recordHistoryEntry } from "../agent-history-store"

const BOOT_ID_KEY = "__oh_my_cursor_runtime_boot_id"

function getDaemonBootId(): string {
  const fromEnv = process.env.OH_MY_CURSOR_DAEMON_BOOT_ID
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv
  }
  const bootGlobal = globalThis as Record<string, unknown>
  if (typeof bootGlobal[BOOT_ID_KEY] !== "string" || bootGlobal[BOOT_ID_KEY] === "") {
    bootGlobal[BOOT_ID_KEY] = crypto.randomUUID()
  }
  return bootGlobal[BOOT_ID_KEY] as string
}

type TrackedTask = {
  conversationId: string
  agentType: string
  description: string
  startTime: number
  projectRoot?: string
}

type ActiveTask = TrackedTask & {
  agentId: string
  elapsedMs: number
}

export const STALE_THRESHOLD_MS = 600_000

export class BackgroundTracker {
  private tasks = new Map<string, TrackedTask>()
  private readonly historyStore: AgentHistoryStore

  constructor(historyStore?: AgentHistoryStore) {
    this.historyStore = historyStore ?? getDefaultAgentHistoryStore()
  }

  track(agentId: string, agentType: string, description: string, conversationId: string, projectRoot?: string): void {
    this.tasks.set(agentId, { conversationId, agentType, description, startTime: Date.now(), projectRoot })
  }

  complete(agentId: string): void {
    this.tasks.delete(agentId)
  }

  getEntry(agentId: string): TrackedTask | null {
    return this.tasks.get(agentId) ?? null
  }

  completeOldestByType(conversationId: string, agentType: string): boolean {
    const normalizedType = agentType.toLowerCase()
    let oldestKey: string | null = null
    let oldestTime = Infinity
    for (const [agentId, task] of this.tasks) {
      if (task.conversationId === conversationId && task.agentType.toLowerCase() === normalizedType) {
        if (task.startTime < oldestTime) {
          oldestTime = task.startTime
          oldestKey = agentId
        }
      }
    }
    if (oldestKey !== null) {
      this.tasks.delete(oldestKey)
      return true
    }
    return false
  }

  getActiveTasks(): ActiveTask[] {
    const now = Date.now()
    return Array.from(this.tasks.entries()).map(([agentId, task]) => ({
      agentId,
      conversationId: task.conversationId,
      agentType: task.agentType,
      description: task.description,
      startTime: task.startTime,
      elapsedMs: now - task.startTime,
    }))
  }

  getActiveTasksForConversation(conversationId: string): ActiveTask[] {
    const now = Date.now()
    return Array.from(this.tasks.entries())
      .filter(([, task]) => task.conversationId === conversationId)
      .map(([agentId, task]) => ({
        agentId,
        conversationId: task.conversationId,
        agentType: task.agentType,
        description: task.description,
        startTime: task.startTime,
        elapsedMs: now - task.startTime,
      }))
  }

  cleanup(): void {
    const now = Date.now()
    for (const [agentId, task] of this.tasks) {
      if (now - task.startTime > STALE_THRESHOLD_MS) {
        const completedAt = Date.now()
        recordHistoryEntry({
          status: "abandoned",
          agentId,
          agentType: task.agentType,
          description: task.description,
          startTime: task.startTime,
          completedAt,
          durationMs: completedAt - task.startTime,
          projectRoot: task.projectRoot ?? "",
          daemonBootId: getDaemonBootId(),
        }, this.historyStore)
        this.tasks.delete(agentId)
      }
    }
  }

  clearConversation(conversationId: string): void {
    for (const [agentId, task] of this.tasks) {
      if (task.conversationId === conversationId) {
        this.tasks.delete(agentId)
      }
    }
  }
}

export function createBackgroundTasksHandler(tracker: BackgroundTracker): HandlerFn {
  return (input) => {
    tracker.cleanup()
    const convId =
      (input.conversation_id as string) || (input.session_id as string) || ""
    // When convId is empty (e.g. dashboard's initial /backgroundTasks fetch
    // before it has a session selected), return all active tasks so the UI
    // can paint immediately instead of waiting for SSE.
    const tasks = convId ? tracker.getActiveTasksForConversation(convId) : tracker.getActiveTasks()
    return { tasks, count: tasks.length }
  }
}

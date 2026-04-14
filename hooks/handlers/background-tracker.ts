import type { HandlerFn } from "../types"

type TrackedTask = {
  conversationId: string
  agentType: string
  description: string
  startTime: number
}

type ActiveTask = TrackedTask & {
  agentId: string
  elapsedMs: number
}

const STALE_THRESHOLD_MS = 600_000

export class BackgroundTracker {
  private tasks = new Map<string, TrackedTask>()

  track(agentId: string, agentType: string, description: string, conversationId: string): void {
    this.tasks.set(agentId, { conversationId, agentType, description, startTime: Date.now() })
  }

  complete(agentId: string): void {
    this.tasks.delete(agentId)
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
    const tasks = convId ? tracker.getActiveTasksForConversation(convId) : tracker.getActiveTasks()
    return { tasks, count: tasks.length }
  }
}

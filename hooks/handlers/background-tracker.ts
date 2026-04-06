import type { HandlerFn } from "../types"

type TrackedTask = {
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

  track(agentId: string, agentType: string, description: string): void {
    this.tasks.set(agentId, { agentType, description, startTime: Date.now() })
  }

  complete(agentId: string): void {
    this.tasks.delete(agentId)
  }

  getActiveTasks(): ActiveTask[] {
    const now = Date.now()
    return Array.from(this.tasks.entries()).map(([agentId, task]) => ({
      agentId,
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
  return (_input) => {
    tracker.cleanup()
    const tasks = tracker.getActiveTasks()
    return { tasks, count: tasks.length }
  }
}

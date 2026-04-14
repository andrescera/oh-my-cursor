import { describe, it, expect, beforeEach } from "bun:test"
import { BackgroundTracker, createBackgroundTasksHandler } from "./background-tracker"

function injectStaleTask(tracker: BackgroundTracker, agentId: string, agentType: string, description: string, conversationId = "conv-default"): void {
  tracker.track(agentId, agentType, description, conversationId)
  const internal = tracker as unknown as { tasks: Map<string, { agentType: string; description: string; startTime: number; conversationId: string }> }
  const entry = internal.tasks.get(agentId)
  if (entry) entry.startTime = Date.now() - 700_000
}

describe("BackgroundTracker", () => {
  let tracker: BackgroundTracker

  beforeEach(() => {
    tracker = new BackgroundTracker()
  })

  describe("#given an empty tracker", () => {
    it("returns an empty list of active tasks", () => {
      const tasks = tracker.getActiveTasks()
      expect(tasks).toEqual([])
    })
  })

  describe("#when tracking a task", () => {
    it("adds the task to active tasks", () => {
      tracker.track("agent-1", "explore", "Search codebase", "conv-default")

      const tasks = tracker.getActiveTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].agentId).toBe("agent-1")
      expect(tasks[0].agentType).toBe("explore")
      expect(tasks[0].description).toBe("Search codebase")
      expect(tasks[0].startTime).toBeGreaterThan(0)
      expect(tasks[0].elapsedMs).toBeGreaterThanOrEqual(0)
    })

    it("tracks multiple tasks", () => {
      tracker.track("agent-1", "explore", "Search files", "conv-default")
      tracker.track("agent-2", "librarian", "Fetch docs", "conv-default")

      const tasks = tracker.getActiveTasks()
      expect(tasks).toHaveLength(2)
    })
  })

  describe("#when completing a task", () => {
    it("removes the task from active tasks", () => {
      tracker.track("agent-1", "explore", "Search codebase", "conv-default")
      tracker.complete("agent-1")

      const tasks = tracker.getActiveTasks()
      expect(tasks).toEqual([])
    })

    it("only removes the specified task", () => {
      tracker.track("agent-1", "explore", "Search files", "conv-default")
      tracker.track("agent-2", "librarian", "Fetch docs", "conv-default")
      tracker.complete("agent-1")

      const tasks = tracker.getActiveTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].agentId).toBe("agent-2")
    })

    it("does nothing when completing a non-existent task", () => {
      tracker.track("agent-1", "explore", "Search files", "conv-default")
      tracker.complete("non-existent")

      const tasks = tracker.getActiveTasks()
      expect(tasks).toHaveLength(1)
    })
  })

  describe("#when getting active tasks", () => {
    it("includes elapsed time for each task", () => {
      tracker.track("agent-1", "explore", "Search codebase", "conv-default")

      const tasks = tracker.getActiveTasks()
      expect(tasks[0].elapsedMs).toBeGreaterThanOrEqual(0)
    })
  })

  describe("#when cleaning up stale tasks", () => {
    it("removes tasks older than 10 minutes", () => {
      injectStaleTask(tracker, "agent-1", "explore", "Old task")

      tracker.cleanup()

      const tasks = tracker.getActiveTasks()
      expect(tasks).toEqual([])
    })

    it("keeps tasks younger than 10 minutes", () => {
      tracker.track("agent-1", "explore", "Recent task", "conv-default")

      tracker.cleanup()

      const tasks = tracker.getActiveTasks()
      expect(tasks).toHaveLength(1)
    })

    it("removes only stale tasks from a mixed set", () => {
      tracker.track("fresh", "explore", "Fresh task", "conv-default")
      injectStaleTask(tracker, "stale", "librarian", "Stale task", "conv-default")

      tracker.cleanup()

      const tasks = tracker.getActiveTasks()
      expect(tasks).toHaveLength(1)
      expect(tasks[0].agentId).toBe("fresh")
    })
  })
})

describe("createBackgroundTasksHandler", () => {
  describe("#given a tracker with tasks", () => {
    it("returns tasks and count", () => {
      const tracker = new BackgroundTracker()
      tracker.track("agent-1", "explore", "Search files", "conv-default")
      tracker.track("agent-2", "librarian", "Fetch docs", "conv-default")
      const handler = createBackgroundTasksHandler(tracker)

      const result = handler({})

      expect(result.count).toBe(2)
      expect(Array.isArray(result.tasks)).toBe(true)
      const tasks = result.tasks as unknown[]
      expect(tasks).toHaveLength(2)
    })
  })

  describe("#given an empty tracker", () => {
    it("returns empty tasks and zero count", () => {
      const tracker = new BackgroundTracker()
      const handler = createBackgroundTasksHandler(tracker)

      const result = handler({})

      expect(result.count).toBe(0)
      expect(result.tasks).toEqual([])
    })
  })

  describe("#when handler is called", () => {
    it("cleans up stale tasks before returning", () => {
      const tracker = new BackgroundTracker()
      injectStaleTask(tracker, "stale-agent", "explore", "Very old task", "conv-default")
      tracker.track("fresh-agent", "librarian", "Recent task", "conv-default")
      const handler = createBackgroundTasksHandler(tracker)

      const result = handler({})

      expect(result.count).toBe(1)
      const tasks = result.tasks as Array<{ agentId: string }>
      expect(tasks[0].agentId).toBe("fresh-agent")
    })
  })
})

describe("#completeOldestByType", () => {
  let tracker: BackgroundTracker

  beforeEach(() => {
    tracker = new BackgroundTracker()
  })

  it("removes oldest matching task (FIFO by startTime)", async () => {
    tracker.track("agent-a", "explore", "First", "conv-1")
    await new Promise(r => setTimeout(r, 5))
    tracker.track("agent-b", "explore", "Second", "conv-1")
    await new Promise(r => setTimeout(r, 5))
    tracker.track("agent-c", "explore", "Third", "conv-1")

    const removed = tracker.completeOldestByType("conv-1", "explore")

    expect(removed).toBe(true)
    const remaining = tracker.getActiveTasks()
    expect(remaining).toHaveLength(2)
    expect(remaining.find(t => t.agentId === "agent-a")).toBeUndefined()
    expect(remaining.find(t => t.agentId === "agent-b")).toBeDefined()
    expect(remaining.find(t => t.agentId === "agent-c")).toBeDefined()
  })

  it("returns false when no matching conv/type exists", () => {
    tracker.track("agent-a", "explore", "Task", "conv-1")

    expect(tracker.completeOldestByType("conv-999", "explore")).toBe(false)
    expect(tracker.completeOldestByType("conv-1", "librarian")).toBe(false)
    expect(tracker.getActiveTasks()).toHaveLength(1)
  })

  it("is case-insensitive on agentType", () => {
    tracker.track("agent-a", "explore", "Task", "conv-1")

    const removed = tracker.completeOldestByType("conv-1", "Explore")

    expect(removed).toBe(true)
    expect(tracker.getActiveTasks()).toHaveLength(0)
  })
})

describe("#when filtering by session", () => {
  let tracker: BackgroundTracker

  beforeEach(() => {
    tracker = new BackgroundTracker()
  })

  it("returns only tasks for the specified session", () => {
    tracker.track("a1", "explore", "Task A", "session-a")
    tracker.track("a2", "librarian", "Task B", "session-b")
    tracker.track("a3", "explore", "Task C", "session-a")

    const tasksA = tracker.getActiveTasksForSession("session-a")
    const tasksB = tracker.getActiveTasksForSession("session-b")

    expect(tasksA).toHaveLength(2)
    expect(tasksB).toHaveLength(1)
    expect(tasksA.every(t => t.conversationId === "session-a")).toBe(true)
    expect(tasksB[0].conversationId).toBe("session-b")
  })

  it("returns empty for unknown session", () => {
    tracker.track("a1", "explore", "Task", "session-a")
    expect(tracker.getActiveTasksForSession("session-x")).toEqual([])
  })
})

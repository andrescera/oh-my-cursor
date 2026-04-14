import { describe, test, expect } from "bun:test"
import {
  ConversationStateSchema,
  SubagentOutcomeSchema,
  RalphLoopStateSchema,
  BoulderStateSchema,
} from "./conversation"

function minimalConversation(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    env: {},
    dispatchCounts: {},
    dispatchCountsThisTurn: {},
    contextHistory: [],
    readPaths: [],
    injectedPaths: [],
    pendingWriteArgs: {},
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
    todoStates: {},
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
    ...overrides,
  }
}

describe("ConversationStateSchema", () => {
  test("valid full conversation passes", () => {
    const conversation = minimalConversation({
      env: { HOME: "/home/u" },
      dispatchCounts: { explore: 2 },
      contextHistory: ["ctx"],
      readPaths: ["/a", "/b"],
      injectedPaths: ["/c"],
      pendingWriteArgs: { w: { path: "/x" } },
      toolCallCount: 3,
      reminderInjected: true,
      recentToolTrail: [{ tool: "read", path: "/p" }],
      toolCallsSinceTaskDispatch: 1,
      ralphState: {
        active: true,
        iteration: 1,
        maxIterations: 5,
        startedAt: "2026-01-02T00:00:00.000Z",
      },
      boulderState: {
        active: false,
        failureCount: 0,
        lastContinuationAt: "2026-01-03T00:00:00.000Z",
      },
      stoppedAt: null,
      errorCount: 1,
      lastCompactionEpoch: 2,
      compactionSnapshot: { foo: 1 },
      activePlan: {
        path: "/plan.md",
        phase: "1",
        completedTasks: ["t1"],
      },
      todoStates: { a: "pending", b: "in_progress" },
      continuationCooldownUntil: 1000,
      consecutiveContinuationFailures: 0,
      lastTodoSnapshot: "{}",
      momusIterations: 1,
      composerMode: "agent",
      abortDetectedAt: null,
      subagentOutcomes: [
        {
          agentId: "1",
          agentType: "explore",
          description: "d",
          status: "completed" as const,
          completedAt: "2026-01-01T01:00:00.000Z",
          durationMs: 10,
        },
      ],
      subagentFailureCounts: { x: 1 },
      delegateRetryState: { y: 0 },
    })
    const r = ConversationStateSchema.safeParse(conversation)
    expect(r.success).toBe(true)
  })

  test("empty object fails", () => {
    const r = ConversationStateSchema.safeParse({})
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("id"))).toBe(true)
    }
  })

  test("conversation with array readPaths (serialized form) passes", () => {
    const r = ConversationStateSchema.safeParse(
      minimalConversation({ readPaths: ["/src/a.ts", "/src/b.ts"] }),
    )
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.readPaths).toEqual(["/src/a.ts", "/src/b.ts"])
    }
  })

  test("conversation with record todoStates (serialized form) passes", () => {
    const r = ConversationStateSchema.safeParse(
      minimalConversation({
        todoStates: {
          t1: "pending",
          t2: "completed",
          t3: "cancelled",
        },
      }),
    )
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.todoStates.t1).toBe("pending")
      expect(r.data.todoStates.t2).toBe("completed")
    }
  })
})

describe("SubagentOutcomeSchema", () => {
  test("invalid status fails when not completed or failed", () => {
    const r = SubagentOutcomeSchema.safeParse({
      agentId: "a",
      agentType: "x",
      description: "d",
      status: "running",
      completedAt: "2026-01-01T00:00:00.000Z",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("status"))).toBe(true)
    }
  })
})

describe("RalphLoopStateSchema", () => {
  test("validates correctly", () => {
    const r = RalphLoopStateSchema.safeParse({
      active: true,
      iteration: 2,
      maxIterations: 10,
      startedAt: "2026-01-01T00:00:00.000Z",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.iteration).toBe(2)
    }
  })
})

describe("BoulderStateSchema", () => {
  test("null lastContinuationAt passes", () => {
    const r = BoulderStateSchema.safeParse({
      active: false,
      failureCount: 3,
      lastContinuationAt: null,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.lastContinuationAt).toBeNull()
    }
  })
})

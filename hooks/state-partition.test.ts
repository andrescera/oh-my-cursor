import { describe, expect, test } from "bun:test"
import { mergeFromDurable, partitionState } from "./state-partition"
import type { ConversationState } from "./types"

describe("state partition helpers", () => {
  test("partitionState then mergeFromDurable preserves all durable fields and resets ephemeral fields to defaults", () => {
    const state: ConversationState = {
      id: "conv-123",
      startedAt: "2026-04-29T08:00:00.000Z",
      displayTitle: "hello",
      env: { NODE_ENV: "test" },
      dispatchCounts: { explore: 3 },
      dispatchCountsThisTurn: { explore: 1 },
      contextHistory: ["context-a", "context-b"],
      readPaths: new Set(["/tmp/a.ts"]),
      injectedPaths: new Set(["/tmp/rules.mdc"]),
      pendingWriteArgs: new Map([["write-1", { path: "/tmp/a.ts", content: "x" }]]),
      toolCallCount: 5,
      reminderInjected: true,
      recentToolTrail: [{ tool: "ReadFile", path: "/tmp/a.ts" }],
      toolCallsSinceTaskDispatch: 2,
      ralphState: {
        active: true,
        iteration: 2,
        maxIterations: 6,
        startedAt: "2026-04-29T08:01:00.000Z",
        lastProcessedIndex: 4,
      },
      boulderState: {
        active: true,
        failureCount: 1,
        lastContinuationAt: "2026-04-29T08:02:00.000Z",
        loopStartedAt: "2026-04-29T08:00:30.000Z",
      },
      stoppedAt: "2026-04-29T08:03:00.000Z",
      errorCount: 1,
      lastCompactionEpoch: 12,
      compactionSnapshot: { tail: 10 },
      activePlan: { path: ".cursor/plans/test.plan.md", phase: "Wave 0", completedTasks: ["t0"] },
      todoStates: new Map([["t0", "completed"]]),
      continuationCooldownUntil: Date.now() + 10_000,
      consecutiveContinuationFailures: 3,
      toolCallCountAtLastStop: 4,
      consecutiveZeroDeltas: 2,
      lastTodoSnapshot: '[["t0","completed"]]',
      momusIterations: 1,
      composerMode: "plan",
      abortDetectedAt: Date.now(),
      subagentOutcomes: [
        {
          agentId: "agent-1",
          agentType: "explore",
          description: "checked references",
          status: "completed",
          completedAt: "2026-04-29T08:04:00.000Z",
          durationMs: 1200,
        },
      ],
      subagentFailureCounts: { explore: 1 },
      delegateRetryState: { "task-a": 2 },
      shellFailureCounts: 1,
      fileEditCounts: { "/tmp/a.ts": 2 },
      mcpCallCounts: { docs: 1 },
      responseCount: 8,
      estimatedTokens: 1500,
      tokenWarningEmitted: true,
      wisdomLearnings: [{ source: "test", learning: "keep durable isolated", timestamp: "2026-04-29T08:05:00.000Z" }],
      createdViaFallback: false,
    }

    const { durable } = partitionState(state)
    const merged = mergeFromDurable(durable)
    const repartitioned = partitionState(merged)

    expect(repartitioned.durable).toEqual(durable)
    expect(repartitioned.ephemeral).toEqual({
      composerMode: null,
      ralphState: null,
      boulderState: null,
      continuationCooldownUntil: null,
      consecutiveContinuationFailures: 0,
      toolCallCountAtLastStop: 0,
      consecutiveZeroDeltas: 0,
      lastTodoSnapshot: "",
      abortDetectedAt: null,
      reminderInjected: false,
    })
  })
})

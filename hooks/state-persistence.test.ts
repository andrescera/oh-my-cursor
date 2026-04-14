import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, unlinkSync, writeFileSync } from "node:fs"
import { StatePersistence } from "./state-persistence"
import type { ConversationState } from "./types"

const TEST_PATH = "/tmp/oh-my-cursor-state-test.json"

function createTestConversation(id: string): ConversationState {
  return {
    id,
    startedAt: new Date().toISOString(),
    env: {},
    dispatchCounts: {},
    dispatchCountsThisTurn: {},
    contextHistory: [],
    readPaths: new Set(["file1.ts", "file2.ts"]),
    injectedPaths: new Set(["agents.md"]),
    pendingWriteArgs: new Map([["tool-1", { path: "test.ts" }]]),
    toolCallCount: 5,
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
    delegateRetryState: {},
  }
}

function cleanup(): void {
  for (const path of [TEST_PATH, TEST_PATH + ".tmp"]) {
    try { if (existsSync(path)) unlinkSync(path) } catch { /* best-effort */ }
  }
}

describe("StatePersistence", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  describe("#given a conversations map with data", () => {
    describe("#when forceFlush is called and then load", () => {
      test("#then the loaded data matches the original", () => {
        // given
        const persistence = new StatePersistence(TEST_PATH, 60000)
        const conversations = new Map<string, ConversationState>()
        conversations.set("sess-1", createTestConversation("sess-1"))
        conversations.set("sess-2", createTestConversation("sess-2"))

        // when
        persistence.forceFlush(conversations)
        const loaded = persistence.load()

        // then
        expect(loaded).not.toBeNull()
        expect(loaded!.size).toBe(2)
        expect(loaded!.has("sess-1")).toBe(true)
        expect(loaded!.has("sess-2")).toBe(true)

        const conv1 = loaded!.get("sess-1")!
        expect(conv1.id).toBe("sess-1")
        expect(conv1.toolCallCount).toBe(5)
        expect(conv1.readPaths).toBeInstanceOf(Set)
        expect(conv1.readPaths.has("file1.ts")).toBe(true)
        expect(conv1.injectedPaths).toBeInstanceOf(Set)
        expect(conv1.injectedPaths.has("agents.md")).toBe(true)
        expect(conv1.pendingWriteArgs).toBeInstanceOf(Map)
        expect(conv1.pendingWriteArgs.has("tool-1")).toBe(true)
      })
    })
  })

  describe("#given no persisted state file exists", () => {
    describe("#when load is called", () => {
      test("#then it returns null", () => {
        const persistence = new StatePersistence(TEST_PATH)
        const result = persistence.load()
        expect(result).toBeNull()
      })
    })
  })

  describe("#given save is called with debounce", () => {
    describe("#when checked immediately", () => {
      test("#then the file is not yet written", () => {
        // given
        const persistence = new StatePersistence(TEST_PATH, 60000)
        const conversations = new Map<string, ConversationState>()
        conversations.set("sess-1", createTestConversation("sess-1"))

        // when
        persistence.save(conversations)

        // then
        expect(existsSync(TEST_PATH)).toBe(false)
      })
    })
  })

  describe("#given a corrupted state file", () => {
    describe("#when load is called", () => {
      test("#then it returns null without throwing", () => {
        // given
        writeFileSync(TEST_PATH, "not valid json {{{", "utf-8")

        // when
        const persistence = new StatePersistence(TEST_PATH)
        const result = persistence.load()

        // then
        expect(result).toBeNull()
      })
    })
  })

  describe("#given a state file with non-array content", () => {
    describe("#when load is called", () => {
      test("#then it returns null", () => {
        // given
        writeFileSync(TEST_PATH, JSON.stringify({ not: "an array" }), "utf-8")

        // when
        const persistence = new StatePersistence(TEST_PATH)
        const result = persistence.load()

        // then
        expect(result).toBeNull()
      })
    })
  })

  describe("#given persisted conversations with readPaths", () => {
    test("#then readPaths are preserved per conversation after round-trip", () => {
      const persistence = new StatePersistence(TEST_PATH, 60000)
      const testConversations = new Map<string, ConversationState>()
      const conv1 = createTestConversation("persist-1")
      conv1.readPaths = new Set(["/src/app.ts", "/src/utils.ts"])
      testConversations.set("persist-1", conv1)

      persistence.forceFlush(testConversations)
      const restored = persistence.load()

      expect(restored).not.toBeNull()
      const restoredConv = restored!.get("persist-1")
      expect(restoredConv).toBeDefined()
      expect(restoredConv!.readPaths.has("/src/app.ts")).toBe(true)
      expect(restoredConv!.readPaths.has("/src/utils.ts")).toBe(true)
    })
  })
})

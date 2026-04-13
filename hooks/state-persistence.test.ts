import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, unlinkSync, writeFileSync } from "node:fs"
import { StatePersistence } from "./state-persistence"
import { globalReadPaths } from "./shared"
import type { SessionState } from "./types"

const TEST_PATH = "/tmp/oh-my-cursor-state-test.json"

function createTestSession(id: string): SessionState {
  return {
    id,
    startedAt: new Date().toISOString(),
    env: {},
    dispatchCounts: {},
    contextHistory: [],
    readPaths: new Set(["file1.ts", "file2.ts"]),
    injectedPaths: new Set(["agents.md"]),
    pendingWriteArgs: new Map([["tool-1", { path: "test.ts" }]]),
    toolCallCount: 5,
    reminderInjected: false,
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

  describe("#given a sessions map with data", () => {
    describe("#when forceFlush is called and then load", () => {
      test("#then the loaded data matches the original", () => {
        // given
        const persistence = new StatePersistence(TEST_PATH, 60000)
        const sessions = new Map<string, SessionState>()
        sessions.set("sess-1", createTestSession("sess-1"))
        sessions.set("sess-2", createTestSession("sess-2"))

        // when
        persistence.forceFlush(sessions)
        const loaded = persistence.load()

        // then
        expect(loaded).not.toBeNull()
        expect(loaded!.size).toBe(2)
        expect(loaded!.has("sess-1")).toBe(true)
        expect(loaded!.has("sess-2")).toBe(true)

        const sess1 = loaded!.get("sess-1")!
        expect(sess1.id).toBe("sess-1")
        expect(sess1.toolCallCount).toBe(5)
        expect(sess1.readPaths).toBeInstanceOf(Set)
        expect(sess1.readPaths.has("file1.ts")).toBe(true)
        expect(sess1.injectedPaths).toBeInstanceOf(Set)
        expect(sess1.injectedPaths.has("agents.md")).toBe(true)
        expect(sess1.pendingWriteArgs).toBeInstanceOf(Map)
        expect(sess1.pendingWriteArgs.has("tool-1")).toBe(true)
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
        const sessions = new Map<string, SessionState>()
        sessions.set("sess-1", createTestSession("sess-1"))

        // when
        persistence.save(sessions)

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

  describe("#given persisted sessions with readPaths", () => {
    describe("#when loaded and iterated to rebuild globalReadPaths", () => {
      test("#then globalReadPaths contains all persisted paths", () => {
        // given
        const persistence = new StatePersistence(TEST_PATH, 60000)
        const sessions = new Map<string, SessionState>()
        const sess1 = createTestSession("rebuild-1")
        sess1.readPaths = new Set(["/src/app.ts", "/src/utils.ts"])
        const sess2 = createTestSession("rebuild-2")
        sess2.readPaths = new Set(["/src/utils.ts", "/src/index.ts"])
        sessions.set("rebuild-1", sess1)
        sessions.set("rebuild-2", sess2)

        persistence.forceFlush(sessions)
        const restored = persistence.load()

        // when - simulate daemon startup rebuild
        globalReadPaths.clear()
        for (const [, state] of restored!) {
          for (const p of state.readPaths) {
            globalReadPaths.add(p)
          }
        }

        // then
        expect(globalReadPaths.has("/src/app.ts")).toBe(true)
        expect(globalReadPaths.has("/src/utils.ts")).toBe(true)
        expect(globalReadPaths.has("/src/index.ts")).toBe(true)
        expect(globalReadPaths.size).toBeGreaterThanOrEqual(3)

        // cleanup
        globalReadPaths.clear()
      })
    })
  })
})

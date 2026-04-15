import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { StatePersistence } from "./state-persistence"
import type { ConversationState } from "./types"

const TEST_PATH = "/tmp/oh-my-cursor-state-test"
const LEGACY_STATE_FILE = "/tmp/oh-my-cursor-state.json"

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
    todoStates: new Map([["task-a", "pending"]]),
    continuationCooldownUntil: null,
    consecutiveContinuationFailures: 0,
    lastTodoSnapshot: "",
    momusIterations: 0,
    composerMode: null,
    subagentOutcomes: [],
    subagentFailureCounts: {},
    delegateRetryState: {},
    toolCallCountAtLastStop: 0,
    consecutiveZeroDeltas: 0,
    shellFailureCounts: 0,
    fileEditCounts: {},
    mcpCallCounts: {},
    responseCount: 0,
    estimatedTokens: 0,
    tokenWarningEmitted: false,
    wisdomLearnings: [],
    createdViaFallback: false,
    abortDetectedAt: null,
  }
}

function cleanup(): void {
  try {
    rmSync(TEST_PATH, { recursive: true, force: true })
  } catch {
    void 0
  }
  try {
    if (existsSync(LEGACY_STATE_FILE)) rmSync(LEGACY_STATE_FILE, { recursive: true, force: true })
  } catch {
    void 0
  }
}

describe("StatePersistence", () => {
  beforeEach(cleanup)
  afterEach(cleanup)

  test("forceFlush and loadOne round-trip preserves Sets and Maps", () => {
    const persistence = new StatePersistence(TEST_PATH, 60_000)
    const a = createTestConversation("sess-1")
    const b = createTestConversation("sess-2")
    const conversations = new Map<string, ConversationState>([
      ["sess-1", a],
      ["sess-2", b],
    ])
    persistence.markDirty("sess-1")
    persistence.markDirty("sess-2")
    persistence.forceFlush(conversations)

    const loaded1 = persistence.loadOne("sess-1")
    const loaded2 = persistence.loadOne("sess-2")
    expect(loaded1).not.toBeNull()
    expect(loaded2).not.toBeNull()

    expect(loaded1!.id).toBe("sess-1")
    expect(loaded1!.toolCallCount).toBe(5)
    expect(loaded1!.readPaths).toBeInstanceOf(Set)
    expect(loaded1!.readPaths.has("file1.ts")).toBe(true)
    expect(loaded1!.injectedPaths).toBeInstanceOf(Set)
    expect(loaded1!.injectedPaths.has("agents.md")).toBe(true)
    expect(loaded1!.pendingWriteArgs).toBeInstanceOf(Map)
    expect(loaded1!.pendingWriteArgs.get("tool-1")).toEqual({ path: "test.ts" })
    expect(loaded1!.todoStates).toBeInstanceOf(Map)
    expect(loaded1!.todoStates.get("task-a")).toBe("pending")

    expect(loaded2!.id).toBe("sess-2")
    expect(loaded2!.readPaths.has("file1.ts")).toBe(true)
  })

  test("loadOne returns null for missing conversation", () => {
    const persistence = new StatePersistence(TEST_PATH)
    expect(persistence.loadOne("does-not-exist")).toBeNull()
  })

  test("forceFlush writes only dirty conversation files", () => {
    const persistence = new StatePersistence(TEST_PATH, 60_000)
    const conversations = new Map<string, ConversationState>([
      ["dirty-id", createTestConversation("dirty-id")],
      ["clean-id", createTestConversation("clean-id")],
    ])
    persistence.markDirty("dirty-id")
    persistence.forceFlush(conversations)

    expect(existsSync(`${TEST_PATH}/dirty-id.json`)).toBe(true)
    expect(existsSync(`${TEST_PATH}/clean-id.json`)).toBe(false)
  })

  test("loadIndex returns metadata for all conversations after forceFlush", () => {
    const persistence = new StatePersistence(TEST_PATH, 60_000)
    const c1 = createTestConversation("meta-1")
    c1.toolCallCount = 7
    c1.errorCount = 2
    c1.composerMode = "agent"
    c1.stoppedAt = "2026-01-01T00:00:00.000Z"
    const c2 = createTestConversation("meta-2")
    const conversations = new Map<string, ConversationState>([
      ["meta-1", c1],
      ["meta-2", c2],
    ])
    persistence.markDirty("meta-1")
    persistence.markDirty("meta-2")
    persistence.forceFlush(conversations)

    const index = persistence.loadIndex()
    expect(index.size).toBe(2)

    const m1 = index.get("meta-1")!
    expect(m1.id).toBe("meta-1")
    expect(m1.startedAt).toBe(c1.startedAt)
    expect(m1.composerMode).toBe("agent")
    expect(m1.toolCallCount).toBe(7)
    expect(m1.errorCount).toBe(2)
    expect(m1.stoppedAt).toBe("2026-01-01T00:00:00.000Z")

    const m2 = index.get("meta-2")!
    expect(m2.id).toBe("meta-2")
    expect(m2.startedAt).toBe(c2.startedAt)
    expect(m2.composerMode).toBeNull()
    expect(m2.toolCallCount).toBe(5)
    expect(m2.errorCount).toBe(0)
    expect(m2.stoppedAt).toBeNull()
  })

  test("removeConversation deletes file and drops from index", () => {
    const persistence = new StatePersistence(TEST_PATH, 60_000)
    const conversations = new Map<string, ConversationState>([
      ["keep-me", createTestConversation("keep-me")],
      ["drop-me", createTestConversation("drop-me")],
    ])
    persistence.markDirty("keep-me")
    persistence.markDirty("drop-me")
    persistence.forceFlush(conversations)

    persistence.removeConversation("drop-me")

    expect(persistence.loadOne("drop-me")).toBeNull()
    expect(existsSync(`${TEST_PATH}/drop-me.json`)).toBe(false)
    expect(persistence.loadIndex().has("drop-me")).toBe(false)
    expect(persistence.loadOne("keep-me")).not.toBeNull()
  })

  test("pruneStale removes old conversations and returns their ids", () => {
    const persistence = new StatePersistence(TEST_PATH, 60_000)
    const stale = createTestConversation("stale-one")
    stale.startedAt = new Date(Date.now() - 3_600_000).toISOString()
    const fresh = createTestConversation("fresh-one")
    const conversations = new Map<string, ConversationState>([
      ["stale-one", stale],
      ["fresh-one", fresh],
    ])
    persistence.markDirty("stale-one")
    persistence.markDirty("fresh-one")
    persistence.forceFlush(conversations)

    const pruned = persistence.pruneStale(1_800_000)
    expect(pruned).toContain("stale-one")
    expect(pruned).not.toContain("fresh-one")
    expect(existsSync(`${TEST_PATH}/stale-one.json`)).toBe(false)
    expect(persistence.loadOne("stale-one")).toBeNull()
    expect(persistence.loadOne("fresh-one")).not.toBeNull()
    expect(persistence.loadIndex().has("stale-one")).toBe(false)
  })

  test("constructor removes legacy flat state file", () => {
    writeFileSync(LEGACY_STATE_FILE, "{}", "utf-8")
    expect(existsSync(LEGACY_STATE_FILE)).toBe(true)
    new StatePersistence(TEST_PATH)
    expect(existsSync(LEGACY_STATE_FILE)).toBe(false)
  })

  test("loadOne returns null for corrupted conversation JSON", () => {
    const persistence = new StatePersistence(TEST_PATH, 60_000)
    writeFileSync(`${TEST_PATH}/broken.json`, "not valid json {{{", "utf-8")
    expect(persistence.loadOne("broken")).toBeNull()
  })
})

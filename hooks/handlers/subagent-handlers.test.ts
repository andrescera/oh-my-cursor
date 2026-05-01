import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentHistoryStore } from "../agent-history-store"
import { conversations } from "../shared"
import { BackgroundTracker } from "./background-tracker"
import { createSubagentHandlers } from "./subagent-handlers"

// Mutable flags read by the lazy mock factories below.
// mock.module calls are hoisted before imports by bun:test, so factories run
// when the modules are first imported. The functions they return only READ
// these variables when invoked (inside a test), after the initialisers below
// have already executed — no temporal dead zone risk.
let _notificationsEnabled = true
let _logEventCallCount = 0

mock.module("../config", () => ({
  loadConfig: () => ({
    notifications: { enabled: _notificationsEnabled, sound: false },
  }),
  resetConfigCache: () => {},
  DEFAULT_CONFIG: { notifications: { enabled: true, sound: false } },
}))

mock.module("../event-logger", () => ({
  logEvent: () => { _logEventCallCount++ },
}))

function makeTempStore(): { store: AgentHistoryStore; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), "subagent-handlers-test-"))
  return {
    store: new AgentHistoryStore({ filePath: join(tempDir, "agent-history.jsonl") }),
    tempDir,
  }
}

describe("subagentStop background-notification: logEvent duplicate write", () => {
  let tracker: BackgroundTracker
  let store: AgentHistoryStore
  let tempDir: string

  beforeEach(() => {
    conversations.clear()
    _notificationsEnabled = true
    _logEventCallCount = 0
    const made = makeTempStore()
    store = made.store
    tempDir = made.tempDir
    tracker = new BackgroundTracker(store)
  })

  afterEach(() => {
    conversations.clear()
    try { rmSync(tempDir, { recursive: true, force: true }) } catch { void 0 }
  })

  // Scenario 1 — EXPECTED TO FAIL today: in-handler logEvent fires once (bug)
  it("given explore + notifications enabled, handler does not call logEvent (no duplicate write)", () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () => ({}) as unknown as ReturnType<typeof Bun.spawn>,
    )
    try {
      const handlers = createSubagentHandlers(conversations, tracker, store)

      handlers["/subagentStop"]!({
        conversation_id: "conv-sc1",
        agent_type: "explore",
        agent_id: "agent-sc1",
        status: "completed",
        workspace_roots: ["/tmp/project-sc1"],
      })

      expect(_logEventCallCount).toBe(0) // FAILS today: handler calls logEvent once at lines 301-307
      expect(spawnSpy).toHaveBeenCalledTimes(1)
      expect((spawnSpy.mock.calls[0] as [string[]])[0]?.[0]).toBe("bash")
    } finally {
      spawnSpy.mockRestore()
    }
  })

  // Scenario 2 — EXPECTED TO FAIL today: same bug, librarian path
  it("given librarian + notifications enabled, handler does not call logEvent (no duplicate write)", () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () => ({}) as unknown as ReturnType<typeof Bun.spawn>,
    )
    try {
      const handlers = createSubagentHandlers(conversations, tracker, store)

      handlers["/subagentStop"]!({
        conversation_id: "conv-sc2",
        agent_type: "librarian",
        agent_id: "agent-sc2",
        status: "completed",
        workspace_roots: ["/tmp/project-sc2"],
      })

      expect(_logEventCallCount).toBe(0) // FAILS today
      expect(spawnSpy).toHaveBeenCalledTimes(1)
      expect((spawnSpy.mock.calls[0] as [string[]])[0]?.[0]).toBe("bash")
    } finally {
      spawnSpy.mockRestore()
    }
  })

  // Scenario 3 — EXPECTED TO PASS today: notifications disabled → neither logEvent nor spawn
  it("given explore + notifications disabled, handler does not call logEvent and does not spawn", () => {
    _notificationsEnabled = false
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () => ({}) as unknown as ReturnType<typeof Bun.spawn>,
    )
    try {
      const handlers = createSubagentHandlers(conversations, tracker, store)

      handlers["/subagentStop"]!({
        conversation_id: "conv-sc3",
        agent_type: "explore",
        agent_id: "agent-sc3",
        status: "completed",
      })

      expect(_logEventCallCount).toBe(0)
      expect(spawnSpy).toHaveBeenCalledTimes(0)
    } finally {
      spawnSpy.mockRestore()
    }
  })

  // Scenario 4 — EXPECTED TO PASS today: non-background agent → notification path never entered
  it("given sisyphus-junior (non-background) + notifications enabled, handler does not call logEvent and does not spawn", () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () => ({}) as unknown as ReturnType<typeof Bun.spawn>,
    )
    try {
      const handlers = createSubagentHandlers(conversations, tracker, store)

      handlers["/subagentStop"]!({
        conversation_id: "conv-sc4",
        agent_type: "sisyphus-junior",
        agent_id: "agent-sc4",
        status: "completed",
      })

      expect(_logEventCallCount).toBe(0)
      expect(spawnSpy).toHaveBeenCalledTimes(0)
    } finally {
      spawnSpy.mockRestore()
    }
  })

  // Scenario 5 — EXPECTED TO FAIL today: is_background flag also triggers the bug
  it("given is_background:true + generalPurpose + notifications enabled, handler does not call logEvent and does spawn", () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(
      () => ({}) as unknown as ReturnType<typeof Bun.spawn>,
    )
    try {
      const handlers = createSubagentHandlers(conversations, tracker, store)

      handlers["/subagentStop"]!({
        conversation_id: "conv-sc5",
        agent_type: "generalPurpose",
        agent_id: "agent-sc5",
        is_background: true,
        status: "completed",
      })

      expect(_logEventCallCount).toBe(0) // FAILS today
      expect(spawnSpy).toHaveBeenCalledTimes(1)
    } finally {
      spawnSpy.mockRestore()
    }
  })

  // Scenario 6 — spawn failure is caught; logEvent fires after the catch (same bug, different trigger path)
  it("given explore + notifications enabled + Bun.spawn throws, handler does not throw and does not call logEvent", () => {
    const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
      throw new Error("spawn blocked in test")
    })
    try {
      const handlers = createSubagentHandlers(conversations, tracker, store)

      expect(() => {
        handlers["/subagentStop"]!({
          conversation_id: "conv-sc6",
          agent_type: "explore",
          agent_id: "agent-sc6",
          status: "completed",
        })
      }).not.toThrow()

      // logEvent is at lines 301-307, AFTER the try/catch that catches the spawn
      // error. The catch fires (void 0) and execution continues to logEvent, so
      // this assertion also fails today — the plan notes 1/2/5 as the primary
      // failing scenarios; this scenario fails for the same underlying reason.
      expect(_logEventCallCount).toBe(0)
    } finally {
      spawnSpy.mockRestore()
    }
  })
})

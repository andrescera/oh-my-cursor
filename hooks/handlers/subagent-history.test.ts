import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentHistoryStore } from "../agent-history-store"
import { conversations } from "../shared"
import { BackgroundTracker } from "./background-tracker"
import { createSubagentHandlers } from "./subagent-handlers"

function makeTempStore(): { store: AgentHistoryStore; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), "subagent-history-test-"))
  return {
    store: new AgentHistoryStore({ filePath: join(tempDir, "agent-history.jsonl") }),
    tempDir,
  }
}

describe("subagent history lifecycle", () => {
  let tracker: BackgroundTracker
  let store: AgentHistoryStore
  let tempDir: string

  beforeEach(() => {
    conversations.clear()
    const made = makeTempStore()
    store = made.store
    tempDir = made.tempDir
    tracker = new BackgroundTracker(store)
  })

  afterEach(() => {
    conversations.clear()
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  })

  it("/subagentStart writes a running history entry", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    const input: Record<string, unknown> = {
      conversation_id: "conv-start",
      agent_type: "sisyphus-junior",
      agent_id: "agent-start-1",
      description: "build feature",
      workspace_roots: ["/tmp/project-alpha"],
    }

    handlers["/subagentStart"]!(input)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      status: "running",
      agentId: "agent-start-1",
      agentType: "sisyphus-junior",
      description: "build feature",
      projectRoot: "/tmp/project-alpha",
      completedAt: null,
    })
    expect(typeof entries[0]?.daemonBootId).toBe("string")
    expect((entries[0]?.daemonBootId ?? "").length).toBeGreaterThan(0)
    expect(entries[0]?.startTime).toBeGreaterThan(0)
  })

  it("/subagentStart captures description from tool_input.description when top-level description is absent", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    handlers["/subagentStart"]!({
      conversation_id: "conv-desc-toolinput",
      agent_type: "explore",
      agent_id: "agent-desc-toolinput-1",
      tool_input: { description: "map the crawler" },
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.description).toBe("map the crawler")
  })

  it("/subagentStart captures description from the task field (real Cursor payload)", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    handlers["/subagentStart"]!({
      conversation_id: "conv-desc-task",
      agent_type: "explore",
      agent_id: "agent-desc-task-1",
      task: "Explore the app-explorer package",
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.description).toBe("Explore the app-explorer package")
  })

  it("/subagentStart warns once when the resolved description is empty", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    const input = {
      conversation_id: "conv-desc-empty",
      agent_type: "explore",
      agent_id: "agent-desc-empty-1",
    }
    handlers["/subagentStart"]!(input)
    handlers["/subagentStart"]!(input) // same agentId again — must not warn twice

    const emptyDescWarnings = warnSpy.mock.calls
      .map((c) => String(c[0] ?? ""))
      .filter((m) => m.includes("empty description"))
    expect(emptyDescWarnings).toHaveLength(1)
    expect(emptyDescWarnings[0]).toContain("[oh-my-cursor][subagentStart]")
    warnSpy.mockRestore()
  })

  it("/subagentStop without tracker match captures description from tool_input.description", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    // No /subagentStart, no agent_id, no tracker entry: must still record a real description.
    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-desc-toolinput",
      agent_type: "explore",
      agent_id: "agent-stop-desc-toolinput-1",
      tool_input: { description: "stop-time description" },
      status: "completed",
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.description).toBe("stop-time description")
  })

  it("/subagentStop success finalizes the same start record as completed", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    const startInput: Record<string, unknown> = {
      conversation_id: "conv-stop-success",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-success-1",
      description: "run task",
      workspace_roots: ["/tmp/project-beta"],
    }
    handlers["/subagentStart"]!(startInput)
    const runningEntry = store.query({})[0]

    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-success",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-success-1",
      description: "run task",
      status: "completed",
      workspace_roots: ["/tmp/project-beta"],
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("completed")
    expect(entries[0]?.agentId).toBe("agent-stop-success-1")
    expect(entries[0]?.startTime).toBe(runningEntry?.startTime)
    expect(entries[0]?.completedAt).not.toBeNull()
    expect((entries[0]?.durationMs ?? -1) >= 0).toBe(true)
  })

  it("/subagentStop with error_message finalizes as failed with redacted errorContext", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    handlers["/subagentStart"]!({
      conversation_id: "conv-stop-failed",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-failed-1",
      description: "run task",
      workspace_roots: ["/tmp/project-gamma"],
    })

    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-failed",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-failed-1",
      description: "run task",
      status: "failed",
      error_message: "crashed: sk-fake1234567890abcdef0123",
      workspace_roots: ["/tmp/project-gamma"],
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("failed")
    expect(entries[0]?.errorContext).toContain("[REDACTED:openai]")
    expect(entries[0]?.errorContext).not.toContain("sk-fake")
  })

  it("/subagentStop keeps failed status when status=failed and error_message is empty", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    handlers["/subagentStart"]!({
      conversation_id: "conv-stop-failed-no-error",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-failed-no-error-1",
      description: "run task",
    })

    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-failed-no-error",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-failed-no-error-1",
      status: "failed",
      error_message: "",
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("failed")
  })

  it("/subagentStop preserves start-row description on finalization", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    handlers["/subagentStart"]!({
      conversation_id: "conv-stop-description-preserved",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-description-preserved-1",
      description: "keep this description",
    })

    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-description-preserved",
      agent_type: "sisyphus-junior",
      agent_id: "agent-stop-description-preserved-1",
      description: "",
      status: "completed",
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.description).toBe("keep this description")
  })

  it("/subagentStop without agent_id finalizes against matched oldest tracker entry", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    handlers["/subagentStart"]!({
      conversation_id: "conv-stop-no-agent-id-match",
      agent_type: "explore",
      agent_id: "agent-stop-no-agent-id-match-1",
      description: "tracked description",
    })
    const runningEntry = store.query({})[0]

    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-no-agent-id-match",
      subagent_type: "explore",
      status: "completed",
    })

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.agentId).toBe("agent-stop-no-agent-id-match-1")
    expect(entries[0]?.startTime).toBe(runningEntry?.startTime)
    expect(entries[0]?.description).toBe("tracked description")
  })

  it("/subagentStop without agent_id and no tracker match skips history write and warns", () => {
    const handlers = createSubagentHandlers(conversations, tracker, store)
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {})

    handlers["/subagentStop"]!({
      conversation_id: "conv-stop-no-agent-id-no-match",
      subagent_type: "explore",
      status: "failed",
    })

    const entries = store.query({})
    expect(entries).toHaveLength(0)
    // Scan all warn calls (order-independent): unrelated process-global config
    // warnings can land in the spy depending on test execution order.
    const skipWarning = warnSpy.mock.calls
      .map((c) => String(c[0] ?? ""))
      .find((m) => m.includes("Skipping history write"))
    expect(skipWarning).toBeDefined()
    warnSpy.mockRestore()
  })
})

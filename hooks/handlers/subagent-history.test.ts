import { afterEach, beforeEach, describe, expect, it } from "bun:test"
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
})

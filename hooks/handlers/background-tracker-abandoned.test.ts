import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentHistoryStore, recordHistoryEntry } from "../agent-history-store"
import { BackgroundTracker, STALE_THRESHOLD_MS } from "./background-tracker"

function makeTempStore(): { store: AgentHistoryStore; tempDir: string } {
  const tempDir = mkdtempSync(join(tmpdir(), "background-tracker-abandoned-test-"))
  return {
    store: new AgentHistoryStore({ filePath: join(tempDir, "agent-history.jsonl") }),
    tempDir,
  }
}

describe("BackgroundTracker abandoned lifecycle writes", () => {
  let store: AgentHistoryStore
  let tempDir: string
  let tracker: BackgroundTracker

  beforeEach(() => {
    const made = makeTempStore()
    store = made.store
    tempDir = made.tempDir
    tracker = new BackgroundTracker(store)
  })

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  })

  it("cleanup() writes abandoned for stale-evicted entries", () => {
    tracker.track("agent-abandoned-1", "explore", "stale task", "conv-1", "/tmp/project-abandoned")
    const internal = tracker as unknown as {
      tasks: Map<string, { startTime: number }>
    }
    const stale = internal.tasks.get("agent-abandoned-1")
    expect(stale).toBeDefined()
    if (stale) stale.startTime = Date.now() - STALE_THRESHOLD_MS - 1

    tracker.cleanup()

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("abandoned")
    expect(entries[0]?.completedAt).not.toBeNull()
  })

  it("completed status survives a later synthetic abandoned write for same key", () => {
    const fixedStartTime = Date.now() - STALE_THRESHOLD_MS - 50
    recordHistoryEntry({
      status: "completed",
      agentId: "agent-rank-1",
      agentType: "explore",
      description: "already finished",
      startTime: fixedStartTime,
      completedAt: fixedStartTime + 10,
      durationMs: 10,
      errorContext: null,
      projectRoot: "/tmp/project-rank",
      daemonBootId: "boot-rank",
    }, store)

    tracker.track("agent-rank-1", "explore", "already finished", "conv-rank", "/tmp/project-rank")
    const internal = tracker as unknown as {
      tasks: Map<string, { startTime: number }>
    }
    const stale = internal.tasks.get("agent-rank-1")
    expect(stale).toBeDefined()
    if (stale) stale.startTime = fixedStartTime

    tracker.cleanup()

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("completed")
  })
})

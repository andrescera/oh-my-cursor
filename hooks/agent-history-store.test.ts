import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentHistoryStore, recordHistoryEntry } from "./agent-history-store"
import type { AgentHistoryEntry } from "./types"

function makeEntry(overrides: Partial<AgentHistoryEntry> = {}): AgentHistoryEntry {
  return {
    agentId: "agent-1",
    agentType: "explore",
    description: "default description",
    startTime: 1000,
    completedAt: 1500,
    durationMs: 500,
    status: "completed",
    errorContext: null,
    projectRoot: "/tmp/project",
    daemonBootId: "boot-1",
    schemaVersion: 1,
    ...overrides,
  }
}

describe("AgentHistoryStore", () => {
  let tempDir: string
  let tempFile: string
  let store: AgentHistoryStore

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "agent-history-test-"))
    tempFile = join(tempDir, "agent-history.jsonl")
    store = new AgentHistoryStore({ filePath: tempFile })
  })

  afterEach(() => {
    try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
  })

  it("round-trips record(entry) through query({})", () => {
    const entry = makeEntry({ agentId: "roundtrip-agent" })
    store.record(entry)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual(entry)
  })

  it("redacts secrets in recordHistoryEntry before persistence", () => {
    recordHistoryEntry({
      agentId: "redact-agent",
      agentType: "explore",
      description: "OPENAI_API_KEY=sk-fake1234567890abcdef0123",
      startTime: 2000,
      completedAt: null,
      durationMs: 0,
      status: "running",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-redact",
    }, store)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.description).toContain("[REDACTED:openai]")
    expect(entries[0]?.description).not.toContain("sk-fake")
  })

  it("truncates description to 500 chars after redaction", () => {
    recordHistoryEntry({
      agentId: "truncate-agent",
      agentType: "explore",
      description: "x".repeat(700),
      startTime: 3000,
      completedAt: null,
      durationMs: 0,
      status: "running",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-truncate",
    }, store)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.description.length).toBe(500)
  })

  it("enforces cap at 200 entries and drops oldest", () => {
    for (let i = 0; i < 250; i++) {
      store.record(
        makeEntry({
          agentId: `cap-agent-${i}`,
          startTime: 10_000 + i,
          completedAt: 10_100 + i,
          durationMs: 100,
        }),
      )
    }

    const entries = store.query({})
    expect(entries).toHaveLength(200)
    expect(entries.some((e) => e.agentId === "cap-agent-0")).toBe(false)
    expect(entries[entries.length - 1]?.agentId).toBe("cap-agent-50")
  })

  it("is idempotent by (agentId, startTime), updating status instead of duplicating", () => {
    recordHistoryEntry({
      agentId: "a",
      agentType: "explore",
      description: "running",
      startTime: 1000,
      completedAt: null,
      durationMs: 0,
      status: "running",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-idem",
    }, store)

    recordHistoryEntry({
      agentId: "a",
      agentType: "explore",
      description: "completed",
      startTime: 1000,
      completedAt: 1300,
      durationMs: 300,
      status: "completed",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-idem",
    }, store)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("completed")
  })

  it("keeps terminal status when a lower-rank status arrives for same key", () => {
    recordHistoryEntry({
      agentId: "rank-agent",
      agentType: "explore",
      description: "done",
      startTime: 2000,
      completedAt: 2400,
      durationMs: 400,
      status: "completed",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-rank",
    }, store)

    recordHistoryEntry({
      agentId: "rank-agent",
      agentType: "explore",
      description: "abandoned later",
      startTime: 2000,
      completedAt: 2600,
      durationMs: 600,
      status: "abandoned",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-rank",
    }, store)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe("completed")
  })

  it("clamps durationMs to 0 when completedAt is earlier than startTime", () => {
    recordHistoryEntry({
      agentId: "clock-agent",
      agentType: "explore",
      description: "clock skew",
      startTime: 5000,
      completedAt: 4500,
      durationMs: -500,
      status: "completed",
      errorContext: null,
      projectRoot: "/tmp/project",
      daemonBootId: "boot-clock",
    }, store)

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.durationMs).toBe(0)
  })

  it("skips schema-drift and corrupted lines without throwing", () => {
    store.record(makeEntry({ agentId: "valid-1", startTime: 1_000, completedAt: 1_100 }))
    store.record(makeEntry({ agentId: "valid-2", startTime: 2_000, completedAt: 2_100 }))

    const driftLine = JSON.stringify({
      ...makeEntry({ agentId: "schema-drift", startTime: 3_000, completedAt: 3_100 }),
      schemaVersion: 99,
    })
    appendFileSync(tempFile, `${driftLine}\n`)
    appendFileSync(tempFile, "{\"agentId\":\"x\",\"sta\n")

    expect(() => store.query({})).not.toThrow()
    const entries = store.query({})

    expect(entries.some((e) => e.agentId === "schema-drift")).toBe(false)
    expect(entries.map((e) => e.agentId)).toEqual(expect.arrayContaining(["valid-1", "valid-2"]))
  })

  it("writes exactly N entries when recording N rapidly, leaving no .tmp files", () => {
    for (let i = 0; i < 50; i++) {
      store.record(makeEntry({ agentId: `rapid-${i}`, startTime: 20_000 + i, completedAt: 20_050 + i }))
    }

    const lines = readFileSync(tempFile, "utf-8").trim().split("\n")
    expect(lines).toHaveLength(50)
    expect(store.query({})).toHaveLength(50)

    const leftovers = readdirSync(tempDir).filter((name) => name.includes(".tmp"))
    expect(leftovers).toEqual([])
  })

  it("recovers and writes valid output when the existing file is corrupt", () => {
    writeFileSync(tempFile, "}{ not json at all\n\u0000\u0000garbage", "utf-8")

    expect(() => store.record(makeEntry({ agentId: "recovered", startTime: 30_000, completedAt: 30_100 }))).not.toThrow()

    const lines = readFileSync(tempFile, "utf-8").trim().split("\n")
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0]!).agentId).toBe("recovered")

    const entries = store.query({})
    expect(entries).toHaveLength(1)
    expect(entries[0]?.agentId).toBe("recovered")
  })
})

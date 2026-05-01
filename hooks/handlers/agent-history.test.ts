import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { AgentHistoryStore } from "../agent-history-store"
import type { AgentHistoryEntry } from "../types"
import { createAgentHistoryHandler } from "./agent-history"

const ORIGINAL_PROJECT_DIR = process.env.OH_MY_CURSOR_PROJECT_DIR

type TempStoreFixture = {
  store: AgentHistoryStore
  tempDir: string
  filePath: string
}

function makeTempStore(): TempStoreFixture {
  const tempDir = mkdtempSync(join(tmpdir(), "agent-history-handler-test-"))
  const filePath = join(tempDir, "agent-history.jsonl")
  return {
    store: new AgentHistoryStore({ filePath }),
    tempDir,
    filePath,
  }
}

function makeEntry(overrides: Partial<AgentHistoryEntry>): AgentHistoryEntry {
  return {
    agentId: overrides.agentId ?? "agent-default",
    agentType: overrides.agentType ?? "explore",
    description: overrides.description ?? "run task",
    startTime: overrides.startTime ?? Date.now(),
    completedAt: overrides.completedAt ?? null,
    durationMs: overrides.durationMs ?? 0,
    status: overrides.status ?? "running",
    errorContext: overrides.errorContext ?? null,
    projectRoot: overrides.projectRoot ?? "/tmp/project-default",
    daemonBootId: overrides.daemonBootId ?? "boot-default",
    schemaVersion: 1,
  }
}

describe("createAgentHistoryHandler", () => {
  let fixture: TempStoreFixture

  beforeEach(() => {
    fixture = makeTempStore()
  })

  afterEach(() => {
    process.env.OH_MY_CURSOR_PROJECT_DIR = ORIGINAL_PROJECT_DIR
    rmSync(fixture.tempDir, { recursive: true, force: true })
  })

  it("returns empty entries and zero count for empty input when store is empty", () => {
    process.env.OH_MY_CURSOR_PROJECT_DIR = "/tmp/project-empty"
    const handler = createAgentHistoryHandler(fixture.store)

    const result = handler({})

    expect(result).toEqual({ entries: [], count: 0 })
  })

  it("filters by projectRoot and returns matching counts", () => {
    const handler = createAgentHistoryHandler(fixture.store)
    fixture.store.record(makeEntry({ agentId: "p-1", projectRoot: "P", startTime: 1000 }))
    fixture.store.record(makeEntry({ agentId: "p-2", projectRoot: "P", startTime: 2000 }))
    fixture.store.record(makeEntry({ agentId: "p-3", projectRoot: "P", startTime: 3000 }))
    fixture.store.record(makeEntry({ agentId: "q-1", projectRoot: "Q", startTime: 4000 }))
    fixture.store.record(makeEntry({ agentId: "q-2", projectRoot: "Q", startTime: 5000 }))

    const fromP = handler({ projectRoot: "P" }) as { entries: AgentHistoryEntry[]; count: number }
    const fromQ = handler({ projectRoot: "Q" }) as { entries: AgentHistoryEntry[]; count: number }

    expect(fromP.count).toBe(3)
    expect(fromP.entries).toHaveLength(3)
    expect(fromP.entries.every((entry) => entry.projectRoot === "P")).toBe(true)
    expect(fromQ.count).toBe(2)
    expect(fromQ.entries).toHaveLength(2)
    expect(fromQ.entries.every((entry) => entry.projectRoot === "Q")).toBe(true)
  })

  it("applies the since filter by excluding older startTime entries", () => {
    const handler = createAgentHistoryHandler(fixture.store)
    fixture.store.record(makeEntry({ agentId: "a-1000", projectRoot: "P", startTime: 1000 }))
    fixture.store.record(makeEntry({ agentId: "a-2000", projectRoot: "P", startTime: 2000 }))
    fixture.store.record(makeEntry({ agentId: "a-3000", projectRoot: "P", startTime: 3000 }))

    const result = handler({ projectRoot: "P", since: 2500 }) as { entries: AgentHistoryEntry[]; count: number }

    expect(result.count).toBe(1)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.startTime).toBe(3000)
  })

  it("applies limit and returns newest entries by startTime", () => {
    const handler = createAgentHistoryHandler(fixture.store)
    for (let i = 0; i < 50; i++) {
      fixture.store.record(
        makeEntry({
          agentId: `agent-${i}`,
          projectRoot: "P",
          startTime: 1000 + i,
        }),
      )
    }

    const result = handler({ projectRoot: "P", limit: 10 }) as { entries: AgentHistoryEntry[]; count: number }

    expect(result.count).toBe(10)
    expect(result.entries).toHaveLength(10)
    expect(result.entries.map((entry) => entry.startTime)).toEqual([1049, 1048, 1047, 1046, 1045, 1044, 1043, 1042, 1041, 1040])
  })

  it("supports allProjects=1 and defaults to daemon project filtering otherwise", () => {
    process.env.OH_MY_CURSOR_PROJECT_DIR = "P"
    const handler = createAgentHistoryHandler(fixture.store)
    fixture.store.record(makeEntry({ agentId: "p-1", projectRoot: "P", startTime: 1000 }))
    fixture.store.record(makeEntry({ agentId: "p-2", projectRoot: "P", startTime: 2000 }))
    fixture.store.record(makeEntry({ agentId: "q-1", projectRoot: "Q", startTime: 3000 }))

    const defaultFiltered = handler({}) as { entries: AgentHistoryEntry[]; count: number }
    const allProjects = handler({ allProjects: "1" }) as { entries: AgentHistoryEntry[]; count: number }

    expect(defaultFiltered.count).toBe(2)
    expect(defaultFiltered.entries.every((entry) => entry.projectRoot === "P")).toBe(true)
    expect(allProjects.count).toBe(3)
    expect(allProjects.entries.some((entry) => entry.projectRoot === "Q")).toBe(true)
  })

  it("skips corrupted JSONL lines and returns only valid entries", () => {
    process.env.OH_MY_CURSOR_PROJECT_DIR = "P"
    const handler = createAgentHistoryHandler(fixture.store)

    const first = makeEntry({ agentId: "valid-1", projectRoot: "P", startTime: 1000 })
    const second = makeEntry({ agentId: "valid-2", projectRoot: "P", startTime: 2000 })
    writeFileSync(
      fixture.filePath,
      `${JSON.stringify(first)}\n{"agentId":"broken"\n${JSON.stringify(second)}\n`,
      "utf-8",
    )

    const result = handler({ allProjects: "1" }) as { entries: AgentHistoryEntry[]; count: number }

    expect(result.count).toBe(2)
    expect(result.entries).toHaveLength(2)
    expect(result.entries.map((entry) => entry.agentId).sort()).toEqual(["valid-1", "valid-2"])
  })
})

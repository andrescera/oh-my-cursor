import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { logEvent, getEvents, clearLog, getLogPath, flushEventLog, flushNow } from "./event-logger"
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs"

describe("event-logger per-conversation behavior", () => {
  beforeEach(() => {
    clearLog()
  })

  afterEach(() => {
    clearLog()
  })

  it("getEvents filters by sessionId", () => {
    clearLog()
    const base = Date.now()
    logEvent({
      ts: new Date(base).toISOString(),
      event: "/preToolUse",
      sessionId: "session-A",
      tool: "Read",
    })
    logEvent({
      ts: new Date(base + 1).toISOString(),
      event: "/preToolUse",
      sessionId: "session-A",
      tool: "Read",
    })
    logEvent({
      ts: new Date(base + 2).toISOString(),
      event: "/preToolUse",
      sessionId: "session-B",
      tool: "Read",
    })
    expect(getEvents({ sessionId: "session-A" }).length).toBe(2)
    expect(getEvents({ sessionId: "session-B" }).length).toBe(1)
  })

  it("clearLog with sessionId removes only that conversation", () => {
    clearLog()
    const base = Date.now()
    logEvent({
      ts: new Date(base).toISOString(),
      event: "/preToolUse",
      sessionId: "session-X",
      tool: "Read",
    })
    logEvent({
      ts: new Date(base + 1).toISOString(),
      event: "/preToolUse",
      sessionId: "session-X",
      tool: "Read",
    })
    logEvent({
      ts: new Date(base + 2).toISOString(),
      event: "/preToolUse",
      sessionId: "session-Y",
      tool: "Read",
    })
    logEvent({
      ts: new Date(base + 3).toISOString(),
      event: "/preToolUse",
      sessionId: "session-Y",
      tool: "Read",
    })
    clearLog("session-X")
    expect(getEvents({ sessionId: "session-X" }).length).toBe(0)
    expect(getEvents({ sessionId: "session-Y" }).length).toBe(2)
  })

  it("getLogPath returns per-conversation path", () => {
    const withSession = getLogPath("my-session")
    expect(withSession).toContain("session-log-my-session.jsonl")
    const defaultPath = getLogPath()
    expect(defaultPath).toContain("session-log.jsonl")
    expect(defaultPath).not.toContain("session-log-.jsonl")
  })

  it("clearLog without sessionId clears everything", () => {
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-p",
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-q",
      tool: "Read",
    })
    clearLog()
    expect(getEvents().length).toBe(0)
  })

  it("flushEventLog drains pending event-log writes synchronously", () => {
    const sessionId = `flush-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId,
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
      event: "/postToolUse",
      sessionId,
      tool: "Read",
    })
    const path = getLogPath(sessionId)
    expect(existsSync(path)).toBe(false)
    flushEventLog()
    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, "utf-8").trim().split("\n")
    expect(lines.length).toBe(2)
    const events = lines.map((l) => JSON.parse(l) as { event: string; sessionId: string })
    expect(events[0]?.event).toBe("/preToolUse")
    expect(events[1]?.event).toBe("/postToolUse")
    expect(events.every((e) => e.sessionId === sessionId)).toBe(true)
  })

  it("flushNow writes pending entries to disk and resolves", async () => {
    const sessionId = `flushnow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    logEvent({ ts: new Date(Date.now()).toISOString(), event: "/preToolUse", sessionId, tool: "Read" })
    logEvent({ ts: new Date(Date.now() + 1).toISOString(), event: "/postToolUse", sessionId, tool: "Read" })
    const path = getLogPath(sessionId)
    expect(existsSync(path)).toBe(false)

    await flushNow()

    expect(existsSync(path)).toBe(true)
    const lines = readFileSync(path, "utf-8").trim().split("\n")
    expect(lines.length).toBe(2)
    const events = lines.map((l) => JSON.parse(l) as { event: string; sessionId: string })
    expect(events.map((e) => e.event)).toEqual(["/preToolUse", "/postToolUse"])
    expect(events.every((e) => e.sessionId === sessionId)).toBe(true)
  })

  it("burst beyond MAX_BUFFER trims oldest and keeps newest", () => {
    const MAX_BUFFER = 10_000
    const TRIM_TO = 5_000
    const sessionId = `burst-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const total = MAX_BUFFER + 1
    const base = Date.now()
    for (let i = 0; i < total; i++) {
      logEvent({ ts: new Date(base + i).toISOString(), event: "/preToolUse", sessionId, meta: { idx: i } })
    }

    const kept = getEvents({ sessionId, limit: total })
    expect(kept.length).toBe(TRIM_TO)

    const newestKeptIdx = kept[0]?.meta?.idx as number
    const oldestKeptIdx = kept[kept.length - 1]?.meta?.idx as number
    expect(newestKeptIdx).toBe(total - 1)
    expect(oldestKeptIdx).toBe(total - TRIM_TO)
  })
})

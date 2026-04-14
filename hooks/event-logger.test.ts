import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { logEvent, getEvents, clearLog, getLogPath } from "./event-logger"
import { existsSync, mkdirSync, rmSync } from "node:fs"

describe("event-logger per-conversation behavior", () => {
  beforeEach(() => {
    clearLog()
  })

  afterEach(() => {
    clearLog()
  })

  it("getEvents filters by sessionId", () => {
    clearLog()
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-A",
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-A",
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-B",
      tool: "Read",
    })
    expect(getEvents({ sessionId: "session-A" }).length).toBe(2)
    expect(getEvents({ sessionId: "session-B" }).length).toBe(1)
  })

  it("clearLog with sessionId removes only that conversation", () => {
    clearLog()
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-X",
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-X",
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
      event: "/preToolUse",
      sessionId: "session-Y",
      tool: "Read",
    })
    logEvent({
      ts: new Date().toISOString(),
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
})

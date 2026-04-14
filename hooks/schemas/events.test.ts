import { describe, test, expect } from "bun:test"
import { EventEntrySchema, ConversationSummarySchema } from "./events"

describe("EventEntrySchema", () => {
  test("valid EventEntry passes", () => {
    const r = EventEntrySchema.safeParse({
      ts: "2026-01-01T12:00:00.000Z",
      event: "tool_use",
      sessionId: "s-1",
      tool: "read",
      agentType: "native",
      action: "start",
      durationMs: 42,
      error: undefined,
      meta: { k: "v" },
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.tool).toBe("read")
    }
  })

  test("only required fields passes", () => {
    const r = EventEntrySchema.safeParse({
      ts: "2026-01-01T00:00:00.000Z",
      event: "ping",
      sessionId: "sid",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.event).toBe("ping")
      expect(r.data.tool).toBeUndefined()
    }
  })

  test("ts as number fails", () => {
    const r = EventEntrySchema.safeParse({
      ts: 1700000000000,
      event: "e",
      sessionId: "s",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("ts"))).toBe(true)
    }
  })

  test("optional meta as record passes", () => {
    const r = EventEntrySchema.safeParse({
      ts: "2026-01-01T00:00:00.000Z",
      event: "e",
      sessionId: "s",
      meta: { nested: { a: 1 }, flag: true },
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.meta).toEqual({ nested: { a: 1 }, flag: true })
    }
  })
})

describe("ConversationSummarySchema", () => {
  const baseSummary = {
    sessionId: "sess",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T01:00:00.000Z",
    durationMs: 3600000,
    totalEvents: 10,
    toolCounts: { read: 3 },
    dispatchCounts: { explore: 1 },
    errorCount: 0,
    denyCount: 0,
    hookCounts: { pre: 2 },
    errors: [] as { ts: string; tool: string; error: string }[],
    denies: [] as { ts: string; tool: string; reason: string }[],
  }

  test("valid ConversationSummary passes", () => {
    const r = ConversationSummarySchema.safeParse(baseSummary)
    expect(r.success).toBe(true)
  })

  test("null startedAt passes", () => {
    const r = ConversationSummarySchema.safeParse({
      ...baseSummary,
      startedAt: null,
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.startedAt).toBeNull()
    }
  })

  test("errors array validates correctly", () => {
    const r = ConversationSummarySchema.safeParse({
      ...baseSummary,
      errors: [
        { ts: "2026-01-01T00:00:00.000Z", tool: "write", error: "denied" },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.errors).toHaveLength(1)
      expect(r.data.errors[0].tool).toBe("write")
    }
  })

  test("denies array validates correctly", () => {
    const r = ConversationSummarySchema.safeParse({
      ...baseSummary,
      denies: [
        { ts: "2026-01-01T00:01:00.000Z", tool: "shell", reason: "policy" },
      ],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.denies).toHaveLength(1)
      expect(r.data.denies[0].reason).toBe("policy")
    }
  })
})

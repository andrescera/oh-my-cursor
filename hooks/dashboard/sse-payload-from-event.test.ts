import { describe, expect, test } from "bun:test"
import { ssePayloadFromEvent } from "./sse-payload-from-event"

describe("ssePayloadFromEvent", () => {
  test("returns top-level fields when present", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      agent_id: "abc",
      agent_type: "explore",
      description: "search for X",
      status: "running",
      duration_ms: 1234,
    })
    expect(out.agent_id).toBe("abc")
    expect(out.agent_type).toBe("explore")
    expect(out.description).toBe("search for X")
    expect(out.status).toBe("running")
    expect(out.duration_ms).toBe(1234)
  })

  test("falls back to camelCase top-level fields", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      agentId: "abc",
      agentType: "explore",
      durationMs: 99,
    })
    expect(out.agent_id).toBe("abc")
    expect(out.agent_type).toBe("explore")
    expect(out.duration_ms).toBe(99)
  })

  test("falls back to meta.agent_id and meta.agent_type when top-level missing", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      meta: { agent_id: "from-meta", agent_type: "librarian" },
    })
    expect(out.agent_id).toBe("from-meta")
    expect(out.agent_type).toBe("librarian")
  })

  test("picks up meta.subagentType when top-level agent_type is missing", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      meta: { subagentType: "momus" },
    })
    expect(out.agent_type).toBe("momus")
  })

  test("picks up meta.subagent_id when top-level agent_id is missing", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      meta: { subagent_id: "sub-42" },
    })
    expect(out.agent_id).toBe("sub-42")
  })

  test("camelCase meta.subagentId also works", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      meta: { subagentId: "sub-99" },
    })
    expect(out.agent_id).toBe("sub-99")
  })

  test("snake_case meta.subagent_type also works", () => {
    const out = ssePayloadFromEvent({
      ts: "2026-05-01T00:00:00Z",
      event: "/subagentStart",
      meta: { subagent_type: "oracle" },
    })
    expect(out.agent_type).toBe("oracle")
  })

  test("returns undefineds gracefully on empty input", () => {
    const out = ssePayloadFromEvent({})
    expect(out.agent_id).toBeUndefined()
    expect(out.agent_type).toBeUndefined()
    expect(out.description).toBeUndefined()
    expect(out.status).toBeUndefined()
    expect(out.duration_ms).toBeUndefined()
  })

  test("handles non-object input safely", () => {
    const out = ssePayloadFromEvent(null as unknown as Record<string, unknown>)
    expect(out.agent_id).toBeUndefined()
    expect(out.agent_type).toBeUndefined()
  })
})

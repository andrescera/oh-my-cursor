import { describe, test, expect } from "bun:test"
import { OhMyCursorConfigSchema, DEFAULT_CONFIG } from "./config"

describe("OhMyCursorConfigSchema", () => {
  test("valid full config passes safeParse", () => {
    const full = {
      version: 2,
      disabled_hooks: ["/stop"],
      disabled_agents: ["x"],
      subagent_limits: { explore: 4, worker: 6 },
      state_persistence: { enabled: false, path: "/tmp/custom.json" },
      daemon: { port: 1024, mcp_port: 1025 },
      context_collector: { enabled: true, max_context_chars: 10000 },
      compaction: { prompt_enabled: false, user_message_template: "hi" },
      experimental: { cloud_agents: true, webhooks: true, automations: false },
      mcp_allowlist: ["a", "b"],
      notifications: { enabled: false, sound: true },
      orchestration: { mode: "subagent" as const },
      continuation: { cooldown_ms: 1000, max_failures: 2, backoff_multiplier: 1.5 },
      momus: { max_iterations: 5 },
      model_routing: {
        retry_on_errors: [500],
        max_retry_attempts: 2,
        defaults: { explore: "slow", librarian: "slow", metis: "slow" },
      },
    }
    const r = OhMyCursorConfigSchema.safeParse(full)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.version).toBe(2)
      expect(r.data.daemon.port).toBe(1024)
      expect(r.data.orchestration.mode).toBe("subagent")
    }
  })

  test("empty object produces correct defaults via parse({})", () => {
    const parsed = OhMyCursorConfigSchema.parse({})
    expect(parsed).toEqual(DEFAULT_CONFIG)
  })

  test("invalid port above max fails with appropriate error", () => {
    const r = OhMyCursorConfigSchema.safeParse({ daemon: { port: 99999 } })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."))
      expect(paths.some((p) => p.includes("daemon") && p.includes("port"))).toBe(true)
    }
  })

  test("invalid port below 1024 fails", () => {
    const r = OhMyCursorConfigSchema.safeParse({ daemon: { port: 500 } })
    expect(r.success).toBe(false)
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."))
      expect(paths.some((p) => p.includes("port"))).toBe(true)
    }
  })

  test("invalid orchestration mode fails", () => {
    const r = OhMyCursorConfigSchema.safeParse({
      orchestration: { mode: "hybrid" },
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("mode"))).toBe(true)
    }
  })

  test("invalid context max_context_chars below min fails", () => {
    const r = OhMyCursorConfigSchema.safeParse({
      context_collector: { max_context_chars: 999 },
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(
        r.error.issues.some((i) => i.path.join(".").includes("max_context_chars")),
      ).toBe(true)
    }
  })

  test("unknown extra fields are stripped", () => {
    const r = OhMyCursorConfigSchema.safeParse({
      totallyUnknown: 1,
      nested: { x: true },
      version: 1,
    } as Record<string, unknown>)
    expect(r.success).toBe(true)
    if (r.success) {
      expect("totallyUnknown" in r.data).toBe(false)
      expect("nested" in r.data).toBe(false)
    }
  })

  test("partial config with only some sections parses correctly", () => {
    const r = OhMyCursorConfigSchema.safeParse({
      notifications: { sound: true },
      momus: { max_iterations: 7 },
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.notifications.sound).toBe(true)
      expect(r.data.momus.max_iterations).toBe(7)
      expect(r.data.orchestration.mode).toBe("native")
      expect(r.data.daemon.port).toBe(27847)
    }
  })

  test("context_collector todo_tracking_via_pretool defaults to false", () => {
    const parsed = OhMyCursorConfigSchema.parse({})
    expect(parsed.context_collector.todo_tracking_via_pretool).toBe(false)

    const enabled = OhMyCursorConfigSchema.parse({
      context_collector: { todo_tracking_via_pretool: true },
    })
    expect(enabled.context_collector.todo_tracking_via_pretool).toBe(true)
  })

  test("context_collector budget fields default correctly", () => {
    const parsed = OhMyCursorConfigSchema.parse({})
    expect(parsed.context_collector.max_entry_chars).toBe(8000)
    expect(parsed.context_collector.priority_budgets).toEqual({
      critical: 20000,
      high: 15000,
      normal: 10000,
      low: 5000,
    })
  })

  test("context_collector budget fields accept overrides", () => {
    const r = OhMyCursorConfigSchema.safeParse({
      context_collector: {
        max_entry_chars: 4000,
        priority_budgets: { critical: 30000, high: 12000, normal: 8000, low: 2000 },
      },
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.context_collector.max_entry_chars).toBe(4000)
      expect(r.data.context_collector.priority_budgets.critical).toBe(30000)
      expect(r.data.context_collector.priority_budgets.low).toBe(2000)
    }
  })

  test("context_collector max_entry_chars below min fails", () => {
    const r = OhMyCursorConfigSchema.safeParse({
      context_collector: { max_entry_chars: 50 },
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join(".").includes("max_entry_chars"))).toBe(true)
    }
  })

  test("parses safety continuation and MCP LLM review defaults and overrides", () => {
    const defaults = OhMyCursorConfigSchema.parse({})
    expect(defaults.safety.continuation.max_wallclock_ms).toBe(3_600_000)
    expect(defaults.safety.mcp_llm_review_enabled).toBe(true)

    const overridden = OhMyCursorConfigSchema.parse({
      safety: {
        continuation: {
          max_wallclock_ms: 120_000,
          max_consecutive_zero_deltas: 5,
        },
        mcp_llm_review_enabled: false,
      },
    })
    expect(overridden.safety.continuation.max_wallclock_ms).toBe(120_000)
    expect(overridden.safety.continuation.max_consecutive_zero_deltas).toBe(5)
    expect(overridden.safety.mcp_llm_review_enabled).toBe(false)
  })
})

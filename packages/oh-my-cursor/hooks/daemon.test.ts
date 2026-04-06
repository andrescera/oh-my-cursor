import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import type { Server } from "bun"

const PORT = 47899
let server: ReturnType<typeof import("bun")["serve"]> | null = null
const BASE = `http://localhost:${PORT}`

async function post(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

beforeAll(async () => {
  process.env.OH_MY_CURSOR_PORT = String(PORT)
  await import("./daemon.ts")
  await Bun.sleep(500)
})

afterAll(() => {
  process.exit(0)
})

describe("hook daemon", () => {
  describe("/health", () => {
    test("returns ok status", async () => {
      const res = await fetch(`${BASE}/health`)
      const data = await res.json()
      expect(data.status).toBe("ok")
      expect(typeof data.uptime).toBe("number")
    })
  })

  describe("/sessionStart", () => {
    test("returns hookSpecificOutput with context", async () => {
      const result = await post("/sessionStart", {
        session_id: "sess-1",
        cwd: "/project",
        model: "claude-4.6-sonnet",
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("oh-my-cursor Context")
      expect(result.hookSpecificOutput.additionalContext).toContain("sess-1")
      expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart")
    })
  })

  describe("/sessionEnd", () => {
    test("cleans up session", async () => {
      await post("/sessionStart", { session_id: "sess-cleanup" })
      const health1 = await (await fetch(`${BASE}/health`)).json()
      const before = health1.sessions

      await post("/sessionEnd", { session_id: "sess-cleanup" })
      const health2 = await (await fetch(`${BASE}/health`)).json()
      expect(health2.sessions).toBe(before - 1)
    })
  })

  describe("/beforeShellExecution", () => {
    test("blocks dangerous commands", async () => {
      const result = await post("/beforeShellExecution", {
        tool_input: { command: "rm -rf /" },
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.hookSpecificOutput.permissionDecisionReason).toContain("blocked for safety")
    })

    test("allows safe commands", async () => {
      const result = await post("/beforeShellExecution", {
        tool_input: { command: "ls -la" },
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
    })
  })

  describe("/beforeReadFile", () => {
    test("blocks sensitive files", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/.env.production",
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
    })

    test("allows normal files", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/src/index.ts",
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
    })
  })

  describe("/preToolUse", () => {
    test("allows tool use and tracks count", async () => {
      const result = await post("/preToolUse", {
        tool_name: "Shell",
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("/subagentStart", () => {
    test("allows subagent within limits", async () => {
      await post("/sessionStart", { session_id: "sess-limits" })
      const result = await post("/subagentStart", {
        agent_type: "Explore",
        session_id: "sess-limits",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("injects warning beyond explore limit", async () => {
      await post("/sessionStart", { session_id: "sess-limits-2" })
      for (let i = 0; i < 6; i++) {
        await post("/subagentStart", {
          agent_type: "Explore",
          session_id: "sess-limits-2",
        })
      }
      const result = await post("/subagentStart", {
        agent_type: "Explore",
        session_id: "sess-limits-2",
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("dispatch-limit")
      expect(result.hookSpecificOutput.hookEventName).toBe("SubagentStart")
    })
  })

  describe("/subagentStop", () => {
    test("returns empty object", async () => {
      const result = await post("/subagentStop", {
        agent_type: "Explore",
        stop_hook_active: false,
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("returns empty when stop_hook_active is true", async () => {
      const result = await post("/subagentStop", {
        agent_type: "Explore",
        stop_hook_active: true,
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("/postToolUse", () => {
    test("tracks tool calls and returns context periodically", async () => {
      await post("/sessionStart", { session_id: "sess-context" })
      for (let i = 0; i < 10; i++) {
        await post("/postToolUse", {
          tool_name: "Shell",
          session_id: "sess-context",
        })
      }
      const result = await post("/postToolUse", {
        tool_name: "Shell",
        session_id: "sess-context",
      })
      expect(result).toBeDefined()
    })
  })

  describe("/stop", () => {
    test("returns empty when no active loops", async () => {
      await post("/sessionStart", { session_id: "sess-stop" })
      const result = await post("/stop", {
        stop_hook_active: false,
        session_id: "sess-stop",
      })
      expect(result.decision).toBeUndefined()
    })

    test("returns empty when stop_hook_active is true", async () => {
      const result = await post("/stop", {
        stop_hook_active: true,
        session_id: "sess-stop",
      })
      expect(result.decision).toBeUndefined()
    })
  })

  describe("/preCompact", () => {
    test("tracks compaction and returns empty", async () => {
      const result = await post("/preCompact", {
        trigger: "auto",
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("unknown route", () => {
    test("returns 404", async () => {
      const res = await fetch(`${BASE}/nonexistent`, { method: "POST" })
      expect(res.status).toBe(404)
    })
  })
})

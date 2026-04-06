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
    test("returns additional_context and env", async () => {
      const result = await post("/sessionStart", {
        conversation_id: "sess-1",
        workspace_roots: ["/project"],
        model: "claude-4.6-sonnet",
      })
      expect(result.env.OH_MY_CURSOR_SESSION_ID).toBe("sess-1")
      expect(result.env.OH_MY_CURSOR_PROJECT_DIR).toBe("/project")
      expect(result.additional_context).toContain("oh-my-cursor Context")
      expect(result.additional_context).toContain("sess-1")
    })
  })

  describe("/sessionEnd", () => {
    test("cleans up session", async () => {
      await post("/sessionStart", { conversation_id: "sess-cleanup" })
      const health1 = await (await fetch(`${BASE}/health`)).json()
      const before = health1.sessions

      await post("/sessionEnd", { conversation_id: "sess-cleanup" })
      const health2 = await (await fetch(`${BASE}/health`)).json()
      expect(health2.sessions).toBe(before - 1)
    })
  })

  describe("/beforeShellExecution", () => {
    test("blocks dangerous commands", async () => {
      const result = await post("/beforeShellExecution", {
        command: "rm -rf /",
        conversation_id: "sess-1",
      })
      expect(result.permission).toBe("deny")
      expect(result.user_message).toContain("Dangerous")
    })

    test("allows safe commands", async () => {
      const result = await post("/beforeShellExecution", {
        command: "ls -la",
        conversation_id: "sess-1",
      })
      expect(result.permission).toBe("allow")
    })
  })

  describe("/beforeReadFile", () => {
    test("blocks sensitive files", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/.env.production",
        conversation_id: "sess-1",
      })
      expect(result.permission).toBe("deny")
    })

    test("allows normal files", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/src/index.ts",
        conversation_id: "sess-1",
      })
      expect(result.permission).toBe("allow")
    })
  })

  describe("/preToolUse", () => {
    test("allows tool use and tracks count", async () => {
      const result = await post("/preToolUse", {
        tool_name: "Shell",
        conversation_id: "sess-1",
      })
      expect(result.permission).toBe("allow")
    })
  })

  describe("/subagentStart", () => {
    test("allows subagent within limits", async () => {
      await post("/sessionStart", { conversation_id: "sess-limits" })
      const result = await post("/subagentStart", {
        subagent_type: "explore",
        task: "search codebase",
        conversation_id: "sess-limits",
      })
      expect(result.permission).toBe("allow")
    })

    test("denies explore beyond limit", async () => {
      await post("/sessionStart", { conversation_id: "sess-limits-2" })
      for (let i = 0; i < 6; i++) {
        await post("/subagentStart", {
          subagent_type: "explore",
          task: `search ${i}`,
          conversation_id: "sess-limits-2",
        })
      }
      const result = await post("/subagentStart", {
        subagent_type: "explore",
        task: "one too many",
        conversation_id: "sess-limits-2",
      })
      expect(result.permission).toBe("deny")
      expect(result.user_message).toContain("limit")
    })
  })

  describe("/subagentStop", () => {
    test("returns followup on error", async () => {
      const result = await post("/subagentStop", {
        status: "error",
        subagent_type: "explore",
        loop_count: 0,
      })
      expect(result.followup_message).toBeDefined()
      expect(result.followup_message).toContain("retry")
    })

    test("no followup on success", async () => {
      const result = await post("/subagentStop", {
        status: "completed",
        subagent_type: "explore",
      })
      expect(result.followup_message).toBeUndefined()
    })
  })

  describe("/postToolUse", () => {
    test("tracks tool calls and returns context periodically", async () => {
      await post("/sessionStart", { conversation_id: "sess-context" })
      for (let i = 0; i < 10; i++) {
        await post("/postToolUse", {
          tool_name: "Shell",
          conversation_id: "sess-context",
        })
      }
      const result = await post("/postToolUse", {
        tool_name: "Shell",
        conversation_id: "sess-context",
      })
      expect(result).toBeDefined()
    })
  })

  describe("/stop", () => {
    test("returns empty when no todos active", async () => {
      await post("/sessionStart", { conversation_id: "sess-stop" })
      const result = await post("/stop", {
        status: "completed",
        loop_count: 0,
        conversation_id: "sess-stop",
      })
      expect(result.followup_message).toBeUndefined()
    })

    test("returns retry on error with low loop count", async () => {
      const result = await post("/stop", {
        status: "error",
        loop_count: 1,
        conversation_id: "sess-stop",
      })
      expect(result.followup_message).toBeDefined()
      expect(result.followup_message).toContain("error")
    })
  })

  describe("/preCompact", () => {
    test("warns at high usage", async () => {
      const result = await post("/preCompact", {
        context_usage_percent: 95,
        conversation_id: "sess-1",
      })
      expect(result.user_message).toContain("95%")
    })

    test("no warning at low usage", async () => {
      const result = await post("/preCompact", {
        context_usage_percent: 50,
        conversation_id: "sess-1",
      })
      expect(result.user_message).toBeUndefined()
    })
  })

  describe("unknown route", () => {
    test("returns 404", async () => {
      const res = await fetch(`${BASE}/nonexistent`, { method: "POST" })
      expect(res.status).toBe(404)
    })
  })
})

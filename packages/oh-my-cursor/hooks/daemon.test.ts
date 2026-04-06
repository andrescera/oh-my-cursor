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
    test("returns hookSpecificOutput with context (Claude Code format)", async () => {
      const result = await post("/sessionStart", {
        session_id: "sess-1",
        cwd: "/project",
        model: "claude-4.6-sonnet",
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("oh-my-cursor Context")
      expect(result.hookSpecificOutput.additionalContext).toContain("sess-1")
      expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart")
      expect(result.additional_context).toContain("oh-my-cursor Context")
    })

    test("accepts Cursor-native conversation_id + workspace_roots", async () => {
      const result = await post("/sessionStart", {
        conversation_id: "conv-cursor-1",
        workspace_roots: ["/workspace/project"],
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("conv-cursor-1")
      expect(result.hookSpecificOutput.additionalContext).toContain("/workspace/project")
      expect(result.additional_context).toContain("conv-cursor-1")
      expect(result.additional_context).toContain("/workspace/project")
    })

    test("prefers conversation_id over session_id", async () => {
      const result = await post("/sessionStart", {
        conversation_id: "conv-preferred",
        session_id: "sess-fallback",
        cwd: "/project",
      })
      expect(result.hookSpecificOutput.additionalContext).toContain("conv-preferred")
      expect(result.hookSpecificOutput.additionalContext).not.toContain("sess-fallback")
    })
  })

  describe("/sessionEnd", () => {
    test("cleans up session (Claude Code format)", async () => {
      await post("/sessionStart", { session_id: "sess-cleanup" })
      const health1 = await (await fetch(`${BASE}/health`)).json()
      const before = health1.sessions

      await post("/sessionEnd", { session_id: "sess-cleanup" })
      const health2 = await (await fetch(`${BASE}/health`)).json()
      expect(health2.sessions).toBe(before - 1)
    })

    test("cleans up session with Cursor-native conversation_id + workspace_roots", async () => {
      await post("/sessionStart", { conversation_id: "conv-cleanup" })
      const health1 = await (await fetch(`${BASE}/health`)).json()
      const before = health1.sessions

      await post("/sessionEnd", { conversation_id: "conv-cleanup", workspace_roots: ["/project"] })
      const health2 = await (await fetch(`${BASE}/health`)).json()
      expect(health2.sessions).toBe(before - 1)
    })
  })

  describe("/beforeShellExecution", () => {
    test("blocks dangerous commands (Claude Code format)", async () => {
      const result = await post("/beforeShellExecution", {
        tool_input: { command: "rm -rf /" },
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.hookSpecificOutput.permissionDecisionReason).toContain("blocked for safety")
      expect(result.permission).toBe("deny")
      expect(result.continue).toBe(false)
      expect(result.userMessage).toContain("blocked for safety")
    })

    test("blocks dangerous commands (Cursor-native format with top-level command)", async () => {
      const result = await post("/beforeShellExecution", {
        command: "rm -rf /",
        conversation_id: "conv-shell-1",
        workspace_roots: ["/project"],
      })
      expect(result.permission).toBe("deny")
      expect(result.continue).toBe(false)
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
    })

    test("allows safe commands", async () => {
      const result = await post("/beforeShellExecution", {
        tool_input: { command: "ls -la" },
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
    })

    test("allows safe commands (Cursor-native format)", async () => {
      const result = await post("/beforeShellExecution", {
        command: "ls -la",
        conversation_id: "conv-shell-2",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.permission).toBeUndefined()
    })
  })

  describe("/beforeReadFile", () => {
    test("blocks sensitive files (top-level file_path)", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/.env.production",
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.permission).toBe("deny")
      expect(result.continue).toBe(false)
      expect(result.userMessage).toContain("blocked")
    })

    test("blocks sensitive files (tool_input.file_path)", async () => {
      const result = await post("/beforeReadFile", {
        tool_input: { file_path: "/app/credentials.json" },
        conversation_id: "conv-read-1",
      })
      expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
      expect(result.permission).toBe("deny")
    })

    test("allows normal files", async () => {
      const result = await post("/beforeReadFile", {
        file_path: "/app/src/index.ts",
        session_id: "sess-1",
      })
      expect(result.hookSpecificOutput).toBeUndefined()
      expect(result.permission).toBeUndefined()
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
    test("allows subagent within limits (agent_type)", async () => {
      await post("/sessionStart", { session_id: "sess-limits" })
      const result = await post("/subagentStart", {
        agent_type: "Explore",
        session_id: "sess-limits",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("allows subagent within limits (subagent_type / Cursor format)", async () => {
      await post("/sessionStart", { conversation_id: "conv-limits" })
      const result = await post("/subagentStart", {
        subagent_type: "Explore",
        conversation_id: "conv-limits",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("injects warning beyond explore limit with dual response", async () => {
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
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("dispatch-limit")
    })
  })

  describe("/subagentStop", () => {
    test("returns empty object (agent_type)", async () => {
      const result = await post("/subagentStop", {
        agent_type: "Explore",
        stop_hook_active: false,
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("returns empty object (subagent_type / Cursor format)", async () => {
      const result = await post("/subagentStop", {
        subagent_type: "Explore",
        status: "completed",
        conversation_id: "conv-stop-1",
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

    test("accepts loop_count and status fields", async () => {
      const result = await post("/subagentStop", {
        subagent_type: "general-purpose",
        status: "completed",
        loop_count: 3,
        conversation_id: "conv-stop-2",
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
    test("returns empty when no active loops (Claude Code format)", async () => {
      await post("/sessionStart", { session_id: "sess-stop" })
      const result = await post("/stop", {
        stop_hook_active: false,
        session_id: "sess-stop",
      })
      expect(result.decision).toBeUndefined()
      expect(result.followup_message).toBeUndefined()
    })

    test("returns empty when stop_hook_active is true", async () => {
      const result = await post("/stop", {
        stop_hook_active: true,
        session_id: "sess-stop",
      })
      expect(result.decision).toBeUndefined()
    })

    test("returns empty when Cursor-native status is 'completed'", async () => {
      await post("/sessionStart", { conversation_id: "conv-stop-cursor" })
      const result = await post("/stop", {
        status: "completed",
        conversation_id: "conv-stop-cursor",
      })
      expect(result.decision).toBeUndefined()
      expect(result.followup_message).toBeUndefined()
    })

    test("returns empty when Cursor-native status is 'aborted'", async () => {
      await post("/sessionStart", { conversation_id: "conv-stop-aborted" })
      const result = await post("/stop", {
        status: "aborted",
        conversation_id: "conv-stop-aborted",
      })
      expect(result.decision).toBeUndefined()
      expect(result.followup_message).toBeUndefined()
    })

    test("returns empty when Cursor-native status is 'error'", async () => {
      await post("/sessionStart", { conversation_id: "conv-stop-error" })
      const result = await post("/stop", {
        status: "error",
        conversation_id: "conv-stop-error",
      })
      expect(result.decision).toBeUndefined()
    })
  })

  describe("/preCompact", () => {
    test("tracks compaction and returns empty (Claude Code format)", async () => {
      const result = await post("/preCompact", {
        trigger: "auto",
        session_id: "sess-1",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("tracks compaction with Cursor-native conversation_id", async () => {
      await post("/sessionStart", { conversation_id: "conv-compact" })
      const result = await post("/preCompact", {
        trigger: "auto",
        conversation_id: "conv-compact",
      })
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("/beforeSubmitPrompt", () => {
    test("returns empty for normal messages (prompt field)", async () => {
      await post("/sessionStart", { session_id: "sess-prompt" })
      const result = await post("/beforeSubmitPrompt", {
        prompt: "Hello world",
        session_id: "sess-prompt",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("accepts user_message field (Cursor-native)", async () => {
      await post("/sessionStart", { conversation_id: "conv-prompt" })
      const result = await post("/beforeSubmitPrompt", {
        user_message: "Hello world",
        conversation_id: "conv-prompt",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    test("detects ultrawork keyword with dual response", async () => {
      await post("/sessionStart", { conversation_id: "conv-prompt-ultra" })
      const result = await post("/beforeSubmitPrompt", {
        user_message: "ultrawork on this feature",
        conversation_id: "conv-prompt-ultra",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("ultrawork")
      expect(result.hookSpecificOutput.additionalContext).toContain("ultrawork")
      expect(result.hookSpecificOutput.hookEventName).toBe("UserPromptSubmit")
    })

    test("detects ralph-loop via prompt field", async () => {
      await post("/sessionStart", { session_id: "sess-prompt-ralph" })
      const result = await post("/beforeSubmitPrompt", {
        prompt: "/ralph-loop --max-iterations 5",
        session_id: "sess-prompt-ralph",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("ralph-loop")
      expect(result.hookSpecificOutput.additionalContext).toContain("ralph-loop")
    })
  })

  describe("unknown route", () => {
    test("returns 404", async () => {
      const res = await fetch(`${BASE}/nonexistent`, { method: "POST" })
      expect(res.status).toBe(404)
    })
  })
})

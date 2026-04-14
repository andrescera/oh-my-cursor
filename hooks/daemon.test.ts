import { describe, test, expect, beforeAll, afterAll } from "bun:test"
import { mkdirSync, writeFileSync, unlinkSync, rmdirSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { Server } from "bun"

const PORT = 47899
let server: ReturnType<typeof import("bun")["serve"]> | null = null
const BASE = `http://localhost:${PORT}`

const AGENTS_TEST_DIR = join(tmpdir(), "oh-my-cursor-test-agents")
const AGENTS_TEST_FILE = join(AGENTS_TEST_DIR, "dummy.txt")
const AGENTS_MD_PATH = join(AGENTS_TEST_DIR, "AGENTS.md")

async function post(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  return res.json()
}

beforeAll(async () => {
  mkdirSync(AGENTS_TEST_DIR, { recursive: true })
  writeFileSync(AGENTS_TEST_FILE, "test file", "utf-8")
  writeFileSync(AGENTS_MD_PATH, "# Test AGENTS\nThis directory has test rules.", "utf-8")

  process.env.OH_MY_CURSOR_PORT = String(PORT)
  await import("./daemon.ts")
  await Bun.sleep(500)
})

afterAll(() => {
  try { unlinkSync(AGENTS_TEST_FILE) } catch {}
  try { unlinkSync(AGENTS_MD_PATH) } catch {}
  try { rmdirSync(AGENTS_TEST_DIR) } catch {}
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
        model: "claude-4.6-sonnet-medium",
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

    test("returns empty (limits enforced in preToolUse)", async () => {
      await post("/sessionStart", { session_id: "sess-limits-2" })
      const result = await post("/subagentStart", {
        agent_type: "Explore",
        session_id: "sess-limits-2",
      })
      expect(Object.keys(result).length).toBe(0)
    })

    describe("#given explore dispatch limit", () => {
      test("#then preToolUse(Task) denies beyond limit", async () => {
        await post("/sessionStart", { session_id: "sess-explore-limit" })
        for (let i = 0; i < 6; i++) {
          await post("/preToolUse", {
            tool_name: "Task",
            tool_input: { subagent_type: "explore" },
            session_id: "sess-explore-limit",
          })
        }
        const result = await post("/preToolUse", {
          tool_name: "Task",
          tool_input: { subagent_type: "explore" },
          session_id: "sess-explore-limit",
        })
        expect(result.permission).toBe("deny")
        expect(result.hookSpecificOutput.permissionDecision).toBe("deny")
        expect(result.hookSpecificOutput.permissionDecisionReason).toContain("dispatch-limit")
      })
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
        output: "a".repeat(50),
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
        output: "a".repeat(50),
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

    describe("#given a Read tool for a file in a directory with AGENTS.md", () => {
      describe("#when the handler is called", () => {
        test("#then it injects AGENTS.md content as directory context", async () => {
          await post("/sessionStart", { session_id: "sess-agents-inject" })
          const result = await post("/postToolUse", {
            tool_name: "Read",
            tool_input: { file_path: AGENTS_TEST_FILE },
            session_id: "sess-agents-inject",
          })
          expect(result.additional_context).toContain("[directory-context]")
          expect(result.additional_context).toContain("AGENTS.md")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUse")
        })
      })
    })

    describe("#given AGENTS.md was already injected for a directory", () => {
      describe("#when reading another file in the same directory", () => {
        test("#then it does not re-inject AGENTS.md", async () => {
          await post("/sessionStart", { session_id: "sess-agents-dedup" })
          await post("/postToolUse", {
            tool_name: "Read",
            tool_input: { file_path: AGENTS_TEST_FILE },
            session_id: "sess-agents-dedup",
          })
          const result = await post("/postToolUse", {
            tool_name: "Read",
            tool_input: { file_path: AGENTS_TEST_FILE },
            session_id: "sess-agents-dedup",
          })
          const ctx = result.additional_context || ""
          expect(ctx).not.toContain("[directory-context]")
        })
      })
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

    describe("#given an active ralph loop with max iterations", () => {
      describe("#when stop is called", () => {
        test("#then it blocks and returns continuation message with iteration count", async () => {
          await post("/sessionStart", { session_id: "sess-ralph-stop" })
          await post("/beforeSubmitPrompt", {
            prompt: "/ralph-loop --max-iterations 5",
            session_id: "sess-ralph-stop",
          })
          const result = await post("/stop", {
            session_id: "sess-ralph-stop",
          })
          expect(result.decision).toBe("block")
          expect(result.followup_message).toContain("Continue working")
          expect(result.followup_message).toContain("1/5")
        })
      })
    })

    describe("#given context history contains TodoWrite entries", () => {
      describe("#when stop is called with no active ralph loop", () => {
        test("#then it blocks and requests todo completion via boulder state", async () => {
          await post("/sessionStart", { session_id: "sess-boulder-stop" })
          await post("/postToolUse", {
            tool_name: "TodoWrite",
            session_id: "sess-boulder-stop",
          })
          const result = await post("/stop", {
            session_id: "sess-boulder-stop",
          })
          expect(result.decision).toBe("block")
          expect(result.followup_message).toContain("incomplete todos")
        })
      })
    })
  })

  describe("/preCompact", () => {
    test("tracks compaction and returns compaction context (Claude Code format)", async () => {
      const result = await post("/preCompact", {
        trigger: "auto",
        session_id: "sess-1",
      })
      expect(result.user_message).toBeDefined()
      expect(String(result.user_message).length).toBeGreaterThan(0)
      expect(result.hookSpecificOutput?.hookEventName).toBe("PreCompact")
    })

    test("tracks compaction with Cursor-native conversation_id", async () => {
      await post("/sessionStart", { conversation_id: "conv-compact" })
      const result = await post("/preCompact", {
        trigger: "auto",
        conversation_id: "conv-compact",
      })
      expect(result.user_message).toBeDefined()
      expect(String(result.user_message).length).toBeGreaterThan(0)
      expect(result.hookSpecificOutput?.hookEventName).toBe("PreCompact")
    })

    test("injects preserved todo states, active plan, and composer mode into compaction context", async () => {
      const sid = "sess-precompact-todo-preserve"
      await post("/sessionStart", { session_id: sid })
      await post("/beforeSubmitPrompt", {
        session_id: sid,
        prompt: "/plan outline work",
      })
      await post("/postToolUse", {
        session_id: sid,
        tool_name: "TodoWrite",
        tool_input: {
          merge: false,
          todos: [
            { id: "plan-phase1", content: "phase", status: "in_progress" },
            { id: "task-1", content: "do thing", status: "pending" },
          ],
        },
      })
      const result = await post("/preCompact", { trigger: "auto", session_id: sid })
      const msg = String(result.user_message)
      expect(msg).toContain("[todo-preservation] Preserved todo states from before compaction:")
      expect(msg).toContain("- plan-phase1: in_progress")
      expect(msg).toContain("- task-1: pending")
      expect(msg).toContain("[active-plan]")
      expect(msg).toContain("plan-phase1")
      expect(msg).toContain("[composer-mode] plan")
    })
  })

  describe("/beforeSubmitPrompt", () => {
    test("injects persona constraints for normal messages (prompt field)", async () => {
      await post("/sessionStart", { session_id: "sess-prompt" })
      const result = await post("/beforeSubmitPrompt", {
        prompt: "Hello world",
        session_id: "sess-prompt",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("Prometheus")
      expect(result.additional_context).toContain("FORBIDDEN")
    })

    test("injects persona constraints via user_message field (Cursor-native)", async () => {
      await post("/sessionStart", { conversation_id: "conv-prompt" })
      const result = await post("/beforeSubmitPrompt", {
        user_message: "Hello world",
        conversation_id: "conv-prompt",
      })
      expect(result.continue).toBe(true)
      expect(result.additional_context).toContain("Prometheus")
      expect(result.additional_context).toContain("FORBIDDEN")
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

  describe("/postToolUseFailure", () => {
    describe("#given a rate limit error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns rate limit recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Shell",
            error: "429 Too Many Requests",
            session_id: "sess-fail-rate",
          })
          expect(result.additional_context).toContain("session-recovery")
          expect(result.additional_context).toContain("Rate limit")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a timeout error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns timeout recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Task",
            error: "Request timed out after 30s",
            session_id: "sess-fail-timeout",
          })
          expect(result.additional_context).toContain("session-recovery")
          expect(result.additional_context).toContain("timed out")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a permission denied error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns permission recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Write",
            error: "Permission denied: /etc/passwd",
            session_id: "sess-fail-perm",
          })
          expect(result.additional_context).toContain("session-recovery")
          expect(result.additional_context).toContain("Permission denied")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a not found error", () => {
      describe("#when the handler is called", () => {
        test("#then it returns not found recovery guidance", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Read",
            error: "No such file or directory",
            session_id: "sess-fail-notfound",
          })
          expect(result.additional_context).toContain("session-recovery")
          expect(result.additional_context).toContain("not found")
          expect(result.hookSpecificOutput.hookEventName).toBe("PostToolUseFailure")
        })
      })
    })

    describe("#given a generic error with no matching pattern", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/postToolUseFailure", {
            tool_name: "Shell",
            error: "Something unexpected happened",
            session_id: "sess-fail-generic",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterShellExecution", () => {
    describe("#given any shell execution completes", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterShellExecution", {
            tool_name: "Shell",
            output: "command output",
            session_id: "sess-after-shell",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/beforeMCPExecution", () => {
    describe("#given an MCP tool is about to execute", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/beforeMCPExecution", {
            mcp_name: "websearch",
            session_id: "sess-before-mcp",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterMCPExecution", () => {
    describe("#given an MCP tool completes execution", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterMCPExecution", {
            mcp_name: "websearch",
            output: "search results",
            session_id: "sess-after-mcp",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterFileEdit", () => {
    describe("#given a file edit completes", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterFileEdit", {
            file_path: "/project/src/file.ts",
            session_id: "sess-after-edit",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterAgentResponse", () => {
    describe("#given an agent produces a response", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterAgentResponse", {
            response: "Agent response text",
            session_id: "sess-after-agent",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("/afterAgentThought", () => {
    describe("#given a short thinking duration under 30s", () => {
      describe("#when the handler is called", () => {
        test("#then it returns empty object", async () => {
          const result = await post("/afterAgentThought", {
            duration_ms: 5000,
            session_id: "sess-thought-short",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })

    describe("#given a long thinking duration exceeding 30s", () => {
      describe("#when the handler is called", () => {
        test("#then it still returns empty object", async () => {
          const result = await post("/afterAgentThought", {
            duration_ms: 45000,
            session_id: "sess-thought-long",
          })
          expect(Object.keys(result).length).toBe(0)
        })
      })
    })
  })

  describe("unknown route", () => {
    test("returns 404", async () => {
      const res = await fetch(`${BASE}/nonexistent`, { method: "POST" })
      expect(res.status).toBe(404)
    })
  })
})

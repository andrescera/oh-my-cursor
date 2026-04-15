import { describe, test, expect } from "bun:test"
import { classifyAction, extractMeta } from "./shared"

describe("classifyAction", () => {
  test("returns 'error' for /postToolUseFailure", () => {
    expect(classifyAction("/postToolUseFailure", {})).toBe("error")
  })

  test("returns permission value when result.permission is set", () => {
    expect(classifyAction("/preToolUse", { permission: "allow" })).toBe("allow")
    expect(classifyAction("/preToolUse", { permission: "deny" })).toBe("deny")
  })

  test("returns 'continue' when followup_message is present", () => {
    expect(classifyAction("/stop", { followup_message: "keep going", decision: "block" })).toBe("continue")
  })

  test("returns 'block' when decision is block (without followup_message)", () => {
    expect(classifyAction("/beforeMCPExecution", { decision: "block", reason: "not allowed" })).toBe("block")
  })

  test("returns 'output_modified' when modified_output is present", () => {
    expect(classifyAction("/postToolUse", { modified_output: "truncated..." })).toBe("output_modified")
  })

  test("returns 'context_injected' when user_message is present", () => {
    expect(classifyAction("/preCompact", { user_message: "context data" })).toBe("context_injected")
  })

  test("returns 'context_injected' when additional_context is present", () => {
    expect(classifyAction("/postToolUse", { additional_context: "some context" })).toBe("context_injected")
  })

  test("returns 'noop' when no action indicators present", () => {
    expect(classifyAction("/afterMCPExecution", {})).toBe("noop")
  })

  test("returns 'noop' for empty user_message", () => {
    expect(classifyAction("/preCompact", { user_message: "" })).toBe("noop")
  })

  test("followup_message takes priority over decision=block", () => {
    const result = { followup_message: "continue plan", decision: "block", reason: "plan active" }
    expect(classifyAction("/stop", result)).toBe("continue")
  })

  test("permission takes priority over everything else", () => {
    const result = { permission: "deny", followup_message: "x", decision: "block", user_message: "y" }
    expect(classifyAction("/preToolUse", result)).toBe("deny")
  })
})

describe("extractMeta", () => {
  test("extracts file from toolInput.file_path", () => {
    const meta = extractMeta("/postToolUse", {}, { file_path: "/src/foo.ts" }, {})
    expect(meta?.file).toBe("/src/foo.ts")
  })

  test("falls back to input.path when file_path is absent", () => {
    const meta = extractMeta("/postToolUse", { path: "/src/bar.ts" }, {}, {})
    expect(meta?.file).toBe("/src/bar.ts")
  })

  test("prefers toolInput.file_path over input.path", () => {
    const meta = extractMeta("/postToolUse", { path: "/input" }, { file_path: "/toolInput" }, {})
    expect(meta?.file).toBe("/toolInput")
  })

  test("extracts command for /beforeShellExecution", () => {
    const meta = extractMeta("/beforeShellExecution", { command: "ls -la" }, {}, {})
    expect(meta?.command).toBe("ls -la")
  })

  test("truncates command to 200 chars", () => {
    const longCmd = "x".repeat(300)
    const meta = extractMeta("/beforeShellExecution", { command: longCmd }, {}, {})
    expect((meta?.command as string).length).toBe(200)
  })

  test("extracts description for /preToolUse Task", () => {
    const meta = extractMeta("/preToolUse", { tool_name: "Task" }, { description: "do something" }, {})
    expect(meta?.description).toBe("do something")
  })

  test("extracts project for /sessionStart", () => {
    const meta = extractMeta("/sessionStart", { workspace_roots: ["/home/user/project"] }, {}, {})
    expect(meta?.project).toBe("/home/user/project")
  })

  test("extracts status for /stop", () => {
    const meta = extractMeta("/stop", { status: "completed" }, {}, {})
    expect(meta?.status).toBe("completed")
  })

  test("extracts userMessageSize for /preCompact", () => {
    const meta = extractMeta("/preCompact", {}, {}, { user_message: "hello world" })
    expect(meta?.userMessageSize).toBe(11)
  })

  test("extracts exitCode for /afterShellExecution", () => {
    const meta = extractMeta("/afterShellExecution", { exit_code: 1 }, {}, {})
    expect(meta?.exitCode).toBe(1)
  })

  test("extracts mcpServer for /beforeMCPExecution", () => {
    const meta = extractMeta("/beforeMCPExecution", { server_name: "my-server" }, {}, {})
    expect(meta?.mcpServer).toBe("my-server")
  })

  test("extracts promptLength for /beforeSubmitPrompt", () => {
    const meta = extractMeta("/beforeSubmitPrompt", { prompt: "hello world" }, {}, {})
    expect(meta?.promptLength).toBe(11)
  })

  test("extracts subagentType and description for /subagentStart", () => {
    const meta = extractMeta("/subagentStart", { subagent_type: "explore", task: "find patterns" }, {}, {})
    expect(meta?.subagentType).toBe("explore")
    expect(meta?.description).toBe("find patterns")
  })

  test("extracts subagentStatus for /subagentStop", () => {
    const meta = extractMeta("/subagentStop", { status: "completed", message_count: 5, tool_call_count: 3 }, {}, {})
    expect(meta?.subagentStatus).toBe("completed")
    expect(meta?.messageCount).toBe(5)
    expect(meta?.toolCallCount).toBe(3)
  })

  test("captures reason for permission=deny", () => {
    const meta = extractMeta("/preToolUse", {}, {}, { permission: "deny", userMessage: "not allowed" })
    expect(meta?.reason).toBe("not allowed")
  })

  test("captures reason for decision=block", () => {
    const meta = extractMeta("/beforeMCPExecution", {}, {}, { decision: "block", reason: "blocked by policy" })
    expect(meta?.reason).toBe("blocked by policy")
  })

  test("returns undefined when no meta to extract", () => {
    const meta = extractMeta("/postToolUse", {}, {}, {})
    expect(meta).toBeUndefined()
  })
})

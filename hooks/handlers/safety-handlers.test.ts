import { describe, test, expect } from "bun:test"
import { createSafetyHandlers } from "./safety-handlers"

describe("safety-handlers response-shape alignment (Cursor contract)", () => {
  const handlers = createSafetyHandlers()

  describe("/beforeShellExecution deny shape", () => {
    test("emits Cursor decision/user_message/agent_message and retains permission metric fields", () => {
      const result = handlers["/beforeShellExecution"]!({ command: "rm -rf /" }) as Record<string, unknown>

      expect(result.decision).toBe("deny")
      expect(typeof result.user_message).toBe("string")
      expect(String(result.user_message)).toContain("blocked for safety")
      expect(typeof result.agent_message).toBe("string")
      expect(String(result.agent_message)).toContain("safer alternative")

      expect(result.permission).toBe("deny")
      expect(String(result.userMessage)).toContain("blocked for safety")
      const hookSpecific = result.hookSpecificOutput as Record<string, unknown>
      expect(hookSpecific.permissionDecision).toBe("deny")
    })

    test("does not block safe commands", () => {
      const result = handlers["/beforeShellExecution"]!({ command: "ls -la" }) as Record<string, unknown>
      expect(Object.keys(result).length).toBe(0)
    })
  })

  describe("/beforeReadFile deny shape", () => {
    test("emits Cursor decision/user_message/agent_message for sensitive files", () => {
      const result = handlers["/beforeReadFile"]!({ file_path: "/app/.env.production" }) as Record<string, unknown>

      expect(result.decision).toBe("deny")
      expect(String(result.user_message)).toContain("sensitive file")
      expect(String(result.agent_message)).toContain("sensitive file")

      expect(result.permission).toBe("deny")
      const hookSpecific = result.hookSpecificOutput as Record<string, unknown>
      expect(hookSpecific.permissionDecision).toBe("deny")
    })

    test("does not block normal files", () => {
      const result = handlers["/beforeReadFile"]!({ file_path: "/app/src/index.ts" }) as Record<string, unknown>
      expect(Object.keys(result).length).toBe(0)
    })
  })
})

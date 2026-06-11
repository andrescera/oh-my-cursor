import { describe, test, expect } from "bun:test"
import { createSafetyHandlers } from "./safety-handlers"
import { onEvent, offEvent } from "../event-logger"
import type { EventEntry } from "../event-logger"

// Synchronously spy on logEvent via the event-logger listener bus (no mocking,
// no live file IO). logEvent invokes listeners inline, so entries are captured
// before fn() returns. Listener is always detached, even on assertion failure.
function captureEvents(fn: () => void): EventEntry[] {
  const captured: EventEntry[] = []
  const listener = (entry: EventEntry) => captured.push(entry)
  onEvent(listener)
  try {
    fn()
  } finally {
    offEvent(listener)
  }
  return captured
}

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

describe("safety-handlers blocked log events (Task 15)", () => {
  const handlers = createSafetyHandlers()

  test("dangerous shell command emits a blocked event with reason", () => {
    const events = captureEvents(() => {
      handlers["/beforeShellExecution"]!({ command: "rm -rf /", conversation_id: "safety-shell-log" })
    })

    const blocked = events.find((e) => e.event === "/beforeShellExecution" && e.action === "blocked")
    expect(blocked).toBeDefined()
    expect(blocked!.sessionId).toBe("safety-shell-log")
    expect(blocked!.meta?.reason).toBe("dangerous_command")
  })

  test("sensitive file read emits a blocked event with reason", () => {
    const events = captureEvents(() => {
      handlers["/beforeReadFile"]!({ file_path: "/app/.env.local", conversation_id: "safety-read-log" })
    })

    const blocked = events.find((e) => e.event === "/beforeReadFile" && e.action === "blocked")
    expect(blocked).toBeDefined()
    expect(blocked!.sessionId).toBe("safety-read-log")
    expect(blocked!.meta?.reason).toBe("sensitive_file")
  })

  test("benign shell command emits no blocked event", () => {
    const events = captureEvents(() => {
      handlers["/beforeShellExecution"]!({ command: "ls -la", conversation_id: "safety-benign-log" })
    })
    expect(events.some((e) => e.action === "blocked")).toBe(false)
  })
})

describe("safety-handlers benign commands are allowed", () => {
  const handlers = createSafetyHandlers()

  for (const command of ["ls -la", "git status", "echo hello", "npm run build", "cat package.json"]) {
    test(`allows: ${command}`, () => {
      const result = handlers["/beforeShellExecution"]!({ command }) as Record<string, unknown>
      expect(Object.keys(result).length).toBe(0)
    })
  }
})

describe("safety-handlers documented bypasses are intentionally NOT blocked (locks current behavior)", () => {
  const handlers = createSafetyHandlers()

  for (const command of [
    "rm -r -f /",
    "RM -RF /",
    "rm -rf ./build",
    "dd of=/dev/sdb if=/dev/zero",
  ]) {
    test(`does not block: ${command}`, () => {
      const result = handlers["/beforeShellExecution"]!({ command }) as Record<string, unknown>
      expect(Object.keys(result).length).toBe(0)
    })
  }
})

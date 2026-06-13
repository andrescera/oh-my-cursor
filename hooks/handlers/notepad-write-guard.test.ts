import { describe, it, expect, beforeEach } from "bun:test"
import { contextCollector } from "../context-collector"
import { createNotepadWriteGuardHandler } from "./notepad-write-guard"

describe("notepad-write-guard", () => {
  const conversations = new Map()

  beforeEach(() => {
    contextCollector.clearAll()
  })

  it("should deny Write to existing notepad path", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: (path: string) => path.includes(".cursor/notepads/"),
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: ".cursor/notepads/test-plan/learnings.md",
      },
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toBeDefined()
    expect(result?.permission).toBe("deny")
    expect(result?.userMessage).toContain("notepad")
  })

  it("should not deny Write to non-existent notepad path", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: () => false,
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: ".cursor/notepads/test-plan/learnings.md",
      },
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toEqual({})
  })

  it("should not deny Edit tool", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: (path: string) => path.includes(".cursor/notepads/"),
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Edit",
      tool_input: {
        file_path: ".cursor/notepads/test-plan/learnings.md",
      },
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toEqual({})
  })

  it("should not deny Write to non-notepad paths", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: () => true,
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: "/home/user/project/src/index.ts",
      },
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toEqual({})
  })

  it("should register CRITICAL advisory in contextCollector", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: (path: string) => path.includes(".cursor/notepads/"),
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: ".cursor/notepads/test-plan/learnings.md",
      },
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    // Verify that deny was returned (which means context was registered)
    expect(result?.permission).toBe("deny")
    expect(result?.userMessage).toContain("notepad-write-guard")
  })

  it("should handle missing file_path gracefully", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: () => true,
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Write",
      tool_input: {},
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toEqual({})
  })

  it("should handle missing tool_input gracefully", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: () => true,
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: true } } }),
    })

    const input = {
      tool_name: "Write",
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toEqual({})
  })

  it("should not deny when handler is disabled in config", () => {
    const handler = createNotepadWriteGuardHandler(conversations, {
      existsSync: (path: string) => path.includes(".cursor/notepads/"),
      getConfig: () => ({ handlers: { notepad_write_guard: { enabled: false } } }),
    })

    const input = {
      tool_name: "Write",
      tool_input: {
        file_path: ".cursor/notepads/test-plan/learnings.md",
      },
      conversation_id: "conv-1",
      project_root: "/home/user/project",
    }

    const result = handler["/preToolUse"]?.(input)

    expect(result).toEqual({})
  })
})

import { describe, expect, test } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createCommentChecker } from "./comment-checker"

type RegisterCall = { conversationId: string; options: RegisterContextOptions }

function fakeCollector() {
  const calls: RegisterCall[] = []
  return {
    calls,
    register(conversationId: string, options: RegisterContextOptions) {
      calls.push({ conversationId, options })
    },
  }
}

describe("comment-checker", () => {
  describe("#given createCommentChecker", () => {
    test("returns a handler function", () => {
      const handler = createCommentChecker()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#given a write tool with slop comments", () => {
    describe("#when output contains narration comments", () => {
      test.each([
        ["// Import the module", "Import"],
        ["// Define the function", "Define"],
        ["// Return the result", "Return"],
        ["// Handle the error", "Handle"],
        ["// Set up the server", "Set up"],
        ["// Create the instance", "Create"],
        ["// Initialize the state", "Initialize"],
        ["// Get the value", "Get"],
        ["// Check if valid", "Check"],
        ["// Update the record", "Update"],
      ])("#then registers a normal finding for '%s' (%s pattern) with NO additional_context", (line) => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const result = handler({ tool_name: "Write", output: line, conversationId: "c1" })
        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].options.priority).toBe("normal")
        expect(collector.calls[0].options.source).toBe("comment-checker")
        expect(collector.calls[0].options.content).toContain("Narration comments detected")
        expect(collector.calls[0].conversationId).toBe("c1")
      })

      test("#then detects slop in multi-line output", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const output = `const x = 1\n// Import the module\nimport foo from "bar"`
        handler({ tool_name: "StrReplace", output, conversationId: "c1" })
        expect(collector.calls).toHaveLength(1)
      })

      test("#then detects indented slop comments", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        handler({ tool_name: "EditNotebook", output: "  // Define the handler", conversationId: "c1" })
        expect(collector.calls).toHaveLength(1)
      })
    })
  })

  describe("#given a write tool with clean output", () => {
    describe("#when output has no slop", () => {
      test("#then returns empty and does not register for normal comments", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const result = handler({
          tool_name: "Write",
          output: "// This workaround avoids a race condition in the event loop",
          conversationId: "c1",
        })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })

      test("#then returns empty for code without comments", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const result = handler({
          tool_name: "Write",
          output: "const x = 1\nconst y = 2",
          conversationId: "c1",
        })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })

      test("#then returns empty for empty output", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const result = handler({ tool_name: "Write", output: "", conversationId: "c1" })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })
    })
  })

  describe("#given a non-write tool", () => {
    describe("#when tool is read-only", () => {
      test("#then skips checking for Read tool", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const result = handler({ tool_name: "Read", output: "// Import everything", conversationId: "c1" })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })

      test("#then skips checking for Grep tool", () => {
        const collector = fakeCollector()
        const handler = createCommentChecker({ collector })
        const result = handler({ tool_name: "Grep", output: "// Define something", conversationId: "c1" })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })
    })
  })

  describe("#given all recognized write tools", () => {
    test.each([
      "Write",
      "StrReplace",
      "EditNotebook",
      "write_to_file",
      "edit_file",
    ])("#then registers a finding for tool '%s'", (toolName) => {
      const collector = fakeCollector()
      const handler = createCommentChecker({ collector })
      handler({ tool_name: toolName, output: "// Import the thing", conversationId: "c1" })
      expect(collector.calls).toHaveLength(1)
    })
  })

  describe("#given missing input fields", () => {
    test("#then returns empty when tool_name is missing", () => {
      const collector = fakeCollector()
      const handler = createCommentChecker({ collector })
      const result = handler({ output: "// Import something", conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    test("#then returns empty when output is missing", () => {
      const collector = fakeCollector()
      const handler = createCommentChecker({ collector })
      const result = handler({ tool_name: "Write", conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })
})

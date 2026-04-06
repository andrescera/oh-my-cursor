import { describe, expect, test } from "bun:test"
import { createCommentChecker } from "./comment-checker"

describe("comment-checker", () => {
  describe("#given createCommentChecker", () => {
    test("returns a handler function", () => {
      const handler = createCommentChecker()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#given a write tool with slop comments", () => {
    const handler = createCommentChecker()

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
      ])("#then detects '%s' (%s pattern)", (line) => {
        const result = handler({ tool_name: "Write", output: line })
        expect(result.additional_context).toContain("Narration comments detected")
      })

      test("#then detects slop in multi-line output", () => {
        const output = `const x = 1\n// Import the module\nimport foo from "bar"`
        const result = handler({ tool_name: "StrReplace", output })
        expect(result.additional_context).toBeDefined()
      })

      test("#then detects indented slop comments", () => {
        const result = handler({ tool_name: "EditNotebook", output: "  // Define the handler" })
        expect(result.additional_context).toBeDefined()
      })
    })
  })

  describe("#given a write tool with clean output", () => {
    const handler = createCommentChecker()

    describe("#when output has no slop", () => {
      test("#then returns empty for normal comments", () => {
        const result = handler({
          tool_name: "Write",
          output: "// This workaround avoids a race condition in the event loop",
        })
        expect(result).toEqual({})
      })

      test("#then returns empty for code without comments", () => {
        const result = handler({
          tool_name: "Write",
          output: "const x = 1\nconst y = 2",
        })
        expect(result).toEqual({})
      })

      test("#then returns empty for empty output", () => {
        const result = handler({ tool_name: "Write", output: "" })
        expect(result).toEqual({})
      })
    })
  })

  describe("#given a non-write tool", () => {
    const handler = createCommentChecker()

    describe("#when tool is read-only", () => {
      test("#then skips checking for Read tool", () => {
        const result = handler({ tool_name: "Read", output: "// Import everything" })
        expect(result).toEqual({})
      })

      test("#then skips checking for Grep tool", () => {
        const result = handler({ tool_name: "Grep", output: "// Define something" })
        expect(result).toEqual({})
      })
    })
  })

  describe("#given all recognized write tools", () => {
    const handler = createCommentChecker()

    test.each([
      "Write",
      "StrReplace",
      "EditNotebook",
      "write_to_file",
      "edit_file",
    ])("#then checks output for tool '%s'", (toolName) => {
      const result = handler({ tool_name: toolName, output: "// Import the thing" })
      expect(result.additional_context).toBeDefined()
    })
  })

  describe("#given missing input fields", () => {
    const handler = createCommentChecker()

    test("#then returns empty when tool_name is missing", () => {
      const result = handler({ output: "// Import something" })
      expect(result).toEqual({})
    })

    test("#then returns empty when output is missing", () => {
      const result = handler({ tool_name: "Write" })
      expect(result).toEqual({})
    })
  })
})

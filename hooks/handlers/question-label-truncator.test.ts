import { describe, it, expect, beforeEach } from "bun:test"
import { taskInputComposer } from "./task-input-composer"
import { createQuestionLabelTruncatorHandler, createQuestionLabelTruncatorProvider } from "./question-label-truncator"
import { resetHookConfigCache } from "../hook-config"

type TestInput = Record<string, unknown>
type TestResult = Record<string, unknown>

describe("question-label-truncator", () => {
  beforeEach(() => {
    taskInputComposer.reset()
  })

  describe("beforeMCPExecution handler (sub-rule a)", () => {
    let handler: ReturnType<typeof createQuestionLabelTruncatorHandler>

    beforeEach(() => {
      handler = createQuestionLabelTruncatorHandler()
    })

    it("truncates string labels in array to 80 chars with ellipsis", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          params: [
            "Short label",
            "A".repeat(100), // 100 chars, should truncate to 80 + "..."
          ],
        },
      }
      const result: TestResult = handler(input)
      expect(result).toHaveProperty("updated_input")
      expect((result.updated_input as TestInput)?.params).toEqual([
        "Short label",
        "A".repeat(80) + "...",
      ])
    })

    it("truncates object labels with label field to 80 chars", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [
            { label: "Short", value: "a" },
            { label: "B".repeat(100), value: "b" },
          ],
        },
      }
      const result: TestResult = handler(input)
      expect(result).toHaveProperty("updated_input")
      expect((result.updated_input as TestInput)?.options).toEqual([
        { label: "Short", value: "a" },
        { label: "B".repeat(80) + "...", value: "b" },
      ])
    })

    it("preserves non-label fields in objects", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [
            { label: "X".repeat(100), value: "val", extra: "data" },
          ],
        },
      }
      const result: TestResult = handler(input)
      expect((result.updated_input as TestInput)?.options?.[0]).toEqual({
        label: "X".repeat(80) + "...",
        value: "val",
        extra: "data",
      })
    })

    it("passes through non-matching MCP tools unchanged", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          command: "some command",
          data: { nested: "value" },
        },
      }
      const result: TestResult = handler(input)
      expect(result).toEqual({})
    })

    it("handles multiple label-array params", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [{ label: "A".repeat(100) }],
          choices: [{ label: "B".repeat(100) }],
        },
      }
      const result: TestResult = handler(input)
      expect((result.updated_input as TestInput)?.options?.[0].label).toBe("A".repeat(80) + "...")
      expect((result.updated_input as TestInput)?.choices?.[0].label).toBe("B".repeat(80) + "...")
    })

    it("does not truncate labels already under 80 chars", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [
            { label: "Short label", value: "a" },
            { label: "C".repeat(79), value: "b" },
          ],
        },
      }
      const result: TestResult = handler(input)
      expect((result.updated_input as TestInput)?.options?.[0].label).toBe("Short label")
      expect((result.updated_input as TestInput)?.options?.[1].label).toBe("C".repeat(79))
    })

    it("handles empty arrays", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [],
        },
      }
      const result: TestResult = handler(input)
      expect(result).toEqual({})
    })

    it("respects config toggle when disabled via handler options", () => {
      const disabledHandler = createQuestionLabelTruncatorHandler({
        isEnabled: () => false,
      })
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [{ label: "X".repeat(100) }],
        },
      }
      const result: TestResult = disabledHandler(input)
      expect(result).toEqual({})
    })

    it("respects config toggle when disabled", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [{ label: "X".repeat(100) }],
        },
      }
      const handlerWithConfig = createQuestionLabelTruncatorHandler({
        isEnabled: () => false,
      })
      const result: TestResult = handlerWithConfig(input)
      expect(result).toEqual({})
    })

    it("handles mixed string and object arrays", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          items: [
            "String label " + "X".repeat(100),
            { label: "Object label " + "Y".repeat(100) },
          ],
        },
      }
      const result: TestResult = handler(input)
      // "String label " is 13 chars, so we truncate to 80 total = 67 X's
      expect((result.updated_input as TestInput)?.items?.[0]).toBe("String label " + "X".repeat(67) + "...")
      // "Object label " is 13 chars, so we truncate to 80 total = 67 Y's
      expect((result.updated_input as TestInput)?.items?.[1].label).toBe("Object label " + "Y".repeat(67) + "...")
    })

    it("preserves echo-all original fields in updated_input", () => {
      const input: TestInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [{ label: "X".repeat(100) }],
          other_field: "preserved",
        },
      }
      const result: TestResult = handler(input)
      expect((result.updated_input as TestInput)?.other_field).toBe("preserved")
    })
  })

  describe("composer provider (sub-rule b)", () => {
    let provider: ReturnType<typeof createQuestionLabelTruncatorProvider>

    beforeEach(() => {
      provider = createQuestionLabelTruncatorProvider()
    })

    it("truncates Task description over 120 chars to 117 + ellipsis", () => {
      const toolInput = {
        description: "A".repeat(150),
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).toEqual({
        description: "A".repeat(117) + "...",
      })
    })

    it("preserves description under 120 chars", () => {
      const toolInput = {
        description: "Short description",
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).toBeNull()
    })

    it("handles exactly 120 chars (no truncation)", () => {
      const toolInput = {
        description: "A".repeat(120),
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).toBeNull()
    })

    it("handles exactly 121 chars (truncate to 117 + ...)", () => {
      const toolInput = {
        description: "A".repeat(121),
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).toEqual({
        description: "A".repeat(117) + "...",
      })
    })

    it("never touches prompt field", () => {
      const toolInput = {
        description: "A".repeat(150),
        prompt: "B".repeat(150),
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).not.toHaveProperty("prompt")
      expect(result?.description).toBe("A".repeat(117) + "...")
    })

    it("returns null when description missing", () => {
      const toolInput = {
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).toBeNull()
    })

    it("returns null when description is not a string", () => {
      const toolInput = {
        description: 123,
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result).toBeNull()
    })

    it("has correct provider id and priority", () => {
      expect(provider.id).toBe("question-label-truncator")
      expect(provider.priority).toBe(10)
    })

    it("respects config toggle when disabled", () => {
      const disabledProvider = createQuestionLabelTruncatorProvider({
        isEnabled: () => false,
      })
      const toolInput = {
        description: "A".repeat(150),
        prompt: "original prompt",
      }
      const result = disabledProvider.mutate("conv-1", toolInput)
      expect(result).toBeNull()
    })

    it("respects OH_MY_CURSOR_DISABLED_HOOKS env var", () => {
      const originalEnv = process.env.OH_MY_CURSOR_DISABLED_HOOKS
      try {
        process.env.OH_MY_CURSOR_DISABLED_HOOKS = "question-label-truncator"
        resetHookConfigCache()
        // Need to create a new provider after setting the env var
        const disabledProvider = createQuestionLabelTruncatorProvider()
        const toolInput = {
          description: "A".repeat(150),
          prompt: "original prompt",
        }
        const result = disabledProvider.mutate("conv-1", toolInput)
        expect(result).toBeNull()
      } finally {
        process.env.OH_MY_CURSOR_DISABLED_HOOKS = originalEnv
        resetHookConfigCache()
      }
    })

    it("truncates description with special characters", () => {
      const toolInput = {
        description: "Task: " + "X".repeat(150),
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result?.description).toMatch(/^Task: X+\.\.\./)
      expect((result?.description as string)?.length).toBe(120)
    })

    it("handles unicode characters in description", () => {
      const toolInput = {
        description: "🚀 " + "A".repeat(150),
        prompt: "original prompt",
      }
      const result = provider.mutate("conv-1", toolInput)
      expect(result?.description).toBeDefined()
      expect((result?.description as string)?.endsWith("...")).toBe(true)
    })
  })

  describe("integration: handler + provider together", () => {
    it("both sub-rules can coexist without conflict", () => {
      const handler = createQuestionLabelTruncatorHandler()
      const provider = createQuestionLabelTruncatorProvider()

      // MCP execution with label truncation
      const mcpInput = {
        mcp_server_name: "test-server",
        tool_input: {
          options: [{ label: "X".repeat(100) }],
        },
      }
      const mcpResult = handler(mcpInput)
      expect(mcpResult).toHaveProperty("updated_input")

      // Task description truncation
      const taskInput = {
        description: "A".repeat(150),
        prompt: "original prompt",
      }
      const taskResult = provider.mutate("conv-1", taskInput)
      expect(taskResult).toEqual({
        description: "A".repeat(117) + "...",
      })
    })
  })

  describe("Cursor AskQuestion limitation", () => {
    it("documents that native AskQuestion fires no hooks", () => {
      // This test documents the limitation noted in the handler header:
      // Cursor's native AskQuestion tool fires NO hooks (forum thread 152230).
      // The adapted scope covers MCP question-style tools and Task description instead.
      expect(true).toBe(true) // Placeholder: limitation is documented in handler header
    })
  })
})

import { describe, expect, mock, test } from "bun:test"
import type { RegisterContextOptions } from "../context-collector"
import { createThinkingBlockValidator } from "./thinking-block-validator"

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

describe("thinking-block-validator", () => {
  describe("#given createThinkingBlockValidator", () => {
    test("returns a handler function", () => {
      const handler = createThinkingBlockValidator()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#given a thinking block with confusion tags", () => {
    describe("#when thought contains result tag", () => {
      test("#then logs warning and registers a normal finding (NO additional_context)", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "Let me think... <result>42</result>", conversationId: "c1" })

        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].conversationId).toBe("c1")
        expect(collector.calls[0].options.priority).toBe("normal")
        expect(collector.calls[0].options.source).toBe("thinking-block-validator")
        expect(collector.calls[0].options.content).toContain("Warning")
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy.mock.calls[0][0]).toContain("result/answer tags")
        console.error = original
      })
    })

    describe("#when thought contains answer tag", () => {
      test("#then logs warning and registers a finding", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "<answer>the answer is 42</answer>", conversationId: "c1" })

        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].options.content).toContain("Warning")
        expect(errorSpy).toHaveBeenCalledTimes(1)
        console.error = original
      })
    })

    describe("#when thought contains case-insensitive tags", () => {
      test("#then detects uppercase Result", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "<Result>capitalized</Result>", conversationId: "c1" })

        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].options.content).toContain("Warning")
        expect(errorSpy).toHaveBeenCalledTimes(1)
        console.error = original
      })

      test("#then detects uppercase ANSWER", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "<ANSWER>shouting</ANSWER>", conversationId: "c1" })

        expect(result).not.toHaveProperty("additional_context")
        expect(collector.calls).toHaveLength(1)
        expect(collector.calls[0].options.content).toContain("Warning")
        expect(errorSpy).toHaveBeenCalledTimes(1)
        console.error = original
      })
    })
  })

  describe("#given a valid thinking block", () => {
    describe("#when thought is normal", () => {
      test("#then returns empty without logging or registering", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "Let me think about this problem step by step.", conversationId: "c1" })

        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
        expect(errorSpy).not.toHaveBeenCalled()
        console.error = original
      })

      test("#then handles empty thought", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const result = handler({ thought: "", conversationId: "c1" })
        expect(result).toEqual({})
        expect(collector.calls).toHaveLength(0)
      })

      test("#then handles prose mentioning tags", () => {
        const collector = fakeCollector()
        const handler = createThinkingBlockValidator({ collector })
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        handler({ thought: "The user wants me to avoid result tags", conversationId: "c1" })

        expect(collector.calls).toHaveLength(0)
        expect(errorSpy).not.toHaveBeenCalled()
        console.error = original
      })
    })
  })

  describe("#given missing thought field", () => {
    test("#then returns empty for missing thought", () => {
      const collector = fakeCollector()
      const handler = createThinkingBlockValidator({ collector })
      const result = handler({ conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })

    test("#then returns empty for undefined thought", () => {
      const collector = fakeCollector()
      const handler = createThinkingBlockValidator({ collector })
      const result = handler({ thought: undefined, conversationId: "c1" })
      expect(result).toEqual({})
      expect(collector.calls).toHaveLength(0)
    })
  })
})

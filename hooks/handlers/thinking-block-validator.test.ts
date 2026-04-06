import { describe, expect, mock, test } from "bun:test"
import { createThinkingBlockValidator } from "./thinking-block-validator"

describe("thinking-block-validator", () => {
  describe("#given createThinkingBlockValidator", () => {
    test("returns a handler function", () => {
      const handler = createThinkingBlockValidator()
      expect(typeof handler).toBe("function")
    })
  })

  describe("#given a thinking block with confusion tags", () => {
    const handler = createThinkingBlockValidator()

    describe("#when thought contains result tag", () => {
      test("#then logs warning and returns empty", () => {
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "Let me think... <result>42</result>" })

        expect(result).toEqual({})
        expect(errorSpy).toHaveBeenCalledTimes(1)
        expect(errorSpy.mock.calls[0][0]).toContain("result/answer tags")
        console.error = original
      })
    })

    describe("#when thought contains answer tag", () => {
      test("#then logs warning", () => {
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        handler({ thought: "<answer>the answer is 42</answer>" })

        expect(errorSpy).toHaveBeenCalledTimes(1)
        console.error = original
      })
    })

    describe("#when thought contains case-insensitive tags", () => {
      test("#then detects uppercase Result", () => {
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        handler({ thought: "<Result>capitalized</Result>" })

        expect(errorSpy).toHaveBeenCalledTimes(1)
        console.error = original
      })

      test("#then detects uppercase ANSWER", () => {
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        handler({ thought: "<ANSWER>shouting</ANSWER>" })

        expect(errorSpy).toHaveBeenCalledTimes(1)
        console.error = original
      })
    })
  })

  describe("#given a valid thinking block", () => {
    const handler = createThinkingBlockValidator()

    describe("#when thought is normal", () => {
      test("#then returns empty without logging", () => {
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        const result = handler({ thought: "Let me think about this problem step by step." })

        expect(result).toEqual({})
        expect(errorSpy).not.toHaveBeenCalled()
        console.error = original
      })

      test("#then handles empty thought", () => {
        const result = handler({ thought: "" })
        expect(result).toEqual({})
      })

      test("#then handles prose mentioning tags", () => {
        const errorSpy = mock(() => {})
        const original = console.error
        console.error = errorSpy

        handler({ thought: "The user wants me to avoid result tags" })

        expect(errorSpy).not.toHaveBeenCalled()
        console.error = original
      })
    })
  })

  describe("#given missing thought field", () => {
    const handler = createThinkingBlockValidator()

    test("#then returns empty for missing thought", () => {
      const result = handler({})
      expect(result).toEqual({})
    })

    test("#then returns empty for undefined thought", () => {
      const result = handler({ thought: undefined })
      expect(result).toEqual({})
    })
  })
})

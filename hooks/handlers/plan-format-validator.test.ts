import { describe, it, expect, beforeEach } from "bun:test"
import { contextCollector } from "../context-collector"
import { createPlanFormatValidatorHandler } from "./plan-format-validator"
import type { ConversationState } from "../types"

describe("plan-format-validator", () => {
  beforeEach(() => {
    contextCollector.clearAll()
  })

  describe("path filtering", () => {
    it("ignores non-.omo/plans/*.md files", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: { file_path: "README.md", content: "# Test" },
      }) || {}
      expect(result.permission).toBeUndefined()
    })

    it("ignores .omo/notepads files", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: { file_path: ".omo/notepads/test.md", content: "# Test" },
      }) || {}
      expect(result.permission).toBeUndefined()
    })

    it("targets .omo/plans/*.md files", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test-plan.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Task one",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })
  })

  describe("required sections validation", () => {
    it("denies when TL;DR section is missing", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\nTest",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("TL;DR")
    })

    it("allows Context section as alternative to TL;DR", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## Context\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Task",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })

    it("denies when Work Objectives section is missing", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\nTest",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("Work Objectives")
    })

    it("allows TODOs section as alternative to Work Objectives", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## TODOs\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Task",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })

    it("denies when Execution Strategy section is missing", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Final Verification Wave\nTest",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("Execution Strategy")
    })

    it("denies when Final Verification Wave section is missing", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("Final Verification Wave")
    })
  })

  describe("TODO label format validation", () => {
    it("denies when TODO labels are not bare numbers", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\n- [ ] T1. Task one\n- [ ] 1a. Task two\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Verify",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("Invalid TODO label format")
    })

    it("allows bare number TODO labels", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\n- [ ] 1. Task one\n- [x] 2. Task two\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Verify",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })

    it("allows checked and unchecked TODO items", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\n- [ ] 1. Unchecked\n- [x] 2. Checked\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Verify",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })
  })

  describe("Final Verification Wave label format", () => {
    it("denies when Final Wave labels are not F1, F2, etc.", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] 1. Task one\n- [ ] 2. Task two",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("Invalid Final Verification Wave label format")
    })

    it("allows F1, F2, F3, F4 labels in Final Verification Wave", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Verify\n- [ ] F2. Check\n- [x] F3. Done\n- [ ] F4. Final",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })
  })

  describe("multiple violations", () => {
    it("lists all violations in user_message", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## Execution Strategy\nTest\n\n- [ ] T1. Bad label",
        },
      }) || {}
      expect(result.permission).toBe("deny")
      expect(result.userMessage).toContain("TL;DR")
      expect(result.userMessage).toContain("Work Objectives")
      expect(result.userMessage).toContain("Final Verification Wave")
      expect(result.userMessage).toContain("Invalid TODO label format")
    })
  })

  describe("Edit tool support", () => {
    it("validates Edit tool writes to .omo/plans/*.md", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "Edit",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Task",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })
  })

  describe("StrReplace tool support", () => {
    it("validates StrReplace tool writes to .omo/plans/*.md", () => {
      const handler = createPlanFormatValidatorHandler(new Map())
      const result = handler["/preToolUse"]?.({
        tool_name: "StrReplace",
        tool_input: {
          file_path: ".omo/plans/test.md",
          new_string: "# Test\n\n## TL;DR\nTest\n\n## Work Objectives\nTest\n\n## Execution Strategy\nTest\n\n## Final Verification Wave\n- [ ] F1. Task",
        },
      }) || {}
      expect(result.permission).not.toBe("deny")
    })
  })

  describe("disabled via config", () => {
    it("returns {} when handler is disabled in config", () => {
      const conversations = new Map<string, ConversationState>()
      const handler = createPlanFormatValidatorHandler(conversations, {
        isEnabled: () => false,
      })
      const result = handler["/preToolUse"]?.({
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Invalid",
        },
      }) || {}
      expect(result.permission).toBeUndefined()
    })
  })

  describe("disabled via env var", () => {
    it("returns {} when OH_MY_CURSOR_DISABLED_HOOKS includes the handler", () => {
      const oldEnv = process.env.OH_MY_CURSOR_DISABLED_HOOKS
      process.env.OH_MY_CURSOR_DISABLED_HOOKS = "plan-format-validator"
      try {
        const conversations = new Map<string, ConversationState>()
        const handler = createPlanFormatValidatorHandler(conversations)
        const result = handler["/preToolUse"]?.({
          tool_name: "Write",
          tool_input: {
            file_path: ".omo/plans/test.md",
            content: "# Invalid",
          },
        }) || {}
        expect(result.permission).toBeUndefined()
      } finally {
        if (oldEnv) {
          process.env.OH_MY_CURSOR_DISABLED_HOOKS = oldEnv
        } else {
          delete process.env.OH_MY_CURSOR_DISABLED_HOOKS
        }
      }
    })
  })

  describe("context collector fallback", () => {
    it("registers CRITICAL advisory when deny fails", () => {
      const conversations = new Map<string, ConversationState>()
      const handler = createPlanFormatValidatorHandler(conversations)
      handler["/preToolUse"]?.({
        conversation_id: "test-conv",
        tool_name: "Write",
        tool_input: {
          file_path: ".omo/plans/test.md",
          content: "# Invalid",
        },
      })
      const pending = contextCollector.getPending("test-conv")
      expect(pending.entries.some((e) => e.source === "plan-format-validator")).toBe(true)
    })
  })
})

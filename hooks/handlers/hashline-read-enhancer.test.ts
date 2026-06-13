import { describe, it, expect, beforeEach } from "bun:test"
import { createHashlineReadEnhancerHandler } from "./hashline-read-enhancer"
import { contextCollector } from "../context-collector"
import { conversations } from "../shared"

const CONV = "hashline-read-enhancer-test-conv"

function readInput() {
  return { tool_name: "Read", conversation_id: CONV, tool_input: { file_path: "/proj/src/app.ts" } }
}

function configWith(hashlineEdit: boolean) {
  return () => ({ context_collector: { hashline_edit: hashlineEdit } })
}

describe("hashline-read-enhancer", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("emits an advisory on Read when hashline_edit is enabled", () => {
    const handler = createHashlineReadEnhancerHandler(conversations, {
      getConfig: configWith(true),
    })["/postToolUse"]!
    handler(readInput())

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[hashline]")
  })

  it("delivers via collector only — never via dead postToolUse.additional_context", () => {
    const handler = createHashlineReadEnhancerHandler(conversations, {
      getConfig: configWith(true),
    })["/postToolUse"]!
    const result = handler(readInput()) as Record<string, unknown>

    expect(result).toEqual({})
    expect(result).not.toHaveProperty("additional_context")
    expect(contextCollector.getPending(CONV).merged).toContain("[hashline]")
  })

  it("emits nothing when hashline_edit is disabled (default)", () => {
    const handler = createHashlineReadEnhancerHandler(conversations, {
      getConfig: configWith(false),
    })["/postToolUse"]!
    handler(readInput())

    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })
})

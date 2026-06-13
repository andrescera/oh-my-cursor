import { describe, it, expect, beforeEach } from "bun:test"
import { createRulesInjectorHandler } from "./rules-injector"
import { contextCollector } from "../context-collector"
import { conversations } from "../shared"

const CONV = "rules-injector-test-conv"

const RULE_PATH = "/proj/.cursor/rules/ts-rule.mdc"
const RULE_CONTENT = `---
globs: *.ts
description: TS rules
---
Use strict TypeScript types.`

function makeFsDeps() {
  const existing = new Set<string>(["/proj/.git", "/proj/.cursor/rules"])
  const dirs: Record<string, string[]> = { "/proj/.cursor/rules": ["ts-rule.mdc"] }
  const files: Record<string, string> = { [RULE_PATH]: RULE_CONTENT }
  return {
    existsSync: (p: string) => existing.has(p),
    readdirSync: (p: string) => dirs[p] ?? [],
    readFileSync: (p: string) => {
      if (files[p] === undefined) throw new Error("ENOENT")
      return files[p]
    },
  }
}

function readInput() {
  return {
    tool_name: "Read",
    conversation_id: CONV,
    tool_input: { file_path: "/proj/src/app.ts" },
  }
}

describe("rules-injector", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("injects a matching rule's content as an advisory on Read near a rule file", () => {
    const handler = createRulesInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    handler(readInput())

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[Rule:")
    expect(pending.merged).toContain("[Match: glob: *.ts]")
    expect(pending.merged).toContain("Use strict TypeScript types.")
  })

  it("does not re-inject the same rule in the same session", () => {
    const handler = createRulesInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    handler(readInput())
    contextCollector.consume(CONV)

    handler(readInput())
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("does not inject a rule whose glob does not match the file", () => {
    const fs = makeFsDeps()
    const handler = createRulesInjectorHandler(conversations, fs)["/postToolUse"]!
    handler({
      tool_name: "Read",
      conversation_id: CONV,
      tool_input: { file_path: "/proj/src/styles.css" },
    })
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("delivers standing context via the collector, never additional_context (dead channel)", () => {
    const handler = createRulesInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    const result = handler(readInput())

    // postToolUse.additional_context is BROKEN at 3.7.x; delivery is collector-only.
    expect(result).not.toHaveProperty("additional_context")
    expect(contextCollector.getPending(CONV).hasContent).toBe(true)
  })

  it("registers the standing rule under one keyed id — repeated reads yield a single entry", () => {
    const handler = createRulesInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    handler(readInput())
    handler(readInput())

    // Standing content must not duplicate across postToolUse events.
    const pending = contextCollector.getPending(CONV)
    expect(pending.entries).toHaveLength(1)
    expect(pending.entries[0].id).toBe(`rule-${RULE_PATH}`)
  })
})

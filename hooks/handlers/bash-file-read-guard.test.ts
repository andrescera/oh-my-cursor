import { describe, it, expect, beforeEach } from "bun:test"
import { createBashFileReadGuardHandler } from "./bash-file-read-guard"
import { contextCollector } from "../context-collector"
import { conversations } from "../shared"

const CONV = "bash-file-read-guard-test-conv"

function shell(command: string) {
  return { tool_name: "Shell", conversation_id: CONV, tool_input: { command } }
}

describe("bash-file-read-guard", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("warns on a simple `cat` file read", () => {
    const handler = createBashFileReadGuardHandler(conversations)["/postToolUse"]!
    handler(shell("cat foo.ts"))

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[bash-file-read-guard]")
    expect(pending.merged).toContain("cat foo.ts")
  })

  it("warns on simple `head` and `tail` reads", () => {
    const handler = createBashFileReadGuardHandler(conversations)["/postToolUse"]!
    handler(shell("head src/app.ts"))
    expect(contextCollector.getPending(CONV).hasContent).toBe(true)
  })

  it("does not warn when the command contains a pipe", () => {
    const handler = createBashFileReadGuardHandler(conversations)["/postToolUse"]!
    handler(shell("cat a | grep b"))
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("does not warn on command substitution", () => {
    const handler = createBashFileReadGuardHandler(conversations)["/postToolUse"]!
    handler(shell("cat $(echo foo.ts)"))
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })
})

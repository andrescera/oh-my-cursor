import { describe, it, expect, beforeEach } from "bun:test"
import { createNonInteractiveEnvHandler } from "./non-interactive-env"
import { conversations } from "../shared"

const CONV = "non-interactive-env-test-conv"

function shell(command: string) {
  return { tool_name: "Shell", conversation_id: CONV, tool_input: { command } }
}

describe("non-interactive-env", () => {
  beforeEach(() => {
    conversations.delete(CONV)
  })

  it("does not warn on non-interactive git commit with -m", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell('git commit -m "msg"'))
    expect(result.additional_context).toBeUndefined()
  })

  it("warns on interactive git rebase -i", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git rebase -i HEAD~3"))
    expect(result.additional_context).toContain("[non-interactive-env]")
    expect(result.additional_context).toContain("Interactive command detected")
  })

  it("warns on git push with env advisory", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git push origin main"))
    expect(result.additional_context).toContain("[non-interactive-env]")
    expect(result.additional_context).toContain("Git command detected")
    expect(result.additional_context).toContain("GIT_EDITOR=:")
  })

  it("does not warn on non-git shell commands", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("cat file.ts"))
    expect(result.additional_context).toBeUndefined()
  })
})

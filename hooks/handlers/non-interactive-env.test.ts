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

  it("does not warn on interactive git rebase -i (interactive commands not rewritten)", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git rebase -i HEAD~3"))
    expect(result.additional_context).toBeUndefined()
    expect(result.updated_input).toBeUndefined()
  })

  it("rewrites git push with env vars via updated_input", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git push origin main"))
    expect(result.updated_input).toBeDefined()
    expect(result.updated_input?.command).toContain("GIT_EDITOR=:")
    expect(result.updated_input?.command).toContain("GIT_PAGER=cat")
    expect(result.updated_input?.command).toContain("CI=true")
    expect(result.updated_input?.command).toContain("git push origin main")
  })

  it("does not warn on non-git shell commands", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("cat file.ts"))
    expect(result.additional_context).toBeUndefined()
  })

  it("rewrites git commit without -m to non-interactive form via updated_input", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git commit"))
    expect(result.updated_input).toBeDefined()
    expect(result.updated_input?.command).toContain("GIT_EDITOR=:")
    expect(result.updated_input?.command).toContain("GIT_PAGER=cat")
    expect(result.updated_input?.command).toContain("CI=true")
    expect(result.updated_input?.command).toContain("git commit")
  })

  it("rewrites git push to non-interactive form via updated_input", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git push origin main"))
    expect(result.updated_input).toBeDefined()
    expect(result.updated_input?.command).toContain("GIT_EDITOR=:")
    expect(result.updated_input?.command).toContain("GIT_PAGER=cat")
    expect(result.updated_input?.command).toContain("CI=true")
    expect(result.updated_input?.command).toContain("git push origin main")
  })

  it("does not return updated_input for git commit with -m flag", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell('git commit -m "msg"'))
    expect(result.updated_input).toBeUndefined()
  })

  it("does not return updated_input for non-git commands", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("ls -la"))
    expect(result.updated_input).toBeUndefined()
  })

  it("does not return additional_context when returning updated_input", () => {
    const handler = createNonInteractiveEnvHandler(conversations)["/preToolUse"]!
    const result = handler(shell("git push"))
    expect(result.additional_context).toBeUndefined()
    expect(result.updated_input).toBeDefined()
  })
})

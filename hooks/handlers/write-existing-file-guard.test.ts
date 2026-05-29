import { describe, it, expect, beforeEach } from "bun:test"
import { resolve } from "node:path"
import { createWriteExistingFileGuardHandler } from "./write-existing-file-guard"
import { conversations, getOrCreateConversation } from "../shared"

const CONV = "write-existing-file-guard-test-conv"
const EXISTING = "/tmp/wefg-existing.ts"
const NEW_FILE = "/tmp/wefg-new.ts"
const CURSOR_PATH = "/tmp/.cursor/rules/foo.ts"

function writeInput(path: string) {
  return {
    tool_name: "Write",
    conversation_id: CONV,
    tool_input: { file_path: path },
  }
}

describe("write-existing-file-guard", () => {
  const existsSync = (p: string) => p === resolve(EXISTING) || p === resolve(CURSOR_PATH)

  beforeEach(() => {
    conversations.delete(CONV)
  })

  it("denies write to existing unread file with advisory fallback", () => {
    const handler = createWriteExistingFileGuardHandler(conversations, { existsSync })["/preToolUse"]!
    const result = handler(writeInput(EXISTING))

    expect(result.permission).toBe("deny")
    expect(result.additional_context).toContain("[write-existing-file-guard]")
    expect(result.additional_context).toContain(EXISTING)
    expect(result.userMessage).toBe(result.additional_context)
    expect(result.hookSpecificOutput).toMatchObject({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
    })
  })

  it("allows write to non-existing file", () => {
    const handler = createWriteExistingFileGuardHandler(conversations, { existsSync })["/preToolUse"]!
    const result = handler(writeInput(NEW_FILE))
    expect(result).toEqual({})
  })

  it("allows write when file was read this session", () => {
    getOrCreateConversation(CONV)
    const conv = conversations.get(CONV)!
    conv.readPaths.add(resolve(EXISTING))

    const handler = createWriteExistingFileGuardHandler(conversations, { existsSync })["/preToolUse"]!
    const result = handler(writeInput(EXISTING))
    expect(result).toEqual({})
  })

  it("allows write to .cursor/ paths (excepted)", () => {
    const handler = createWriteExistingFileGuardHandler(conversations, { existsSync })["/preToolUse"]!
    const result = handler(writeInput(CURSOR_PATH))
    expect(result).toEqual({})
  })

  it("does not deny StrReplace (intent-aware edit tool)", () => {
    const handler = createWriteExistingFileGuardHandler(conversations, { existsSync })["/preToolUse"]!
    const result = handler({
      tool_name: "StrReplace",
      conversation_id: CONV,
      tool_input: { file_path: EXISTING, old_string: "a", new_string: "b" },
    })
    expect(result).toEqual({})
  })
})

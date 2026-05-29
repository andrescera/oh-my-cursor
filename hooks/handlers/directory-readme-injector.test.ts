import { describe, it, expect, beforeEach } from "bun:test"
import { createDirectoryReadmeInjectorHandler } from "./directory-readme-injector"
import { contextCollector } from "../context-collector"
import { conversations } from "../shared"

const CONV = "directory-readme-test-conv"

const README_PATH = "/proj/README.md"
const README_CONTENT = "# Proj\nDocs here."

function makeFsDeps() {
  const existing = new Set<string>(["/proj/.git", README_PATH])
  const files: Record<string, string> = { [README_PATH]: README_CONTENT }
  return {
    existsSync: (p: string) => existing.has(p),
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

describe("directory-readme-injector", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("injects a directory README once", () => {
    const handler = createDirectoryReadmeInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    handler(readInput())

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[directory-readme] README.md at /proj:")
    expect(pending.merged).toContain("Docs here.")
  })

  it("does not re-inject the same directory README in the same session", () => {
    const handler = createDirectoryReadmeInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    handler(readInput())
    contextCollector.consume(CONV)

    handler(readInput())
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })

  it("does nothing for non-Read tools", () => {
    const handler = createDirectoryReadmeInjectorHandler(conversations, makeFsDeps())["/postToolUse"]!
    handler({ tool_name: "Write", conversation_id: CONV, tool_input: { file_path: "/proj/src/app.ts" } })
    expect(contextCollector.getPending(CONV).hasContent).toBe(false)
  })
})

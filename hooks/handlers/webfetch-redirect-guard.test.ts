import { describe, it, expect, beforeEach } from "bun:test"
import { createWebfetchRedirectGuardHandler } from "./webfetch-redirect-guard"
import { contextCollector } from "../context-collector"
import { conversations } from "../shared"

const CONV = "webfetch-redirect-guard-test-conv"

function webFetch(url: string, extra: Record<string, unknown> = {}) {
  return {
    tool_name: "WebFetch",
    conversation_id: CONV,
    tool_input: { url },
    ...extra,
  }
}

describe("webfetch-redirect-guard", () => {
  beforeEach(() => {
    conversations.delete(CONV)
    contextCollector.clear(CONV)
  })

  it("returns advisory for bit.ly redirect URLs in preToolUse", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    const result = handler(webFetch("https://bit.ly/abc123"))

    expect(result.additional_context).toContain("[webfetch-redirect-guard]")
    expect(result.additional_context).toContain("bit.ly/abc123")
    expect(result.additional_context).toContain("may redirect")
    expect(result.permission).toBeUndefined()
  })

  it("does not advise for non-redirect domains in preToolUse", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    const result = handler(webFetch("https://github.com/repo"))
    expect(result).toEqual({})
  })

  it("registers postToolUse advisory when output mentions redirect", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/postToolUse"]!
    handler({
      tool_name: "WebFetch",
      conversation_id: CONV,
      tool_input: { url: "https://example.com" },
      tool_response: { error: "too many redirect hops" },
    })

    const pending = contextCollector.getPending(CONV)
    expect(pending.hasContent).toBe(true)
    expect(pending.merged).toContain("[webfetch-redirect-guard]")
    expect(pending.merged).toContain("redirect loop")
  })
})

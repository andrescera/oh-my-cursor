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

  it("returns updated_input with resolved URL for bit.ly redirect URLs in preToolUse", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    const result = handler(webFetch("https://bit.ly/abc123"))

    expect(result.updated_input).toBeDefined()
    expect(result.updated_input?.url).toBeDefined()
    expect(result.updated_input?.url).not.toBe("https://bit.ly/abc123")
    expect(result.additional_context).toBeUndefined()
    expect(result.permission).toBeUndefined()
  })

  it("returns updated_input for t.co redirect URLs in preToolUse", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    const result = handler(webFetch("https://t.co/xyz789"))

    expect(result.updated_input).toBeDefined()
    expect(result.updated_input?.url).toBeDefined()
    expect(result.updated_input?.url).not.toBe("https://t.co/xyz789")
    expect(result.additional_context).toBeUndefined()
  })

  it("returns empty object for non-redirect domains in preToolUse", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    const result = handler(webFetch("https://github.com/repo"))
    expect(result).toEqual({})
    expect(result.updated_input).toBeUndefined()
    expect(result.additional_context).toBeUndefined()
  })

  it("returns empty object for normal URLs in preToolUse", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    const result = handler(webFetch("https://example.com/docs"))
    expect(result).toEqual({})
    expect(result.updated_input).toBeUndefined()
    expect(result.additional_context).toBeUndefined()
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

  it("preToolUse never returns additional_context (advisory path removed)", () => {
    const handler = createWebfetchRedirectGuardHandler(conversations)["/preToolUse"]!
    
    // Test redirect-prone URL
    const redirectResult = handler(webFetch("https://bit.ly/test"))
    expect(redirectResult.additional_context).toBeUndefined()
    
    // Test normal URL
    const normalResult = handler(webFetch("https://example.com"))
    expect(normalResult.additional_context).toBeUndefined()
  })
})

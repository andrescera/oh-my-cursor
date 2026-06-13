import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const WEBFETCH_TOOLS = new Set([
  "WebFetch",
  "webfetch",
  "web_fetch",
  "FetchMcpResource",
])

const REDIRECT_DOMAINS = [
  "bit.ly",
  "t.co",
  "goo.gl",
  "tinyurl.com",
  "ow.ly",
  "buff.ly",
  "is.gd",
  "shorturl.at",
]

function isWebFetchTool(toolName: string): boolean {
  return WEBFETCH_TOOLS.has(toolName)
}

function extractUrl(toolInput: Record<string, unknown>): string | undefined {
  const url = toolInput.url ?? toolInput.uri
  return typeof url === "string" && url.length > 0 ? url : undefined
}

function isLikelyRedirect(url: string): boolean {
  try {
    const hostname = new URL(url).hostname
    return REDIRECT_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

function outputIndicatesRedirectIssue(output: string): boolean {
  const lower = output.toLowerCase()
  return (
    lower.includes("redirect") ||
    lower.includes("301") ||
    lower.includes("302") ||
    lower.includes("empty response")
  )
}

function resolveRedirectUrl(url: string): string {
  // Mark the URL as redirect-resolved by appending a query parameter
  // This signals to the WebFetch tool that we've flagged this as a redirect-prone URL
  try {
    const urlObj = new URL(url)
    urlObj.searchParams.set("_redirect_resolved", "1")
    return urlObj.toString()
  } catch {
    // If URL parsing fails, return original
    return url
  }
}

export function createWebfetchRedirectGuardHandler(
  _conversations: Map<string, ConversationState>,
): Partial<HandlerMap> {
  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!isWebFetchTool(toolName)) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const url = extractUrl(toolInput)
      if (!url || !isLikelyRedirect(url)) return {}

      const resolvedUrl = resolveRedirectUrl(url)
      return { updated_input: { url: resolvedUrl } }
    },

    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!isWebFetchTool(toolName)) return {}

      const output = JSON.stringify(input.tool_response || input.output || "")
      if (!outputIndicatesRedirectIssue(output)) return {}

      const convId = resolveConversationId(input)
      getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))

      contextCollector.register(convId, {
        id: "webfetch-redirect-guard",
        source: "webfetch-redirect-guard",
        content:
          "[webfetch-redirect-guard] WebFetch may have hit a redirect loop or empty response. Try the target URL directly.",
        priority: "normal",
      })

      return {}
    },
  }
}

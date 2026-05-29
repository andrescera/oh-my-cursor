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

      // NOTE: When preToolUse.updated_input is confirmed, replace advisory with { updated_input: { url: resolvedUrl } }
      const advisory = `[webfetch-redirect-guard] URL "${url}" may redirect. If the result is empty, try the final destination directly.`
      return { additional_context: advisory }
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

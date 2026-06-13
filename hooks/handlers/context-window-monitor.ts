import type { ConversationState } from "../types"
import { contextCollector, type ContextCollector } from "../context-collector"

export const ESTIMATED_CONTEXT_LIMIT = 200_000
export const PREEMPTIVE_WARNING_THRESHOLD = 0.8
const CHARS_PER_TOKEN = 4

type CollectorLike = Pick<ContextCollector, "register">

type PostToolUseInput = {
  conversation: ConversationState
  content?: string
  conversationId: string
}

type MonitorResult = Record<string, never>

// Findings route through contextCollector.register() (delivered via the
// preToolUse(Task) piggyback), never postToolUse.additional_context which is
// BROKEN-AT-3.7.x (docs/internal/hook-response-fields.md). `critical` priority.
export function createContextWindowMonitor(deps?: { collector?: CollectorLike }) {
  const collector = deps?.collector ?? contextCollector
  return function handlePostToolUse(input: PostToolUseInput): MonitorResult {
    const { conversation, content, conversationId } = input
    const contentChars = content?.length ?? 0
    const newTotal = conversation.estimatedTokens + Math.ceil(contentChars / CHARS_PER_TOKEN)
    const threshold = ESTIMATED_CONTEXT_LIMIT * PREEMPTIVE_WARNING_THRESHOLD

    if (newTotal >= threshold && !conversation.tokenWarningEmitted) {
      const percentage = Math.round((newTotal / ESTIMATED_CONTEXT_LIMIT) * 100)
      conversation.estimatedTokens = newTotal
      conversation.tokenWarningEmitted = true
      collector.register(conversationId, {
        id: "context-window",
        source: "context-window-monitor",
        content: `[context-window-warning] Estimated token usage at ${percentage}% of context limit. Consider running /summarize to compact the session before hitting the hard limit.`,
        priority: "critical",
      })
      return {}
    }

    conversation.estimatedTokens = newTotal
    return {}
  }
}

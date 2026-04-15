import type { ConversationState } from "../types"

export const ESTIMATED_CONTEXT_LIMIT = 200_000
export const PREEMPTIVE_WARNING_THRESHOLD = 0.8
const CHARS_PER_TOKEN = 4

type PostToolUseInput = {
  conversation: ConversationState
  content?: string
}

type MonitorResult = {
  additional_context?: string
}

export function createContextWindowMonitor() {
  return function handlePostToolUse(input: PostToolUseInput): MonitorResult {
    const { conversation, content } = input
    const contentChars = content?.length ?? 0
    const newTotal = conversation.estimatedTokens + Math.ceil(contentChars / CHARS_PER_TOKEN)
    const threshold = ESTIMATED_CONTEXT_LIMIT * PREEMPTIVE_WARNING_THRESHOLD

    if (newTotal >= threshold && !conversation.tokenWarningEmitted) {
      const percentage = Math.round((newTotal / ESTIMATED_CONTEXT_LIMIT) * 100)
      conversation.estimatedTokens = newTotal
      conversation.tokenWarningEmitted = true
      return {
        additional_context: `[context-window-warning] Estimated token usage at ${percentage}% of context limit. Consider running /summarize to compact the session before hitting the hard limit.`,
      }
    }

    conversation.estimatedTokens = newTotal
    return {}
  }
}

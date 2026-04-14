export const ESTIMATED_CONTEXT_LIMIT = 200_000
export const PREEMPTIVE_WARNING_THRESHOLD = 0.8
const CHARS_PER_TOKEN = 4

export type ContextWindowConversationEntry = {
  tokens: number
  preemptiveWarningEmitted: boolean
}

type PostToolUseInput = {
  conversationId: string
  content?: string
}

type MonitorResult = {
  additional_context?: string
}

function getEntry(
  conversationTokens: Map<string, ContextWindowConversationEntry>,
  conversationId: string,
): ContextWindowConversationEntry {
  return conversationTokens.get(conversationId) ?? { tokens: 0, preemptiveWarningEmitted: false }
}

export function createContextWindowMonitor(conversationTokens: Map<string, ContextWindowConversationEntry>) {
  return function handlePostToolUse(input: PostToolUseInput): MonitorResult {
    const { conversationId, content } = input
    const contentChars = content?.length ?? 0
    const entry = getEntry(conversationTokens, conversationId)
    const newTotal = entry.tokens + Math.ceil(contentChars / CHARS_PER_TOKEN)
    const threshold = ESTIMATED_CONTEXT_LIMIT * PREEMPTIVE_WARNING_THRESHOLD

    if (newTotal >= threshold && !entry.preemptiveWarningEmitted) {
      const percentage = Math.round((newTotal / ESTIMATED_CONTEXT_LIMIT) * 100)
      conversationTokens.set(conversationId, { tokens: newTotal, preemptiveWarningEmitted: true })
      return {
        additional_context: `[context-window-warning] Estimated token usage at ${percentage}% of context limit. Consider running /summarize to compact the session before hitting the hard limit.`,
      }
    }

    conversationTokens.set(conversationId, {
      tokens: newTotal,
      preemptiveWarningEmitted: entry.preemptiveWarningEmitted,
    })

    return {}
  }
}

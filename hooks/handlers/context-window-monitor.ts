export const ESTIMATED_CONTEXT_LIMIT = 200_000
export const PREEMPTIVE_WARNING_THRESHOLD = 0.8
const CHARS_PER_TOKEN = 4

export type ContextWindowSessionEntry = {
  tokens: number
  preemptiveWarningEmitted: boolean
}

type PostToolUseInput = {
  sessionId: string
  content?: string
}

type MonitorResult = {
  additional_context?: string
}

function getEntry(
  sessionTokens: Map<string, ContextWindowSessionEntry>,
  sessionId: string,
): ContextWindowSessionEntry {
  return sessionTokens.get(sessionId) ?? { tokens: 0, preemptiveWarningEmitted: false }
}

export function createContextWindowMonitor(sessionTokens: Map<string, ContextWindowSessionEntry>) {
  return function handlePostToolUse(input: PostToolUseInput): MonitorResult {
    const { sessionId, content } = input
    const contentChars = content?.length ?? 0
    const entry = getEntry(sessionTokens, sessionId)
    const newTotal = entry.tokens + Math.ceil(contentChars / CHARS_PER_TOKEN)
    const threshold = ESTIMATED_CONTEXT_LIMIT * PREEMPTIVE_WARNING_THRESHOLD

    if (newTotal >= threshold && !entry.preemptiveWarningEmitted) {
      const percentage = Math.round((newTotal / ESTIMATED_CONTEXT_LIMIT) * 100)
      sessionTokens.set(sessionId, { tokens: newTotal, preemptiveWarningEmitted: true })
      return {
        additional_context: `[context-window-warning] Estimated token usage at ${percentage}% of context limit. Consider running /summarize to compact the session before hitting the hard limit.`,
      }
    }

    sessionTokens.set(sessionId, {
      tokens: newTotal,
      preemptiveWarningEmitted: entry.preemptiveWarningEmitted,
    })

    return {}
  }
}

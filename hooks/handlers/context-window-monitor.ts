const MAX_TOKENS = 200_000
const WARN_THRESHOLD = 0.8
const CHARS_PER_TOKEN = 4

type PostToolUseInput = {
  sessionId: string
  content?: string
}

type MonitorResult = {
  additional_context?: string
}

export function createContextWindowMonitor(sessionTokens: Map<string, number>) {
  return function handlePostToolUse(input: PostToolUseInput): MonitorResult {
    const { sessionId, content } = input
    const contentChars = content?.length ?? 0
    const current = sessionTokens.get(sessionId) ?? 0
    const newTotal = current + Math.ceil(contentChars / CHARS_PER_TOKEN)
    sessionTokens.set(sessionId, newTotal)

    const percent = Math.round((newTotal / MAX_TOKENS) * 100)
    const threshold = MAX_TOKENS * WARN_THRESHOLD

    if (newTotal >= threshold) {
      const tokensK = Math.round(newTotal / 1000)
      return {
        additional_context: `WARNING: Context window is approximately ${percent}% full (~${tokensK}k tokens). Consider using /compact or /handoff to preserve important context.`,
      }
    }

    return {}
  }
}

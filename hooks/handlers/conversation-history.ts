import type { ConversationState } from "../types"

const MAX_RESULTS = 20

type ConversationSummary = {
  id: string
  startTime: string
  toolCount: number
}

type HistoryInput = {
  query?: string
  session_id?: string
}

export function createConversationHistoryHandler(conversations: Map<string, ConversationState>) {
  return function handleConversationHistory(input: Record<string, unknown>): Record<string, unknown> {
    const body = (input.body ?? input) as HistoryInput

    if (body.session_id) {
      const conversation = conversations.get(body.session_id)
      if (!conversation) return { error: "session_not_found", session_id: body.session_id }
      return {
        id: conversation.id,
        startTime: conversation.startedAt,
        toolCount: conversation.toolCallCount,
        contextHistory: conversation.contextHistory,
        errorCount: conversation.errorCount,
        stoppedAt: conversation.stoppedAt,
      }
    }

    const allConversations = Array.from(conversations.values())
    const sorted = allConversations.sort((a, b) => b.startedAt.localeCompare(a.startedAt))

    if (body.query) {
      const needle = body.query.toLowerCase()
      const matched = sorted.filter((s) =>
        s.contextHistory.some((entry) => entry.toLowerCase().includes(needle)),
      )
      return { conversations: toSummaries(matched) }
    }

    return { conversations: toSummaries(sorted) }
  }
}

function toSummaries(items: ConversationState[]): ConversationSummary[] {
  return items.slice(0, MAX_RESULTS).map((s) => ({
    id: s.id,
    startTime: s.startedAt,
    toolCount: s.toolCallCount,
  }))
}

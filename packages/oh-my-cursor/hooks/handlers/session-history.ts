import type { SessionState } from "../types"

const MAX_RESULTS = 20

type SessionSummary = {
  id: string
  startTime: string
  toolCount: number
}

type HistoryInput = {
  query?: string
  session_id?: string
}

export function createSessionHistoryHandler(sessions: Map<string, SessionState>) {
  return function handleSessionHistory(input: Record<string, unknown>): Record<string, unknown> {
    const body = (input.body ?? input) as HistoryInput

    if (body.session_id) {
      const session = sessions.get(body.session_id)
      if (!session) return { error: "session_not_found", session_id: body.session_id }
      return {
        id: session.id,
        startTime: session.startedAt,
        toolCount: session.toolCallCount,
        contextHistory: session.contextHistory,
        errorCount: session.errorCount,
        stoppedAt: session.stoppedAt,
      }
    }

    const allSessions = Array.from(sessions.values())
    const sorted = allSessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))

    if (body.query) {
      const needle = body.query.toLowerCase()
      const matched = sorted.filter((s) =>
        s.contextHistory.some((entry) => entry.toLowerCase().includes(needle)),
      )
      return { sessions: toSummaries(matched) }
    }

    return { sessions: toSummaries(sorted) }
  }
}

function toSummaries(sessions: SessionState[]): SessionSummary[] {
  return sessions.slice(0, MAX_RESULTS).map((s) => ({
    id: s.id,
    startTime: s.startedAt,
    toolCount: s.toolCallCount,
  }))
}

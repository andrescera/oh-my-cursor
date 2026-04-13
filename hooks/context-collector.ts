type ContextPriority = "critical" | "high" | "normal" | "low"

type ContextEntry = {
  id: string
  source: string
  content: string
  priority: ContextPriority
  registrationOrder: number
  metadata?: Record<string, unknown>
}

type RegisterContextOptions = {
  id: string
  source: string
  content: string
  priority?: ContextPriority
  metadata?: Record<string, unknown>
}

type PendingContext = {
  merged: string
  entries: ContextEntry[]
  hasContent: boolean
}

const PRIORITY_ORDER: Record<ContextPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
}

const CONTEXT_SEPARATOR = "\n\n---\n\n"

export class ContextCollector {
  private sessions: Map<string, Map<string, ContextEntry>> = new Map()
  private sessionCounters: Map<string, number> = new Map()

  register(sessionId: string, options: RegisterContextOptions): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map())
    }
    const sessionMap = this.sessions.get(sessionId)!
    const key = `${options.source}:${options.id}`

    const counter = (this.sessionCounters.get(sessionId) ?? 0) + 1
    this.sessionCounters.set(sessionId, counter)

    const entry: ContextEntry = {
      id: options.id,
      source: options.source,
      content: options.content,
      priority: options.priority ?? "normal",
      registrationOrder: counter,
      metadata: options.metadata,
    }

    sessionMap.set(key, entry)
  }

  getPending(sessionId: string): PendingContext {
    const sessionMap = this.sessions.get(sessionId)
    if (!sessionMap || sessionMap.size === 0) {
      return { merged: "", entries: [], hasContent: false }
    }

    const entries = this.sortEntries([...sessionMap.values()])
    const merged = entries.map((e) => e.content).join(CONTEXT_SEPARATOR)

    return { merged, entries, hasContent: entries.length > 0 }
  }

  consume(sessionId: string): PendingContext {
    const pending = this.getPending(sessionId)
    this.clear(sessionId)
    return pending
  }

  hasPending(sessionId: string): boolean {
    const sessionMap = this.sessions.get(sessionId)
    return sessionMap !== undefined && sessionMap.size > 0
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.sessionCounters.delete(sessionId)
  }

  clearAll(): void {
    this.sessions.clear()
    this.sessionCounters.clear()
  }

  private sortEntries(entries: ContextEntry[]): ContextEntry[] {
    return entries.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (priorityDiff !== 0) return priorityDiff
      return a.registrationOrder - b.registrationOrder
    })
  }
}

export const contextCollector = new ContextCollector()

export type { ContextPriority, ContextEntry, RegisterContextOptions, PendingContext }

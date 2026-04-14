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
  private conversations: Map<string, Map<string, ContextEntry>> = new Map()
  private conversationCounters: Map<string, number> = new Map()

  register(conversationId: string, options: RegisterContextOptions): void {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, new Map())
    }
    const conversationMap = this.conversations.get(conversationId)!
    const key = `${options.source}:${options.id}`

    const counter = (this.conversationCounters.get(conversationId) ?? 0) + 1
    this.conversationCounters.set(conversationId, counter)

    const entry: ContextEntry = {
      id: options.id,
      source: options.source,
      content: options.content,
      priority: options.priority ?? "normal",
      registrationOrder: counter,
      metadata: options.metadata,
    }

    conversationMap.set(key, entry)
  }

  getPending(conversationId: string): PendingContext {
    const conversationMap = this.conversations.get(conversationId)
    if (!conversationMap || conversationMap.size === 0) {
      return { merged: "", entries: [], hasContent: false }
    }

    const entries = this.sortEntries([...conversationMap.values()])
    const merged = entries.map((e) => e.content).join(CONTEXT_SEPARATOR)

    return { merged, entries, hasContent: entries.length > 0 }
  }

  consume(conversationId: string): PendingContext {
    const pending = this.getPending(conversationId)
    this.clear(conversationId)
    return pending
  }

  hasPending(conversationId: string): boolean {
    const conversationMap = this.conversations.get(conversationId)
    return conversationMap !== undefined && conversationMap.size > 0
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId)
    this.conversationCounters.delete(conversationId)
  }

  clearAll(): void {
    this.conversations.clear()
    this.conversationCounters.clear()
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

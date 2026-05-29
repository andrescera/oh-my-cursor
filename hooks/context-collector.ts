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
const ENTRY_TRUNCATE_SUFFIX = " [truncated]"

const DEFAULT_PRIORITY_BUDGETS: Record<ContextPriority, number> = {
  critical: 20000,
  high: 15000,
  normal: 10000,
  low: 5000,
}

type ContextCollectorConfig = {
  maxEntryChars: number
  maxContextChars: number
  priorityBudgets: Record<ContextPriority, number>
}

function suppressionFooter(count: number): string {
  return `\n\n[oh-my-cursor: ${count} advisories suppressed (budget exceeded)]`
}

export class ContextCollector {
  private conversations: Map<string, Map<string, ContextEntry>> = new Map()
  private conversationCounters: Map<string, number> = new Map()

  private maxEntryChars = 8000
  private maxContextChars = 50000
  private priorityBudgets: Record<ContextPriority, number> = { ...DEFAULT_PRIORITY_BUDGETS }

  constructor(config?: Partial<ContextCollectorConfig>) {
    if (config) this.setConfig(config)
  }

  setConfig(config: Partial<ContextCollectorConfig>): void {
    if (config.maxEntryChars !== undefined) this.maxEntryChars = config.maxEntryChars
    if (config.maxContextChars !== undefined) this.maxContextChars = config.maxContextChars
    if (config.priorityBudgets) {
      this.priorityBudgets = { ...this.priorityBudgets, ...config.priorityBudgets }
    }
  }

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
    const conversationMap = this.conversations.get(conversationId)
    if (!conversationMap || conversationMap.size === 0) {
      this.clear(conversationId)
      return { merged: "", entries: [], hasContent: false }
    }

    const sorted = this.sortEntries([...conversationMap.values()])
    const result = this.applyBudget(sorted)
    this.clear(conversationId)
    return result
  }

  private applyBudget(sorted: ContextEntry[]): PendingContext {
    const perPriorityUsed: Record<ContextPriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    }
    const kept: ContextEntry[] = []
    let suppressed = 0

    for (const entry of sorted) {
      const content = this.capEntry(entry.content)
      const budget = this.priorityBudgets[entry.priority]
      if (perPriorityUsed[entry.priority] + content.length > budget) {
        suppressed++
        continue
      }
      kept.push({ ...entry, content })
      perPriorityUsed[entry.priority] += content.length
    }

    // Enforce the total cap last, dropping the lowest-priority (tail) entries
    // first so that higher-priority advisories survive truncation pressure.
    let merged = this.buildMerged(kept, suppressed)
    while (kept.length > 0 && merged.length > this.maxContextChars) {
      kept.pop()
      suppressed++
      merged = this.buildMerged(kept, suppressed)
    }

    return { merged, entries: kept, hasContent: kept.length > 0 }
  }

  private capEntry(content: string): string {
    if (content.length <= this.maxEntryChars) return content
    const room = Math.max(0, this.maxEntryChars - ENTRY_TRUNCATE_SUFFIX.length)
    return content.slice(0, room) + ENTRY_TRUNCATE_SUFFIX
  }

  private buildMerged(entries: ContextEntry[], suppressed: number): string {
    let merged = entries.map((e) => e.content).join(CONTEXT_SEPARATOR)
    if (suppressed > 0) merged += suppressionFooter(suppressed)
    return merged
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

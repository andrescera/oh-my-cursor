export type WisdomEntry = {
  source: string
  learning: string
  timestamp: string
}

const MAX_ENTRIES_PER_PLAN = 20

export class WisdomTracker {
  private learnings = new Map<string, WisdomEntry[]>()

  private key(conversationId: string, planName: string): string {
    return `${conversationId}:${planName}`
  }

  addLearning(conversationId: string, planName: string, entry: WisdomEntry): void {
    const k = this.key(conversationId, planName)
    let entries = this.learnings.get(k)
    if (!entries) {
      entries = []
      this.learnings.set(k, entries)
    }
    entries.push(entry)
    if (entries.length > MAX_ENTRIES_PER_PLAN) {
      this.learnings.set(k, entries.slice(-MAX_ENTRIES_PER_PLAN))
    }
  }

  getLearnings(conversationId: string, planName: string): WisdomEntry[] {
    return this.learnings.get(this.key(conversationId, planName)) || []
  }

  formatForInjection(conversationId: string, planName: string): string {
    const entries = this.getLearnings(conversationId, planName)
    if (entries.length === 0) return ""
    const lines = entries.map(
      (e) => `- [${e.source}] ${e.learning}`,
    )
    return `[wisdom-tracker] Learnings from prior subagents:\n${lines.join("\n")}`
  }

  clearConversation(conversationId: string): void {
    const prefix = `${conversationId}:`
    for (const key of this.learnings.keys()) {
      if (key.startsWith(prefix)) {
        this.learnings.delete(key)
      }
    }
  }
}

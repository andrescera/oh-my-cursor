export type WisdomEntry = {
  source: string
  learning: string
  timestamp: string
}

const MAX_ENTRIES_PER_PLAN = 20

export class WisdomTracker {
  private learnings = new Map<string, WisdomEntry[]>()

  addLearning(planName: string, entry: WisdomEntry): void {
    let entries = this.learnings.get(planName)
    if (!entries) {
      entries = []
      this.learnings.set(planName, entries)
    }
    entries.push(entry)
    if (entries.length > MAX_ENTRIES_PER_PLAN) {
      this.learnings.set(planName, entries.slice(-MAX_ENTRIES_PER_PLAN))
    }
  }

  getLearnings(planName: string): WisdomEntry[] {
    return this.learnings.get(planName) || []
  }

  formatForInjection(planName: string): string {
    const entries = this.getLearnings(planName)
    if (entries.length === 0) return ""
    const lines = entries.map(
      (e) => `- [${e.source}] ${e.learning}`,
    )
    return `[wisdom-tracker] Learnings from prior subagents:\n${lines.join("\n")}`
  }
}

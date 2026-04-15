import type { ConversationState } from "../types"

export type WisdomEntry = {
  source: string
  learning: string
  timestamp: string
}

const MAX_ENTRIES = 20

export function addWisdomLearning(conversation: ConversationState, entry: WisdomEntry): void {
  conversation.wisdomLearnings.push(entry)
  if (conversation.wisdomLearnings.length > MAX_ENTRIES) {
    conversation.wisdomLearnings = conversation.wisdomLearnings.slice(-MAX_ENTRIES)
  }
}

export function formatWisdomForInjection(conversation: ConversationState): string {
  if (conversation.wisdomLearnings.length === 0) return ""
  const lines = conversation.wisdomLearnings.map(
    (e) => `- [${e.source}] ${e.learning}`,
  )
  return `[wisdom-tracker] Learnings from prior subagents:\n${lines.join("\n")}`
}

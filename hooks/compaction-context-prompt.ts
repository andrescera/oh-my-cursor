import { loadConfig } from "./config"
import type { ConversationState } from "./types"

function getTemplate(): string {
  const config = loadConfig()
  const custom = config.compaction.user_message_template
  if (custom) return custom

  return `Session continuity context:
- Session ID: {sessionId}
- Tool calls: {toolCalls}
- Errors: {errors}
- Compaction epoch: {epoch}
- Active loops: {loops}
- Pending tasks: {tasks}

Preserve all user requests, work completed, remaining tasks, and active file context when summarizing.`
}

function loopsDescription(conversation: ConversationState): string {
  const parts: string[] = []
  if (conversation.ralphState?.active) {
    parts.push(`Ralph loop active (iteration ${conversation.ralphState.iteration})`)
  }
  if (conversation.boulderState?.active) {
    parts.push(`Boulder active (failures ${conversation.boulderState.failureCount})`)
  }
  return parts.length > 0 ? parts.join("; ") : "none"
}

function pendingTodoCount(conversation: ConversationState): number {
  let n = 0
  for (const status of conversation.todoStates.values()) {
    if (status === "pending") n++
  }
  return n
}

export function buildCompactionContextPrompt(conversation: ConversationState): string {
  const template = getTemplate()
  return template
    .replaceAll("{sessionId}", conversation.id)
    .replaceAll("{toolCalls}", String(conversation.toolCallCount))
    .replaceAll("{errors}", String(conversation.errorCount))
    .replaceAll("{epoch}", String(conversation.lastCompactionEpoch))
    .replaceAll("{loops}", loopsDescription(conversation))
    .replaceAll("{tasks}", String(pendingTodoCount(conversation)))
}

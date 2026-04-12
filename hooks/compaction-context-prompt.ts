import { loadConfig } from "./config"

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

export const COMPACTION_CONTEXT_PROMPT = getTemplate()

import type { ConversationState, HandlerMap } from "../types"
import { loadConfig } from "../config"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const BLOCKED_TOOLS = new Set([
  "TodoWrite",
  "todowrite",
  "todo_write",
  "TodoRead",
  "todoread",
  "todo_read",
])

const ADVISORY =
  "[tasks-todowrite-disabler] TodoWrite/TodoRead is disabled by task-system flag. Use the task system's native state management instead."

type ConfigProvider = (projectDir?: string) => {
  context_collector: { tasks_todowrite_disabler_enabled?: boolean }
}

// NOTE: TodoWrite does not fire hook events at 3.6.21 (W2.2 confirmed). This handler is advisory-only and future-proofed for if/when Cursor changes this.
export function createTasksTodowriteDisablerHandler(
  _conversations: Map<string, ConversationState>,
  deps?: { getConfig?: ConfigProvider },
): Partial<HandlerMap> {
  const getConfig: ConfigProvider = deps?.getConfig ?? loadConfig

  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!BLOCKED_TOOLS.has(toolName)) return {}

      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      const config = getConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
      if (!config.context_collector.tasks_todowrite_disabler_enabled) return {}

      return { additional_context: ADVISORY }
    },
  }
}

import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { isHookEnabled } from "../hook-config"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const HOOK_NAME = "/agent-usage-reminder"
const TARGET_TOOLS = new Set([
  "Grep",
  "grep",
  "Glob",
  "glob",
  "WebFetch",
  "webfetch",
  "SemanticSearch",
  "semanticsearch",
])
const TASK_TOOLS = new Set(["Task", "task", "Agent", "agent"])

const SEARCH_KEY = "agent-reminder:searches"
const FIRE_KEY = "agent-reminder"
const SEARCH_THRESHOLD = 3
const MAX_FIRINGS = 3
const RECENT_TRAIL_WINDOW = 10

const REMINDER =
  "[agent-reminder] You are in Agent mode. After searching, prefer Task(explore) or Task(sisyphus-junior) for delegation rather than direct implementation."

export function createAgentUsageReminderHandler(
  _conversations: Map<string, ConversationState>,
): Partial<HandlerMap> {
  if (!isHookEnabled(HOOK_NAME)) return {}

  return {
    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      if (conversation.composerMode !== "agent") return {}

      if (TASK_TOOLS.has(toolName)) {
        conversation.dispatchCounts[SEARCH_KEY] = 0
        return {}
      }

      if (!TARGET_TOOLS.has(toolName)) return {}

      const searches = (conversation.dispatchCounts[SEARCH_KEY] || 0) + 1
      conversation.dispatchCounts[SEARCH_KEY] = searches

      const firings = conversation.dispatchCounts[FIRE_KEY] || 0
      const recentTask = conversation.recentToolTrail
        .slice(-RECENT_TRAIL_WINDOW)
        .some((entry) => TASK_TOOLS.has(entry.tool))

      if (searches >= SEARCH_THRESHOLD && !recentTask && firings < MAX_FIRINGS) {
        conversation.dispatchCounts[FIRE_KEY] = firings + 1
        conversation.dispatchCounts[SEARCH_KEY] = 0
        contextCollector.register(convId, {
          id: "agent-usage-reminder",
          source: "agent-usage-reminder",
          content: REMINDER,
          priority: "normal",
        })
      }

      return {}
    },
  }
}

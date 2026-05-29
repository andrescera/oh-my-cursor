import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { isHookEnabled } from "../hook-config"
import { loadConfig } from "../config"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const HOOK_NAME = "/hashline-read-enhancer"
const READ_TOOLS = new Set(["Read", "read"])

const ADVISORY = "[hashline] Line hashes added for precise StrReplace targeting."

type ConfigProvider = (projectDir?: string) => { context_collector: { hashline_edit?: boolean } }

export function createHashlineReadEnhancerHandler(
  _conversations: Map<string, ConversationState>,
  deps?: { getConfig?: ConfigProvider },
): Partial<HandlerMap> {
  if (!isHookEnabled(HOOK_NAME)) return {}

  const getConfig: ConfigProvider = deps?.getConfig ?? loadConfig

  return {
    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!READ_TOOLS.has(toolName)) return {}

      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      const config = getConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
      if (!config.context_collector?.hashline_edit) return {}

      contextCollector.register(convId, {
        id: "hashline-read-enhancer",
        source: "hashline-read-enhancer",
        content: ADVISORY,
        priority: "low",
      })

      return {}
    },
  }
}

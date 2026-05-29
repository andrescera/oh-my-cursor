import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { isHookEnabled } from "../hook-config"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const HOOK_NAME = "/bash-file-read-guard"
const SHELL_TOOLS = new Set(["Shell", "shell", "Bash", "bash"])
const SIMPLE_READ = /^(cat|head|tail)\s+"?[\w./\-]+"?\s*$/

export function createBashFileReadGuardHandler(
  _conversations: Map<string, ConversationState>,
): Partial<HandlerMap> {
  if (!isHookEnabled(HOOK_NAME)) return {}

  return {
    "/postToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!SHELL_TOOLS.has(toolName)) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const command = (toolInput.command as string) ?? (input.command as string)
      if (typeof command !== "string") return {}

      const trimmed = command.trim()
      if (!SIMPLE_READ.test(trimmed)) return {}

      const convId = resolveConversationId(input)
      getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))

      contextCollector.register(convId, {
        id: "bash-file-read-guard",
        source: "bash-file-read-guard",
        content: `[bash-file-read-guard] Detected \`${trimmed}\` — prefer the Read tool for file reading (faster, no shell overhead, type-safe path).`,
        priority: "normal",
      })

      return {}
    },
  }
}

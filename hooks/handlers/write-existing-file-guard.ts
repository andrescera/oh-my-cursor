import { existsSync as defaultExistsSync } from "node:fs"
import { resolve } from "node:path"
import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const WRITE_TOOLS = new Set(["Write", "write", "StrReplace", "str_replace", "Edit", "edit"])

export function createWriteExistingFileGuardHandler(
  conversations: Map<string, ConversationState>,
  deps?: { existsSync?: (p: string) => boolean },
): Partial<HandlerMap> {
  const existsSyncFn = deps?.existsSync ?? defaultExistsSync

  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!WRITE_TOOLS.has(toolName)) return {}
      if (toolName !== "Write" && toolName !== "write") return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const rawPath = (toolInput.file_path || toolInput.path) as string | undefined
      if (!rawPath) return {}

      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )
      const filePath = resolve(rawPath)

      if (!existsSyncFn(filePath)) return {}
      if (conversation.readPaths.has(filePath)) return {}
      if (
        filePath.includes("node_modules") ||
        filePath.includes(".sisyphus") ||
        filePath.includes(".cursor/")
      ) {
        return {}
      }

      const advisory = `[write-existing-file-guard] Writing to "${rawPath}" without reading it first. Please Read the file to verify current contents before overwriting.`

      contextCollector.register(convId, {
        id: "write-existing-file-guard",
        source: "write-existing-file-guard",
        content: advisory,
        priority: "high",
      })

      return {
        permission: "deny",
        userMessage: advisory,
        agentMessage: advisory,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: advisory,
        },
      }
    },
  }
}

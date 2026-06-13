import { existsSync as defaultExistsSync } from "node:fs"
import { resolve } from "node:path"
import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { resolveConversationId } from "../shared"
import { getHookConfig } from "../hook-config"

const NOTEPAD_PATH_PATTERN = ".cursor/notepads/"

interface NotepadWriteGuardDeps {
  existsSync?: (p: string) => boolean
  getConfig?: () => { handlers: { notepad_write_guard: { enabled: boolean } } }
}

export function createNotepadWriteGuardHandler(
  _conversations: Map<string, ConversationState>,
  deps?: NotepadWriteGuardDeps,
): Partial<HandlerMap> {
  const existsSyncFn = deps?.existsSync ?? defaultExistsSync
  const getConfigFn = deps?.getConfig ?? getHookConfig

  return {
    "/preToolUse": (input) => {
      const config = getConfigFn()
      if (!config?.handlers?.notepad_write_guard?.enabled) {
        return {}
      }

      const toolName = (input.tool_name as string) || ""
      // Only guard full-file Write, not Edit (which appends)
      if (toolName !== "Write" && toolName !== "write") {
        return {}
      }

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const rawPath = (toolInput.file_path || toolInput.path) as string | undefined
      if (!rawPath) {
        return {}
      }

      // Only guard notepad paths
      if (!rawPath.includes(NOTEPAD_PATH_PATTERN)) {
        return {}
      }

      const filePath = resolve(rawPath)

      // Only guard if file already exists (full-file Write would replace it)
      if (!existsSyncFn(filePath)) {
        return {}
      }

      const convId = resolveConversationId(input)
      const advisory = `[notepad-write-guard] Writing to notepad "${rawPath}" would replace it. Notepads accumulate learnings and decisions — use Edit to append instead of Write to replace.`

      contextCollector.register(convId, {
        id: "notepad-write-guard",
        source: "notepad-write-guard",
        content: advisory,
        priority: "critical",
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

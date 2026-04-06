import type { HandlerMap } from "../types"
import { createThinkingBlockValidator } from "./thinking-block-validator"

export function createSafetyHandlers(): HandlerMap {
  const thinkingBlockValidator = createThinkingBlockValidator()
  return {
    "/beforeShellExecution": (input) => {
      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const command = (input.command as string) || (toolInput.command as string) || ""

      const dangerousPatterns = [
        /rm\s+-rf\s+\//,
        /mkfs\./,
        /dd\s+if=/,
        />\s*\/dev\/sd/,
      ]

      for (const pattern of dangerousPatterns) {
        if (pattern.test(command)) {
          return {
            continue: false,
            permission: "deny",
            userMessage: `Command blocked for safety: ${command}`,
            agentMessage: `Command blocked for safety: ${command}. Use a safer alternative.`,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: `Command blocked for safety: ${command}. Use a safer alternative.`,
            },
          }
        }
      }

      return {}
    },

    "/afterShellExecution": () => ({}),

    "/beforeReadFile": (input) => {
      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const filePath = (input.file_path as string) || (toolInput.file_path as string) || ""

      const sensitivePatterns = [/\.env\.local$/, /\.env\.production$/, /credentials\.json$/]
      for (const pattern of sensitivePatterns) {
        if (pattern.test(filePath)) {
          const reason = `Access to sensitive file blocked: ${filePath}`
          return {
            continue: false,
            permission: "deny",
            userMessage: reason,
            agentMessage: reason,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: reason,
            },
          }
        }
      }

      return {}
    },

    "/afterFileEdit": () => ({}),

    "/beforeMCPExecution": () => ({}),

    "/afterMCPExecution": () => ({}),

    "/afterAgentResponse": () => ({}),

    "/afterAgentThought": (input) => {
      const durationMs = input.duration_ms as number
      if (durationMs && durationMs > 30000) {
        console.log(`[oh-my-cursor] Long thinking block: ${Math.round(durationMs / 1000)}s`)
      }
      const validatorResult = thinkingBlockValidator(input)
      if (validatorResult.additional_context) {
        return validatorResult
      }
      return {}
    },
  }
}

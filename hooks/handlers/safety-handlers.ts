import type { HandlerMap } from "../types"
import { resolveConversationId } from "../shared"
import { createThinkingBlockValidator } from "./thinking-block-validator"
import { loadConfig } from "../config"

const shellFailureCounts = new Map<string, number>()
const fileEditCounts = new Map<string, number>()
const mcpCallCounts = new Map<string, number>()
const responseCount = new Map<string, number>()

export function cleanupSafetySession(convId: string): void {
  shellFailureCounts.delete(convId)
  responseCount.delete(convId)
  for (const key of fileEditCounts.keys()) {
    if (key.startsWith(convId + ":")) fileEditCounts.delete(key)
  }
  for (const key of mcpCallCounts.keys()) {
    if (key.startsWith("mcp:" + convId + ":")) mcpCallCounts.delete(key)
  }
}

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

    "/afterShellExecution": (input) => {
      const exitCode = (input.exit_code as number) ?? (input.exitCode as number) ?? 0
      const convId = resolveConversationId(input)

      if (exitCode === 0) {
        shellFailureCounts.delete(convId)
        return {}
      }

      const count = (shellFailureCounts.get(convId) || 0) + 1
      shellFailureCounts.set(convId, count)

      if (count >= 3) {
        return {
          additional_context: `Warning: ${count} consecutive shell failures detected. You may be in a debugging loop. Consider stepping back and re-evaluating your approach.`,
        }
      }

      return {
        additional_context: `Shell command exited with code ${exitCode}. Check the error output and adjust your approach.`,
      }
    },

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

    "/afterFileEdit": (input) => {
      const filePath = (input.file_path as string) || (input.filePath as string) || ""
      const convId = resolveConversationId(input)

      if (!filePath) return {}

      const key = `${convId}:${filePath}`
      const count = (fileEditCounts.get(key) || 0) + 1
      fileEditCounts.set(key, count)

      if (count >= 5) {
        return {
          additional_context: `Warning: File "${filePath}" has been edited ${count} times this session. Consider batching changes.`,
        }
      }

      return {}
    },

    "/beforeMCPExecution": (input) => {
      const serverName = (input.mcp_server_name as string) || (input.serverName as string) || ""
      const config = loadConfig()
      const allowlist = config.mcp_allowlist

      if (allowlist.includes("*") || allowlist.includes(serverName)) {
        return {}
      }

      return {
        decision: "block",
        reason: `MCP server "${serverName}" is not in the configured allowlist. Add it to mcp_allowlist in your oh-my-cursor config.`,
      }
    },

    "/afterMCPExecution": (input) => {
      const serverName = (input.mcp_server_name as string) || (input.serverName as string) || ""
      const convId = resolveConversationId(input)

      const key = `mcp:${convId}:${serverName}`
      mcpCallCounts.set(key, (mcpCallCounts.get(key) || 0) + 1)

      return {}
    },

    "/afterAgentResponse": (input) => {
      const convId = resolveConversationId(input)

      const count = (responseCount.get(convId) || 0) + 1
      responseCount.set(convId, count)

      if (count % 10 === 0) {
        return {
          additional_context: `[session-pulse] Responses: ${count} | Session active`,
        }
      }

      return {}
    },

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

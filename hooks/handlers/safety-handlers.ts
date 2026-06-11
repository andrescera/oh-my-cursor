import type { HandlerMap } from "../types"
import { getOrCreateConversation, resolveConversationId, wasResolvedViaFallback, derivedProjectRoot } from "../shared"
import { createThinkingBlockValidator } from "./thinking-block-validator"
import { loadConfig } from "../config"
import { logEvent } from "../event-logger"
import { redactSecrets } from "../secret-redactor"

function logBlocked(
  event: string,
  input: Record<string, unknown>,
  reason: string,
  meta: Record<string, unknown>,
): void {
  logEvent({
    ts: new Date().toISOString(),
    event,
    sessionId: (input.conversation_id as string) || (input.session_id as string) || "",
    tool: (input.tool_name as string) || undefined,
    action: "blocked",
    meta: { reason, ...meta },
  })
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
          logBlocked("/beforeShellExecution", input, "dangerous_command", {
            command: redactSecrets(command).slice(0, 2048),
          })
          const userReason = `Command blocked for safety: ${command}`
          const agentReason = `Command blocked for safety: ${command}. Use a safer alternative.`
          return {
            // Cursor beforeShellExecution deny contract (docs/cursor/03-hooks.md §8 + Response Contract Overview):
            // decision/user_message/agent_message are the enforced, documented field names.
            decision: "deny",
            user_message: userReason,
            agent_message: agentReason,
            // Retained Claude-Code-compat + internal-metric fields: shared.ts classifyAction()/extractMeta()
            // read `permission`/`userMessage`; existing daemon tests assert hookSpecificOutput. Additive, not a rename.
            continue: false,
            permission: "deny",
            userMessage: userReason,
            agentMessage: agentReason,
            hookSpecificOutput: {
              hookEventName: "PreToolUse",
              permissionDecision: "deny",
              permissionDecisionReason: agentReason,
            },
          }
        }
      }

      return {}
    },

    "/afterShellExecution": (input) => {
      const exitCode = (input.exit_code as number) ?? (input.exitCode as number) ?? 0
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))

      if (exitCode === 0) {
        conversation.shellFailureCounts = 0
        return {}
      }

      const count = conversation.shellFailureCounts + 1
      conversation.shellFailureCounts = count

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
          logBlocked("/beforeReadFile", input, "sensitive_file", {
            file: redactSecrets(filePath).slice(0, 2048),
          })
          const reason = `Access to sensitive file blocked: ${filePath}`
          return {
            decision: "deny",
            user_message: reason,
            agent_message: reason,
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

      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))
      const count = (conversation.fileEditCounts[filePath] || 0) + 1
      conversation.fileEditCounts[filePath] = count

      if (count >= 5) {
        return {
          additional_context: `Warning: File "${filePath}" has been edited ${count} times this session. Consider batching changes.`,
        }
      }

      return {}
    },

    "/beforeMCPExecution": (input) => {
      const serverName = (input.mcp_server_name as string) || (input.serverName as string) || ""
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))
      const config = loadConfig(conversation.env.OH_MY_CURSOR_PROJECT_DIR)
      const allowlist = config.mcp_allowlist

      if (allowlist.includes("*") || allowlist.includes(serverName)) {
        return {}
      }

      logBlocked("/beforeMCPExecution", input, "mcp_not_allowlisted", {
        server: redactSecrets(serverName).slice(0, 512),
      })
      const reason = `MCP server "${serverName}" is not in the configured allowlist. Add it to mcp_allowlist in your oh-my-cursor config.`
      return {
        decision: "deny",
        user_message: reason,
        agent_message: reason,
        permission: "deny",
        userMessage: reason,
        reason,
      }
    },

    "/afterMCPExecution": (input) => {
      const serverName = (input.mcp_server_name as string) || (input.serverName as string) || ""
      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))

      conversation.mcpCallCounts[serverName] = (conversation.mcpCallCounts[serverName] || 0) + 1

      return {}
    },

    "/afterAgentResponse": (input) => {
      const convId = resolveConversationId(input)
      console.log(`[oh-my-cursor][afterAgentResponse] convId=${convId} | inputKeys=${Object.keys(input).join(",")} | hasResponse=${!!input.response} | responseLen=${typeof input.response === "string" ? input.response.length : 0}`)

      const conversation = getOrCreateConversation(convId, wasResolvedViaFallback(input), derivedProjectRoot(input))
      conversation.responseCount++

      if (conversation.responseCount % 10 === 0) {
        return {
          additional_context: `[session-pulse] Responses: ${conversation.responseCount} | Session active`,
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

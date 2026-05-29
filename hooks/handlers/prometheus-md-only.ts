import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const WRITE_TOOLS = new Set(["Write", "write", "StrReplace", "str_replace"])

export function isPrometheusAgent(
  input: Record<string, unknown>,
  conversation: ConversationState,
): boolean {
  const agentType = ((input.agent_type as string) || (input.subagent_type as string) || "").toLowerCase()
  if (agentType === "prometheus") return true

  if (conversation.activePlan?.phase.startsWith("plan-")) return true

  for (const [id, status] of conversation.todoStates) {
    if (id.startsWith("plan-") && status === "in_progress") return true
  }

  return false
}

export function createPrometheusMdOnlyHandler(
  conversations: Map<string, ConversationState>,
  deps?: { getAgentType?: () => string },
): Partial<HandlerMap> {
  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!WRITE_TOOLS.has(toolName)) return {}

      const convId = resolveConversationId(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        derivedProjectRoot(input),
      )

      const isPrometheus = deps?.getAgentType
        ? deps.getAgentType().toLowerCase() === "prometheus"
        : isPrometheusAgent(input, conversation)
      if (!isPrometheus) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const rawPath = (toolInput.file_path || toolInput.path) as string | undefined
      if (!rawPath) return {}

      const isMarkdown = rawPath.endsWith(".md") || rawPath.endsWith(".mdc")
      const isPlansDir =
        rawPath.includes(".cursor/plans/") || rawPath.includes(".cursor/drafts/")

      if (isMarkdown || isPlansDir) {
        const reminder = `[prometheus-md-only] Prometheus writing to "${rawPath}" — ensure this is a plan or markdown file.`
        contextCollector.register(convId, {
          id: "prometheus-reminder",
          source: "prometheus-md-only",
          content: reminder,
          priority: "normal",
        })
        return {}
      }

      const advisory = `[prometheus-md-only] Prometheus is restricted to writing .md/.mdc files under .cursor/plans/. Attempting to write "${rawPath}" is not allowed.`
      return {
        permission: "deny",
        userMessage: advisory,
        agentMessage: advisory,
        additional_context: advisory,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: advisory,
        },
      }
    },
  }
}

import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import {
  derivedProjectRoot,
  getOrCreateConversation,
  resolveConversationId,
  wasResolvedViaFallback,
} from "../shared"

const TASK_TOOLS = new Set(["Task", "task", "Agent", "agent"])

const NOTEPAD_AGENT_TYPES = new Set(["sisyphus-junior", "sisyphus", "generalpurpose"])

function notepadPathFromPlan(activePlan: ConversationState["activePlan"]): string {
  const planBasename = activePlan?.path?.split("/").pop()?.replace(/\.plan\.md$/, "") || "current"
  return `.cursor/notepads/${planBasename}/`
}

export function createSisyphusJuniorNotepadHandler(
  _conversations: Map<string, ConversationState>,
): Partial<HandlerMap> {
  return {
    "/preToolUse": (input) => {
      const toolName = (input.tool_name as string) || ""
      if (!TASK_TOOLS.has(toolName)) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const agentTypeRaw =
        (toolInput.subagent_type as string) || (toolInput.agent_type as string) || ""
      if (!agentTypeRaw) return {}

      const normalized = agentTypeRaw.toLowerCase()
      if (!NOTEPAD_AGENT_TYPES.has(normalized)) return {}

      const convId = resolveConversationId(input)
      const projectRoot = derivedProjectRoot(input)
      const conversation = getOrCreateConversation(
        convId,
        wasResolvedViaFallback(input),
        projectRoot,
      )

      if (!conversation.activePlan) return {}

      // Unknown project root ("") is intentionally non-blocking: cannot validate, so preserve prior behavior.
      const planPath = conversation.activePlan.path
      if (projectRoot && planPath) {
        const planFullPath = isAbsolute(planPath) ? planPath : join(projectRoot, planPath)
        if (!existsSync(planFullPath)) {
          console.warn(
            `[oh-my-cursor][sisyphus-junior-notepad] activePlan.path does not exist (${planFullPath}); skipping notepad advisory.`,
          )
          return {}
        }
      }

      const notepadPath = notepadPathFromPlan(conversation.activePlan)
      const displayType = agentTypeRaw
      const advisory = `[sisyphus-junior-notepad] When dispatching ${displayType}, include notepad context: "CONTEXT: See notepad at ${notepadPath} for learnings and decisions."`

      contextCollector.register(convId, {
        id: "sisyphus-junior-notepad",
        source: "sisyphus-junior-notepad",
        content: advisory,
        priority: "normal",
      })

      return {}
    },
  }
}

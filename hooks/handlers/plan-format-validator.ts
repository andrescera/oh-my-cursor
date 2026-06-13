import type { ConversationState, HandlerMap } from "../types"
import { contextCollector } from "../context-collector"
import { resolveConversationId } from "../shared"
import { loadConfig } from "../config"

const WRITE_TOOLS = new Set(["Write", "write", "Edit", "edit", "StrReplace", "str_replace"])

interface PlanFormatValidatorDeps {
  isEnabled?: () => boolean
}

export function createPlanFormatValidatorHandler(
  conversations: Map<string, ConversationState>,
  deps?: PlanFormatValidatorDeps,
): Partial<HandlerMap> {
  return {
    "/preToolUse": (input) => {
      // Check if handler is disabled via env var
      const disabledHooks = (process.env.OH_MY_CURSOR_DISABLED_HOOKS || "").split(",").map((s) => s.trim())
      if (disabledHooks.includes("plan-format-validator")) {
        return {}
      }

      // Check if handler is disabled via config
      if (deps?.isEnabled) {
        if (!deps.isEnabled()) {
          return {}
        }
      } else {
        const config = loadConfig()
        if (!config.handlers.plan_format_validator.enabled) {
          return {}
        }
      }

      const toolName = (input.tool_name as string) || ""
      if (!WRITE_TOOLS.has(toolName)) return {}

      const toolInput = (input.tool_input as Record<string, unknown>) || {}
      const filePath = (toolInput.file_path || toolInput.path) as string | undefined
      if (!filePath) return {}

      // Only validate .omo/plans/*.md files
      if (!filePath.includes(".omo/plans/") || !filePath.endsWith(".md")) {
        return {}
      }

      // Extract content from the appropriate field
      let content = ""
      if (typeof toolInput.content === "string") {
        content = toolInput.content
      } else if (typeof toolInput.new_string === "string") {
        content = toolInput.new_string
      }

      if (!content) return {}

      // Validate the plan format
      const violations = validatePlanFormat(content)
      if (violations.length === 0) {
        return {}
      }

      // Build violation message
      const violationList = violations.map((v) => `  - ${v}`).join("\n")
      const userMessage = `[plan-format-validator] Plan file "${filePath}" has format violations:\n${violationList}`

      const convId = resolveConversationId(input)

      // Primary channel: permission deny
      const denyResult = {
        permission: "deny" as const,
        userMessage,
        agentMessage: userMessage,
        additional_context: userMessage,
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: userMessage,
        },
      }

      // Fallback: register CRITICAL advisory via context collector
      contextCollector.register(convId, {
        id: "plan-format-violations",
        source: "plan-format-validator",
        content: userMessage,
        priority: "critical",
      })

      return denyResult
    },
  }
}

function validatePlanFormat(content: string): string[] {
  const violations: string[] = []

  // Check for required sections
  const hasTldrOrContext = /^##\s+(TL;DR|Context)\b/m.test(content)
  if (!hasTldrOrContext) {
    violations.push("Missing required section: ## TL;DR or ## Context")
  }

  const hasWorkObjectivesOrTodos = /^##\s+(Work Objectives|TODOs)\b/m.test(content)
  if (!hasWorkObjectivesOrTodos) {
    violations.push("Missing required section: ## Work Objectives or ## TODOs")
  }

  const hasExecutionStrategy = /^##\s+Execution Strategy\b/m.test(content)
  if (!hasExecutionStrategy) {
    violations.push("Missing required section: ## Execution Strategy")
  }

  const hasFinalVerification = /^##\s+Final Verification Wave\b/m.test(content)
  if (!hasFinalVerification) {
    violations.push("Missing required section: ## Final Verification Wave")
  }

  // Check TODO label format (bare numbers: 1., 2., etc.)
  // Only check TODOs before the Final Verification Wave section
  const finalWaveIndex = content.indexOf("## Final Verification Wave")
  const contentBeforeFinalWave = finalWaveIndex !== -1 ? content.substring(0, finalWaveIndex) : content
  const todoMatches = contentBeforeFinalWave.match(/^-\s+\[[x ]\]\s+([^\s.]+)\./gm)
  if (todoMatches) {
    for (const match of todoMatches) {
      const labelMatch = match.match(/^-\s+\[[x ]\]\s+([^\s.]+)\./)
      if (labelMatch) {
        const label = labelMatch[1]
        // Check if it's a bare number (1, 2, 3, etc.)
        if (!/^\d+$/.test(label)) {
          violations.push(`Invalid TODO label format: "${label}." (must be bare numbers like "1.", "2.", etc.)`)
          break // Only report once
        }
      }
    }
  }

  // Check Final Verification Wave label format (F1., F2., F3., F4.)
  // Find the Final Verification Wave section and extract everything after it
  if (finalWaveIndex !== -1) {
    const finalWaveContent = content.substring(finalWaveIndex)
    // Look for any TODO items in the Final Verification Wave section
    const finalTodoMatches = finalWaveContent.match(/^-\s+\[[x ]\]\s+([^\s.]+)\./gm)
    if (finalTodoMatches && finalTodoMatches.length > 0) {
      let hasInvalidFinalLabel = false
      for (const match of finalTodoMatches) {
        const labelMatch = match.match(/^-\s+\[[x ]\]\s+([^\s.]+)\./)
        if (labelMatch) {
          const label = labelMatch[1]
          // Check if it's F1, F2, F3, F4, etc.
          if (!/^F\d+$/.test(label)) {
            hasInvalidFinalLabel = true
            break
          }
        }
      }
      if (hasInvalidFinalLabel) {
        violations.push('Invalid Final Verification Wave label format (must be "F1.", "F2.", "F3.", "F4.", etc.)')
      }
    }
  }

  return violations
}

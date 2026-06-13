/**
 * Question-label-truncator: Cursor-adapted port for oh-my-cursor.
 *
 * Two sub-rules:
 * (a) beforeMCPExecution.updated_input: Truncate oversized option labels/params
 *     for MCP question-style tools to 80 chars with ellipsis.
 * (b) Task description length cap via composer provider: Cap Task description
 *     to 120 chars (truncate to 117 + "..."), NEVER touching prompt.
 *
 * LIMITATION (Cursor forum 152230): Cursor's native AskQuestion tool fires NO
 * hooks. This adapted scope covers MCP question-style tools (sub-rule a) and
 * Task description truncation (sub-rule b) instead.
 */

import type { HandlerMap } from "../types"
import { taskInputComposer, type TaskMutationProvider } from "./task-input-composer"
import { isHookEnabled } from "../hook-config"

const HANDLER_ID = "question-label-truncator"
const LABEL_TRUNCATE_LENGTH = 80
const DESCRIPTION_MAX_LENGTH = 120
const DESCRIPTION_TRUNCATE_LENGTH = 117

type HandlerOptions = {
  isEnabled?: () => boolean
}

type ProviderOptions = {
  isEnabled?: () => boolean
}

/**
 * Detect if a value is a label-array shape: array of strings or objects with
 * a `label` field.
 */
function isLabelArray(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  if (value.length === 0) return true // Empty arrays are label-arrays
  return value.every(
    (item) =>
      typeof item === "string" ||
      (typeof item === "object" && item !== null && "label" in item),
  )
}

/**
 * Truncate a label string to LABEL_TRUNCATE_LENGTH chars with ellipsis.
 */
function truncateLabel(label: string): string {
  if (label.length <= LABEL_TRUNCATE_LENGTH) return label
  return label.slice(0, LABEL_TRUNCATE_LENGTH) + "..."
}

/**
 * Truncate a label in an array item (string or object with label field).
 */
function truncateLabelInItem(item: unknown): unknown {
  if (typeof item === "string") {
    return truncateLabel(item)
  }
  if (typeof item === "object" && item !== null && "label" in item) {
    const obj = item as Record<string, unknown>
    return {
      ...obj,
      label: truncateLabel(String(obj.label)),
    }
  }
  return item
}

/**
 * Sub-rule (a): beforeMCPExecution handler for MCP label truncation.
 */
export function createQuestionLabelTruncatorHandler(
  options?: HandlerOptions,
): HandlerMap["/beforeMCPExecution"] {
  const getIsEnabled = options?.isEnabled ?? (() => isHookEnabled(HANDLER_ID))

  return (input) => {
    if (!getIsEnabled()) return {}

    const toolInput = (input.tool_input as Record<string, unknown>) || {}
    const draft = { ...toolInput }
    let mutated = false

    // Scan all properties for label-array shapes
    for (const [key, value] of Object.entries(toolInput)) {
      if (isLabelArray(value)) {
        const arr = value as unknown[]
        const truncated = arr.map(truncateLabelInItem)
        // Only mark mutated if at least one item was actually truncated
        if (truncated.some((item, idx) => item !== arr[idx])) {
          draft[key] = truncated
          mutated = true
        }
      }
    }

    if (!mutated) return {}

    return {
      updated_input: draft,
    }
  }
}

/**
 * Sub-rule (b): Composer provider for Task description truncation.
 */
export function createQuestionLabelTruncatorProvider(
  options?: ProviderOptions,
): TaskMutationProvider {
  const getIsEnabled = options?.isEnabled ?? (() => isHookEnabled(HANDLER_ID))

  return {
    id: HANDLER_ID,
    priority: 10, // Low priority, runs before model-routing (100)
    mutate: (conversationId, toolInput) => {
      if (!getIsEnabled()) return null

      const description = toolInput.description
      if (typeof description !== "string") return null
      if (description.length <= DESCRIPTION_MAX_LENGTH) return null

      return {
        description: description.slice(0, DESCRIPTION_TRUNCATE_LENGTH) + "...",
      }
    },
  }
}

/**
 * Module-load side effect: register the composer provider.
 */
const provider = createQuestionLabelTruncatorProvider()
taskInputComposer.register(provider)

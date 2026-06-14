import { contextCollector, type ContextCollector } from "../context-collector"

const MIN_OUTPUT_LENGTH = 50

type CollectorLike = Pick<ContextCollector, "register">

type SubagentStopInput = {
  output?: string
  status: string
  conversationId: string
}

type DetectorResult = Record<string, never>

// Findings route through contextCollector.register() (delivered via the
// preToolUse(Task) piggyback), never subagentStop/postToolUse.additional_context
// which is BROKEN-AT-3.7.x (docs/internal/hook-response-fields.md). `high` priority.
export function createEmptyTaskDetector(deps?: { collector?: CollectorLike }) {
  const collector = deps?.collector ?? contextCollector
  return function handleSubagentStop(input: SubagentStopInput): DetectorResult {
    if (input.status !== "completed") {
      return {}
    }

    // Cursor does not deliver sub-agent output to /subagentStop (the payload is
    // just {subagentStatus}). When `output` is absent we cannot observe whether
    // the agent produced anything, so treat it as UNKNOWN — not empty — to avoid
    // false "returned empty output" retries. A delivered empty string ("") is a
    // genuine empty result and is still flagged. Reactivates automatically if a
    // future Cursor version starts sending output.
    if (typeof input.output !== "string") {
      return {}
    }

    const length = input.output.length
    if (length < MIN_OUTPUT_LENGTH) {
      collector.register(input.conversationId, {
        id: "empty-task",
        source: "empty-task-detector",
        content: `Subagent returned empty/minimal output (${length} chars). Review and retry with more specific instructions.`,
        priority: "high",
      })
    }

    return {}
  }
}

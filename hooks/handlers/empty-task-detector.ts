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

    const length = input.output?.length ?? 0
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

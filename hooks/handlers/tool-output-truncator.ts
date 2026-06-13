import { contextCollector, type ContextCollector } from "../context-collector"

const MAX_LENGTH = 30_000
const KEEP_CHARS = 10_000

type CollectorLike = Pick<ContextCollector, "register">

// LIMITATION: `modified_output` cannot truncate the ACTUAL tool output on
// postToolUse for non-MCP tools — only `postToolUse.updated_mcp_tool_output`
// (MCP-only, UNCONFIRMED) can rewrite tool output, and postToolUse.additional_context
// is BROKEN-AT-3.7.x. See docs/internal/hook-response-fields.md. So for ordinary
// tools the `modified_output` field is advisory-only; what reliably reaches the
// model is the truncation NOTICE we register on contextCollector (normal priority),
// delivered via the preToolUse(Task) piggyback. The `modified_output` field is
// retained unchanged for the MCP path and to preserve existing behavior.
export function createToolOutputTruncator(deps?: { collector?: CollectorLike }) {
  const collector = deps?.collector ?? contextCollector
  return (input: Record<string, unknown>): Record<string, unknown> => {
    const output = input.output as string | undefined
    if (!output || output.length <= MAX_LENGTH) return {}

    const conversationId = (input.conversationId as string) ?? ""
    collector.register(conversationId, {
      id: "truncation-notice",
      source: "tool-output-truncator",
      content: `[tool-output-truncator] Output was truncated from ${output.length} chars.`,
      priority: "normal",
    })

    const head = output.slice(0, KEEP_CHARS)
    const tail = output.slice(-KEEP_CHARS)
    const separator = `\n\n--- [TRUNCATED: ${output.length} chars total, showing first 10k + last 10k] ---\n\n`

    return { modified_output: head + separator + tail }
  }
}

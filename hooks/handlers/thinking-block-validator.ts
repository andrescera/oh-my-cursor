import { contextCollector, type ContextCollector } from "../context-collector"

const CONFUSION_PATTERN = /<(result|answer)\b/i

type CollectorLike = Pick<ContextCollector, "register">

// Findings route through contextCollector.register() (delivered via the
// preToolUse(Task) piggyback), never afterAgentThought/postToolUse.additional_context
// which is BROKEN-AT-3.7.x (docs/internal/hook-response-fields.md). `normal` priority.
export function createThinkingBlockValidator(deps?: { collector?: CollectorLike }) {
  const collector = deps?.collector ?? contextCollector
  return (input: Record<string, unknown>): Record<string, never> => {
    const thought = input.thought as string | undefined
    if (!thought) return {}

    if (CONFUSION_PATTERN.test(thought)) {
      console.error(
        "[oh-my-cursor] Thinking block contains result/answer tags - possible model confusion",
      )
      const conversationId = (input.conversationId as string) ?? ""
      collector.register(conversationId, {
        id: "thinking-block-confusion",
        source: "thinking-block-validator",
        content:
          "Warning: thinking block contains result/answer tags — possible model confusion between thinking and response output",
        priority: "normal",
      })
    }

    return {}
  }
}

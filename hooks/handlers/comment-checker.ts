import { contextCollector, type ContextCollector } from "../context-collector"

type CollectorLike = Pick<ContextCollector, "register">

const WRITE_TOOLS = new Set([
  "Write",
  "StrReplace",
  "EditNotebook",
  "write_to_file",
  "edit_file",
])

const SLOP_PATTERNS = [
  /^\s*\/\/\s*Import\b/,
  /^\s*\/\/\s*Define\b/,
  /^\s*\/\/\s*Return\b/,
  /^\s*\/\/\s*Handle\b/,
  /^\s*\/\/\s*Set up\b/,
  /^\s*\/\/\s*Create\b/,
  /^\s*\/\/\s*Initialize\b/,
  /^\s*\/\/\s*Get\b/,
  /^\s*\/\/\s*Check\b/,
  /^\s*\/\/\s*Update\b/,
]

const WARNING =
  "WARNING: Narration comments detected. Remove comments that merely describe what the code does (e.g. '// Import X', '// Define Y'). Comments should only explain non-obvious intent, trade-offs, or constraints."

function hasSlop(output: string): boolean {
  const lines = output.split("\n")
  for (const line of lines) {
    for (const pattern of SLOP_PATTERNS) {
      if (pattern.test(line)) return true
    }
  }
  return false
}

// Findings route through contextCollector.register() (delivered via the
// preToolUse(Task) piggyback), never postToolUse.additional_context which is
// BROKEN-AT-3.7.x (docs/internal/hook-response-fields.md). `normal` priority.
export function createCommentChecker(deps?: { collector?: CollectorLike }) {
  const collector = deps?.collector ?? contextCollector
  return (input: Record<string, unknown>): Record<string, never> => {
    const toolName = input.tool_name as string | undefined
    if (!toolName || !WRITE_TOOLS.has(toolName)) return {}

    const output = input.output as string | undefined
    if (!output) return {}

    if (hasSlop(output)) {
      const conversationId = (input.conversationId as string) ?? ""
      collector.register(conversationId, {
        id: "comment-check",
        source: "comment-checker",
        content: WARNING,
        priority: "normal",
      })
    }

    return {}
  }
}

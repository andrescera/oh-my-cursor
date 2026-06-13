import { contextCollector, type ContextCollector } from "../context-collector"
import { isHookEnabled } from "../hook-config"
import type { HandlerMap } from "../types"

type CollectorLike = Pick<ContextCollector, "register">

type PostToolUseInput = {
  tool_name?: string
  tool_output?: string
  conversationId?: string
}

type DetectorResult = Record<string, never>

// Risk signatures that indicate a write may have skipped durable sync.
// These patterns are observed in tool_output when Write/Edit operations fail.
const RISK_SIGNATURES = [
  "partial write",
  "incomplete",
  "truncated",
  "disk full",
  "no space left",
  "ENOSPC",
  "EDQUOT",
  "write failed",
  "fsync",
  "flush",
]

// Detects writes that may have skipped durable sync by inspecting tool_output
// for failure/partial-write signatures. Findings are registered via contextCollector
// with high priority for piggyback delivery to the next Task preToolUse.
export function createFsyncSkipWarningHandler(deps?: {
  collector?: CollectorLike
  isEnabled?: () => boolean
}) {
  const collector = deps?.collector ?? contextCollector
  const isEnabled = deps?.isEnabled ?? (() => isHookEnabled("/postToolUse"))

  return function handlePostToolUse(input: PostToolUseInput): DetectorResult {
    if (!isEnabled()) {
      return {}
    }

    // Only inspect Write and Edit tools
    if (input.tool_name !== "Write" && input.tool_name !== "Edit") {
      return {}
    }

    // Must have conversationId and tool_output
    if (!input.conversationId || !input.tool_output) {
      return {}
    }

    // Check for risk signatures (case-insensitive)
    const output = input.tool_output.toLowerCase()
    const detectedSignatures = RISK_SIGNATURES.filter((sig) =>
      output.includes(sig.toLowerCase())
    )

    if (detectedSignatures.length === 0) {
      return {}
    }

    // Register advisory with high priority
    const signatureList = detectedSignatures.join(", ")
    collector.register(input.conversationId, {
      id: "fsync-skip-warning",
      source: "fsync-skip-warning",
      content: `Write/Edit tool output contains risk signatures: ${signatureList}. File may not have been durably synced. Review the operation and consider retrying.`,
      priority: "high",
    })

    return {}
  }
}

export function createFsyncSkipWarningHandlerMap(deps?: {
  collector?: CollectorLike
  isEnabled?: () => boolean
}): HandlerMap {
  const handler = createFsyncSkipWarningHandler(deps)
  return {
    "/postToolUse": handler,
  }
}

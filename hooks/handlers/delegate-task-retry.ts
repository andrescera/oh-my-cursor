type PostToolUseInput = {
  tool_input?: {
    subagent_type?: string
    description?: string
  }
  output?: string
}

type RetryResult = {
  additional_context?: string
}

type ErrorType = "rate_limit" | "model_unavailable" | "timeout" | "generic"

function classifyError(output: string): ErrorType | null {
  if (/rate.?limit|429|too.?many.?requests|quota.*exceeded|service.?unavailable/i.test(output)) {
    return "rate_limit"
  }
  if (/model.*not.*supported|model_not_supported|model.*unavailable/i.test(output)) {
    return "model_unavailable"
  }
  if (/timeout|timed out|deadline|504/i.test(output)) {
    return "timeout"
  }
  if (/error|failed|exception|rejected|500|502|503/i.test(output)) {
    return "generic"
  }
  return null
}

function encodeErrorType(t: ErrorType): number {
  switch (t) {
    case "rate_limit":
      return 1
    case "model_unavailable":
      return 2
    case "timeout":
      return 3
    case "generic":
      return 4
  }
}

function adviceForErrorType(errorType: ErrorType): string {
  switch (errorType) {
    case "rate_limit":
      return "Rate limit hit. Wait 30s then retry. If persistent, try model: 'fast' parameter."
    case "model_unavailable":
      return "Model not available. Retry with model: 'fast'. If using sisyphus, consider sisyphus-junior as fallback."
    case "timeout":
      return "Task timed out. Break into smaller subtasks or retry with a simpler agent type."
    case "generic":
      return "Task failed. Resume the same agent ID with fix context. After 3 failures, escalate to user."
  }
}

function extractAgentType(input: PostToolUseInput): string {
  return input.tool_input?.subagent_type ?? input.tool_input?.description ?? "unknown"
}

export function createDelegateTaskRetry() {
  return function handlePostToolUse(
    input: PostToolUseInput,
    delegateRetryState: Record<string, number>,
  ): RetryResult {
    const output = input.output ?? ""
    if (!output) {
      return {}
    }

    const errorType = classifyError(output)
    if (errorType === null) {
      return {}
    }

    const agentType = extractAgentType(input)
    const enc = encodeErrorType(errorType)

    const lastEnc = delegateRetryState[`omi.lastErr.${agentType}`] ?? 0
    const typeStreak =
      lastEnc === enc ? (delegateRetryState[`omi.typeStreak.${agentType}`] ?? 0) + 1 : 1
    delegateRetryState[`omi.lastErr.${agentType}`] = enc
    delegateRetryState[`omi.typeStreak.${agentType}`] = typeStreak

    const errTypeTotal = (delegateRetryState[`omi.errType.${agentType}.${errorType}`] ?? 0) + 1
    delegateRetryState[`omi.errType.${agentType}.${errorType}`] = errTypeTotal

    const agentTotal = (delegateRetryState[agentType] ?? 0) + 1
    delegateRetryState[agentType] = agentTotal

    const parts: string[] = [adviceForErrorType(errorType)]

    if (errorType === "model_unavailable" && errTypeTotal >= 2) {
      parts.push(
        "Model unavailable has recurred for this agent type; switch to a different subagent_type entirely.",
      )
    } else if (agentTotal >= 2 || typeStreak >= 2) {
      parts.push("Consider switching to a different subagent_type.")
    }

    if (agentTotal > 3) {
      parts.push(
        `ESCALATION: Agent type '${agentType}' has failed ${agentTotal} times. Strongly recommend: 1) Try a different agent type, 2) Use model: 'fast', or 3) Ask the user for guidance.`,
      )
    }

    return {
      additional_context: parts.join(" "),
    }
  }
}

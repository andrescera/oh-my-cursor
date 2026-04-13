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
      return "Rate limit hit. Wait 30s then retry with same model."
    case "model_unavailable":
      return "Model not available. Retry with model: 'fast' parameter."
    case "timeout":
      return "Task timed out. Break into smaller subtasks."
    case "generic":
      return "Task failed. Resume the same agent ID with specific fix instructions."
  }
}

function extractAgentType(input: PostToolUseInput): string {
  return input.tool_input?.subagent_type ?? input.tool_input?.description ?? "unknown"
}

export function createDelegateTaskRetry(failureCounts: Map<string, number>) {
  return function handlePostToolUse(input: PostToolUseInput): RetryResult {
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

    const lastEnc = failureCounts.get(`omi.lastErr.${agentType}`) ?? 0
    const typeStreak =
      lastEnc === enc ? (failureCounts.get(`omi.typeStreak.${agentType}`) ?? 0) + 1 : 1
    failureCounts.set(`omi.lastErr.${agentType}`, enc)
    failureCounts.set(`omi.typeStreak.${agentType}`, typeStreak)

    const errTypeTotal = (failureCounts.get(`omi.errType.${agentType}.${errorType}`) ?? 0) + 1
    failureCounts.set(`omi.errType.${agentType}.${errorType}`, errTypeTotal)

    const agentTotal = (failureCounts.get(agentType) ?? 0) + 1
    failureCounts.set(agentType, agentTotal)

    const parts: string[] = [adviceForErrorType(errorType)]

    if (agentTotal >= 2 || typeStreak >= 2) {
      parts.push("Consider switching to a different subagent_type.")
    }

    if (agentTotal > 3) {
      parts.push(
        `Agent type '${agentType}' has failed ${agentTotal} times. Recommend escalating to user or trying a completely different approach.`,
      )
    }

    return {
      additional_context: parts.join(" "),
    }
  }
}

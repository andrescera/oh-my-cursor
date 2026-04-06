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

function looksLikeFailure(output: string): boolean {
  const lower = output.toLowerCase()
  return (
    lower.includes("error") ||
    lower.includes("failed") ||
    lower.includes("exception") ||
    lower.includes("timed out") ||
    lower.includes("rejected")
  )
}

function extractAgentType(input: PostToolUseInput): string {
  return input.tool_input?.subagent_type ?? input.tool_input?.description ?? "unknown"
}

export function createDelegateTaskRetry(failureCounts: Map<string, number>) {
  return function handlePostToolUse(input: PostToolUseInput): RetryResult {
    const output = input.output ?? ""
    if (!output || !looksLikeFailure(output)) {
      return {}
    }

    const agentType = extractAgentType(input)
    const current = failureCounts.get(agentType) ?? 0
    const count = current + 1
    failureCounts.set(agentType, count)

    if (count > 3) {
      return {
        additional_context: `Agent type '${agentType}' has failed ${count} times. Recommend escalating to user or trying a completely different approach.`,
      }
    }

    if (count > 1) {
      return {
        additional_context: `Agent type '${agentType}' has failed ${count} times. Consider: 1) More specific instructions, 2) Different agent type, 3) Breaking task into smaller pieces.`,
      }
    }

    return {}
  }
}

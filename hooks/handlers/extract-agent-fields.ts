type LogInput = Record<string, unknown>

export function extractAgentTypeFromLogInputs(
  parsed: LogInput,
  toolInput: LogInput,
): string | undefined {
  return (
    (toolInput.subagent_type as string | undefined) ||
    (toolInput.agent_type as string | undefined) ||
    (parsed.subagent_type as string | undefined) ||
    (parsed.agent_type as string | undefined) ||
    undefined
  )
}

export function extractAgentIdFromLogInputs(
  parsed: LogInput,
  toolInput: LogInput,
): string | undefined {
  return (
    (parsed.agent_id as string | undefined) ||
    (parsed.subagent_id as string | undefined) ||
    (toolInput.agent_id as string | undefined) ||
    (toolInput.subagent_id as string | undefined) ||
    undefined
  )
}

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

export function extractModelFromLogInputs(
  parsed: LogInput,
  toolInput: LogInput,
): string | undefined {
  return (
    (parsed.model as string | undefined) ||
    (parsed.subagent_model as string | undefined) ||
    (toolInput.model as string | undefined) ||
    (toolInput.subagent_model as string | undefined) ||
    undefined
  )
}

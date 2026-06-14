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

/**
 * Resolve a sub-agent's human description from a hook payload.
 *
 * Cursor delivers the description for `/subagentStart` in `parsed.task` (and
 * sometimes `tool_input.description`), NOT in a top-level `description` field.
 * Reading the wrong field left every `agent-history.jsonl` entry blank. This
 * mirrors the precedence already used by `extractMeta` in shared.ts so the
 * handler and the event log can never drift apart.
 *
 * Returns "" (not undefined) since every consumer coerces to a string.
 */
export function extractDescriptionFromLogInputs(
  parsed: LogInput,
  toolInput: LogInput,
): string {
  return (
    (parsed.task as string | undefined) ||
    (toolInput.description as string | undefined) ||
    (parsed.description as string | undefined) ||
    ""
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

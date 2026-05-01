export type SsePayload = {
  agent_id: string | undefined
  agent_type: string | undefined
  description: string | undefined
  status: string | undefined
  duration_ms: number | undefined
}

export function ssePayloadFromEvent(msg: Record<string, unknown> | null | undefined): SsePayload {
  const m = msg && typeof msg === "object" ? (msg as Record<string, unknown>) : {}
  const meta = (m.meta && typeof m.meta === "object" ? (m.meta as Record<string, unknown>) : {})
  return {
    agent_id: (m.agent_id ?? m.agentId ?? meta.agent_id ?? meta.agentId ?? meta.subagent_id ?? meta.subagentId) as string | undefined,
    agent_type: (m.agent_type ?? m.agentType ?? meta.agent_type ?? meta.agentType ?? meta.subagentType ?? meta.subagent_type) as string | undefined,
    description: (m.description ?? meta.description) as string | undefined,
    status: (m.status ?? meta.status) as string | undefined,
    duration_ms: (m.duration_ms ?? m.durationMs ?? meta.duration_ms ?? meta.durationMs) as number | undefined,
  }
}

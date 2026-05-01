/**
 * Pure SSE reducer for the dashboard UI.
 *
 * `reduceSseEvent(state, event)` returns a new `SseSliceState` for every known
 * event type and the SAME reference for unknown event types (no-op). The
 * reducer never mutates its inputs, which is verified by deep-freezing the
 * input state in tests.
 *
 * Order conventions:
 * - `recentErrors` is "newest first": new errors are prepended and the array
 *   is capped at 10 entries.
 * - `agents` is dedupe-by-`agent_id`. `subagentStart` upserts in place
 *   (preserving array position when an entry already exists). `subagentStop`
 *   merges payload fields onto the matching row and forces `status` to
 *   `event.payload.status ?? 'done'`.
 *
 * Ported from `hooks/dashboard/sse-payload-from-event.ts` and
 * `hooks/dashboard/merge-by-agent-id.ts`.
 */

const RECENT_ERRORS_CAP = 10

export type SseEvent =
  | { type: 'health'; payload: unknown }
  | {
      type: 'subagentStart'
      payload: { agent_id: string; agent_type: string; startedAt: number } & Record<string, unknown>
    }
  | {
      type: 'subagentStop'
      payload: { agent_id: string; stoppedAt: number; status?: string } & Record<string, unknown>
    }
  | { type: 'tool_call'; payload: { agent_kind?: string } & Record<string, unknown> }
  | { type: 'error'; payload: { message: string; ts: number } & Record<string, unknown> }
  | { type: 'conversation-snapshot'; payload: { sessions: unknown[] } & Record<string, unknown> }
  | { type: 'shutdown'; payload?: unknown }

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRow = {
  agent_id: string
  agent_type: string
  startedAt: number
  stoppedAt?: number
  status: AgentStatus
  [extra: string]: unknown
}

export type DispatchCounts = {
  explore: number
  worker: number
  total: number
}

export type SseStatus = 'idle' | 'connected' | 'reconnecting' | 'shutdown'

export type SseSliceState = {
  health: unknown | null
  agents: AgentRow[]
  backgroundTasks: unknown[]
  dispatchCounts: DispatchCounts
  recentErrors: unknown[]
  sessions: unknown[]
  sseStatus: SseStatus
}

export function reduceSseEvent(state: SseSliceState, event: SseEvent): SseSliceState {
  switch (event.type) {
    case 'health':
      return { ...state, health: event.payload, sseStatus: 'connected' }

    case 'subagentStart': {
      const incoming: AgentRow = { ...event.payload, status: 'running' }
      return { ...state, agents: upsertAgent(state.agents, incoming) }
    }

    case 'subagentStop': {
      const status: AgentStatus = isAgentStatus(event.payload.status) ? event.payload.status : 'done'
      const agents = state.agents.map((a) =>
        a.agent_id === event.payload.agent_id ? { ...a, ...event.payload, status } : a,
      )
      return { ...state, agents }
    }

    case 'tool_call': {
      const kind = event.payload.agent_kind
      const dispatchCounts: DispatchCounts = {
        explore: state.dispatchCounts.explore + (kind === 'explore' ? 1 : 0),
        worker: state.dispatchCounts.worker + (kind === 'worker' ? 1 : 0),
        total: state.dispatchCounts.total + 1,
      }
      return { ...state, dispatchCounts }
    }

    case 'error': {
      const recentErrors = [event.payload, ...state.recentErrors].slice(0, RECENT_ERRORS_CAP)
      return { ...state, recentErrors }
    }

    case 'conversation-snapshot':
      return { ...state, sessions: [...event.payload.sessions] }

    case 'shutdown':
      return { ...state, sseStatus: 'shutdown' }

    default:
      return state
  }
}

function upsertAgent(agents: AgentRow[], incoming: AgentRow): AgentRow[] {
  const idx = agents.findIndex((a) => a.agent_id === incoming.agent_id)
  if (idx === -1) return [...agents, incoming]
  const next = agents.slice()
  next[idx] = { ...next[idx], ...incoming }
  return next
}

function isAgentStatus(value: unknown): value is AgentStatus {
  return value === 'running' || value === 'done' || value === 'failed'
}

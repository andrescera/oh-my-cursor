/**
 * Typed daemon API client.
 *
 * Every function returns a discriminated `Result<T>`:
 *   - `{ ok: true; data }` on 2xx with a JSON body
 *   - `{ ok: false; error }` on http/network/parse failures
 *
 * Nothing throws. Callers decide how to surface errors (retry buttons in W2.5
 * rely on `error.kind` to decide affordances).
 *
 * Routes are sourced from `hooks/daemon.ts`; see `api.endpoints.md` for the
 * contract table. Update both sides when a route changes.
 */

export type ApiError =
  | { kind: 'http'; status: number; body?: unknown; message?: string }
  | { kind: 'network'; message: string }
  | { kind: 'parse'; message: string }

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

declare global {
  interface Window {
    OMC_DAEMON_PORT?: number
    OMC_DAEMON_TOKEN?: string
  }
}

const DEFAULT_PORT = 27847

function port(): number {
  const w = typeof window !== 'undefined' ? (window as Window) : null
  const p = w?.OMC_DAEMON_PORT
  return typeof p === 'number' && Number.isFinite(p) ? p : DEFAULT_PORT
}

function authHeaders(): Record<string, string> {
  const w = typeof window !== 'undefined' ? (window as Window) : null
  const token = w?.OMC_DAEMON_TOKEN
  return typeof token === 'string' && token !== '' ? { Authorization: `Bearer ${token}` } : {}
}

type QueryValue = string | number | undefined | null

function url(path: string, query?: Record<string, QueryValue>): string {
  const base = `http://localhost:${port()}${path}`
  if (!query) return base
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue
    usp.set(k, String(v))
  }
  const qs = usp.toString()
  return qs ? `${base}?${qs}` : base
}

const REQUEST_TIMEOUT_MS = 5000

async function request<T>(input: string, init: RequestInit = {}): Promise<Result<T>> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
      headers: { Accept: 'application/json', ...authHeaders(), ...init.headers },
    })
  } catch (err) {
    clearTimeout(timeout)
    return {
      ok: false,
      error: {
        kind: 'network',
        message:
          err instanceof Error && err.name === 'AbortError'
            ? `Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
            : err instanceof Error
              ? err.message
              : String(err),
      },
    }
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) {
    let body: unknown
    try {
      body = await res.json()
    } catch {
      try {
        body = await res.text()
      } catch {
        body = undefined
      }
    }
    return {
      ok: false,
      error: { kind: 'http', status: res.status, body, message: res.statusText },
    }
  }

  try {
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'parse', message: err instanceof Error ? err.message : String(err) },
    }
  }
}

export const getHealth = (conversationId?: string): Promise<Result<unknown>> =>
  request(url('/health', { conversationId }))

export const getSessions = (): Promise<Result<unknown>> => request(url('/sessions'))

export type SessionLogQuery = { limit?: number; session?: string }
export const getSessionLog = (q: SessionLogQuery = {}): Promise<Result<unknown>> =>
  request(url('/session-log', { limit: q.limit, session: q.session }))

export type ClearSessionLogQuery = { sessionId?: string; conversationId?: string }
export const clearSessionLog = (q: ClearSessionLogQuery = {}): Promise<Result<unknown>> =>
  request(url('/session-log/clear', { sessionId: q.sessionId, conversationId: q.conversationId }), {
    method: 'POST',
  })

export const getConfig = (): Promise<Result<unknown>> => request(url('/config'))

export const getFullConfig = (): Promise<Result<unknown>> => request(url('/config/full'))

export const saveConfig = (draft: unknown): Promise<Result<unknown>> =>
  request(url('/config'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  })

export const getBackgroundTasks = (): Promise<Result<unknown>> => request(url('/backgroundTasks'))

export type AgentHistoryQuery = { limit?: number }
export const getAgentHistory = (q: AgentHistoryQuery = {}): Promise<Result<unknown>> =>
  request(url('/agentHistory', { limit: q.limit }))

export const getChannelStatus = (): Promise<Result<unknown>> => request(url('/channel-status'))

/**
 * Introspection snapshot returned by `GET /introspection`.
 * Mirrors `IntrospectionSnapshot` in `hooks/lib/introspection-runtime.ts`.
 */
export type IntrospectionSource = 'bundle' | 'observed' | 'fallback'

export interface Introspection {
  models: string[]
  agents: string[]
  source: IntrospectionSource
  cursorVersion?: string
  cachedAt: string
  observedAdditions: string[]
}

export const getIntrospection = (): Promise<Result<Introspection>> =>
  request<Introspection>(url('/introspection'))

/**
 * One agent's routing override. Mirrors `AgentOverrideSchema` in
 * `hooks/schemas/config.ts`: `model` is a free-form slug (optional, omit =
 * inherit), `fallback_models` is an ordered chain, `disable` turns the agent
 * off entirely.
 */
export interface AgentOverride {
  model?: string
  fallback_models: string[]
  disable: boolean
}

export type AgentOverridesTarget = 'project' | 'user'

export interface AgentOverridesSavePayload {
  target: AgentOverridesTarget
  agent_overrides: Record<string, AgentOverride>
  categories?: Record<string, AgentOverride & { description?: string }>
}

export interface AgentOverridesSaveResponse {
  status: string
  path: string
  warnings: string[]
}

/**
 * `POST /config/agent-overrides`: atomic, validated write of the
 * `agent_overrides` slice. Returns 200 `{ status, path, warnings }` on success,
 * 400 `{ error }` on Zod validation failure (surfaced via `r.error.body`).
 * Token-authed via the shared `authHeaders()`.
 */
export const saveAgentOverrides = (
  payload: AgentOverridesSavePayload,
): Promise<Result<AgentOverridesSaveResponse>> =>
  request<AgentOverridesSaveResponse>(url('/config/agent-overrides'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

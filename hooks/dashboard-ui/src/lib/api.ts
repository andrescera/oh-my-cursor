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
  }
}

const DEFAULT_PORT = 27847

function port(): number {
  const w = typeof window !== 'undefined' ? (window as Window) : null
  const p = w?.OMC_DAEMON_PORT
  return typeof p === 'number' && Number.isFinite(p) ? p : DEFAULT_PORT
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

async function request<T>(input: string, init: RequestInit = {}): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetch(input, {
      ...init,
      headers: { Accept: 'application/json', ...init.headers },
    })
  } catch (err) {
    return {
      ok: false,
      error: { kind: 'network', message: err instanceof Error ? err.message : String(err) },
    }
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

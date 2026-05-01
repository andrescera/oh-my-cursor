/**
 * Thin EventSource adapter that pipes server-sent events through the pure
 * `reduceSseEvent` reducer and into a Zustand-style store, with exponential
 * backoff + jitter reconnects.
 *
 * Decoupled from the concrete dashboard store schema (W1.5 may land before
 * or after this file). The factory accepts a `store` argument with a small
 * structural contract; the projection between the store and the reducer's
 * `SseSliceState` is supplied by `projectSlice` / `applySlice` callbacks.
 *
 * TODO(W2.2): Once the W1.5 store schema settles, wire `dispatchCounts` and
 * `recentErrors` into `data` (or a dedicated slice) instead of relying on
 * caller-provided projection callbacks. See sse-reducer.ts for the canonical
 * shape.
 *
 * Reconnection logic ported from `hooks/dashboard/render.ts:441-520`:
 *   - base backoff 1000ms, max 30000ms, ×2 each retry
 *   - +random jitter (0..min(1000, backoff/4)) ms
 *   - explicit `shutdown` event closes and triggers a fast (~500ms) reconnect
 *   - reconnect is bounded by SSE_MAX_RETRIES; after that the client emits
 *     `offline` via `onStatusChange` and stops scheduling.
 */

import { reduceSseEvent, type SseEvent, type SseSliceState, type SseStatus } from './sse-reducer'

export type SseRuntimeStatus = SseStatus | 'offline'

export type SseClientStore<TState = unknown> = {
  getState: () => TState
  setState: (updater: (state: TState) => Partial<TState> | TState) => void
}

export type SseClientOpts<TState = unknown> = {
  url: string
  store?: SseClientStore<TState>
  /** Project an `SseSliceState` slice from the store's state. */
  projectSlice?: (state: TState) => SseSliceState
  /** Merge the reducer's next slice back into the store's state. */
  applySlice?: (state: TState, next: SseSliceState) => Partial<TState> | TState
  onShutdown?: () => void
  onStatusChange?: (status: SseRuntimeStatus) => void
  /** Test seam: inject a custom EventSource constructor. */
  eventSourceFactory?: (url: string) => EventSource
  /** Test seam: override jitter. Defaults to `Math.random`. */
  random?: () => number
}

const BASE_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30_000
const SHUTDOWN_RECONNECT_MS = 500
const MAX_RETRIES = 60

const EMPTY_SLICE: SseSliceState = {
  health: null,
  agents: [],
  backgroundTasks: [],
  dispatchCounts: { explore: 0, worker: 0, total: 0 },
  recentErrors: [],
  sessions: [],
  sseStatus: 'idle',
}

export type SseClient = {
  start: () => void
  stop: () => void
  readonly attemptCount: number
  readonly status: SseRuntimeStatus
}

export function createSseClient<TState>(opts: SseClientOpts<TState>): SseClient {
  const {
    url,
    store,
    projectSlice,
    applySlice,
    onShutdown,
    onStatusChange,
    eventSourceFactory = (u) => new EventSource(u),
    random = Math.random,
  } = opts

  let es: EventSource | null = null
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let alive = false
  let started = false
  let status: SseRuntimeStatus = 'idle'
  let localSlice: SseSliceState = EMPTY_SLICE

  function emitStatus(next: SseRuntimeStatus) {
    if (status === next) return
    status = next
    onStatusChange?.(next)
  }

  function clearTimer() {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function closeEs() {
    if (es) {
      try {
        es.close()
      } catch {
        // ignore
      }
      es = null
    }
  }

  function dispatch(event: SseEvent) {
    if (store && projectSlice && applySlice) {
      const current = projectSlice(store.getState())
      const next = reduceSseEvent(current, event)
      if (next !== current) {
        store.setState((s) => applySlice(s, next))
      }
      localSlice = next
    } else {
      localSlice = reduceSseEvent(localSlice, event)
    }
    emitStatus(localSlice.sseStatus)
  }

  function parseAndDispatch(raw: string, fallbackType?: SseEvent['type']) {
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    const event = coerceEvent(parsed, fallbackType)
    if (event) dispatch(event)
  }

  function connect() {
    if (!alive) return
    closeEs()
    clearTimer()

    let source: EventSource
    try {
      source = eventSourceFactory(url)
    } catch {
      scheduleReconnect()
      return
    }
    es = source

    source.onopen = () => {
      attempt = 0
      emitStatus('connected')
    }

    source.onmessage = (ev) => {
      parseAndDispatch(ev.data)
    }

    source.addEventListener('conversation-snapshot', ((ev: MessageEvent) => {
      parseAndDispatch(ev.data, 'conversation-snapshot')
    }) as EventListener)

    source.addEventListener('shutdown', (() => {
      dispatch({ type: 'shutdown' })
      onShutdown?.()
      closeEs()
      attempt = 0
      timer = setTimeout(connect, SHUTDOWN_RECONNECT_MS)
    }) as EventListener)

    source.onerror = () => {
      closeEs()
      scheduleReconnect()
    }
  }

  function scheduleReconnect() {
    if (!alive) return
    attempt += 1
    if (attempt >= MAX_RETRIES) {
      emitStatus('offline')
      return
    }
    emitStatus('reconnecting')
    const backoff = Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS)
    const jitter = Math.floor(random() * Math.min(1000, backoff / 4))
    timer = setTimeout(connect, backoff + jitter)
  }

  return {
    start() {
      if (started) return
      started = true
      alive = true
      connect()
    },
    stop() {
      alive = false
      started = false
      clearTimer()
      closeEs()
    },
    get attemptCount() {
      return attempt
    },
    get status() {
      return status
    },
  }
}

function coerceEvent(value: unknown, fallbackType?: SseEvent['type']): SseEvent | null {
  if (!value || typeof value !== 'object') return null
  if (Array.isArray(value) && fallbackType === 'conversation-snapshot') {
    return { type: 'conversation-snapshot', payload: { sessions: value } }
  }
  const obj = value as Record<string, unknown>
  const rawType = (obj.type ?? obj.event ?? fallbackType) as string | undefined
  const type = normalizeEventType(rawType)
  if (!type) return null
  if (type === 'conversation-snapshot') {
    const data = obj.data ?? obj.payload
    const sessions = Array.isArray(data)
      ? data
      : Array.isArray((data as { sessions?: unknown[] } | undefined)?.sessions)
        ? (data as { sessions: unknown[] }).sessions
        : Array.isArray(obj.sessions)
          ? obj.sessions
          : null
    if (!sessions) return null
    return { type, payload: { sessions } }
  }
  if (type === 'shutdown') {
    return { type: 'shutdown', payload: obj.payload }
  }
  const payload = (obj.payload ?? obj.data ?? obj) as Record<string, unknown>
  if (type === 'subagentStart' || type === 'subagentStop') {
    const agentId = payload.agent_id ?? payload.agentId
    const agentType = payload.agent_type ?? payload.agentType
    return {
      type,
      payload: {
        ...payload,
        agent_id: typeof agentId === 'string' ? agentId : '',
        agent_type: typeof agentType === 'string' ? agentType : '',
        startedAt: typeof payload.startedAt === 'number' ? payload.startedAt : Date.parse(String(payload.ts ?? Date.now())),
        stoppedAt: typeof payload.stoppedAt === 'number' ? payload.stoppedAt : Date.parse(String(payload.ts ?? Date.now())),
      },
    } as SseEvent
  }
  if (type === 'error') {
    return {
      type,
      payload: {
        ...payload,
        message: String(payload.message ?? payload.error ?? 'Unknown dashboard event error'),
        ts: typeof payload.ts === 'number' ? payload.ts : Date.parse(String(payload.ts ?? Date.now())),
      },
    }
  }
  return { type, payload } as SseEvent
}

function normalizeEventType(raw: string | undefined): SseEvent['type'] | null {
  if (!raw) return null
  const value = raw.startsWith('/') ? raw.slice(1) : raw
  if (
    value === 'health' ||
    value === 'subagentStart' ||
    value === 'subagentStop' ||
    value === 'tool_call' ||
    value === 'error' ||
    value === 'conversation-snapshot' ||
    value === 'shutdown'
  ) {
    return value
  }
  if (value === 'postToolUseFailure') return 'error'
  return null
}

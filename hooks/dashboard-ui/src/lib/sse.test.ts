/**
 * Integration spec for `createSseClient` ↔ dashboard Zustand store.
 *
 * The reducer (`sse-reducer.ts`) is already covered by `sse-reducer.test.ts`;
 * this file specifically exercises the writeback path that F2 P0-1 / F4
 * carryover #1 flagged: the SSE client must not just compute new slices,
 * it must merge them back into the store via `applySlice`.
 *
 * `MockEventSource` is hand-rolled (no dep) and just needs to satisfy the
 * three usages in `sse.ts`: `onopen`, `onmessage`, `addEventListener` for
 * named events, and `close()`.
 */

import { beforeEach, describe, expect, test } from 'vitest'

import { createSseClient } from './sse'
import { dashboardSseBindings } from './sse-dashboard-binding'
import {
  _resetForTests,
  useDashboardStore,
  type DashboardState,
} from '@/store/dashboard'

class MockEventSource {
  url: string
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  closed = false
  private listeners = new Map<string, Set<EventListener>>()

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, fn: EventListener) {
    let bucket = this.listeners.get(type)
    if (!bucket) {
      bucket = new Set()
      this.listeners.set(type, bucket)
    }
    bucket.add(fn)
  }

  removeEventListener(type: string, fn: EventListener) {
    this.listeners.get(type)?.delete(fn)
  }

  close() {
    this.closed = true
  }

  /** Fire `onopen` like a real EventSource would after handshake. */
  open() {
    this.onopen?.({} as Event)
  }

  /** Fire a default `message` (no event-type header) carrying JSON. */
  message(payload: unknown) {
    const ev = { data: JSON.stringify(payload) } as MessageEvent
    this.onmessage?.(ev)
  }

  /** Fire a named SSE event (event: <name>) carrying JSON. */
  named(type: string, payload: unknown) {
    const ev = { data: JSON.stringify(payload), type } as MessageEvent
    this.listeners.get(type)?.forEach((fn) => fn(ev as unknown as Event))
  }
}

function attach() {
  let mock: MockEventSource | null = null
  const client = createSseClient<DashboardState>({
    url: 'http://test/events/stream',
    ...dashboardSseBindings(),
    eventSourceFactory: (u) => {
      mock = new MockEventSource(u)
      return mock as unknown as EventSource
    },
  })
  client.start()
  if (!mock) throw new Error('eventSourceFactory was not called')
  ;(mock as MockEventSource).open()
  return { client, mock: mock as MockEventSource }
}

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

describe('createSseClient → dashboard store wiring', () => {
  test('a `health` event lands in store.data.health', () => {
    const { mock, client } = attach()

    mock.message({ type: 'health', payload: { uptime: 5, toolCalls: 7 } })

    const state = useDashboardStore.getState()
    expect(state.data.health).toEqual({ uptime: 5, toolCalls: 7 })
    expect(state.connection.sseStatus).toBe('connected')

    client.stop()
  })

  test('subagentStart appends a running agent to store.data.agents', () => {
    const { mock, client } = attach()

    mock.message({
      type: 'subagentStart',
      payload: { agent_id: 'a1', agent_type: 'explore', startedAt: 1 },
    })

    const agents = useDashboardStore.getState().data.agents
    expect(Array.isArray(agents)).toBe(true)
    expect(agents).toHaveLength(1)
    expect((agents as Array<{ agent_id: string; status: string }>)[0]).toMatchObject({
      agent_id: 'a1',
      status: 'running',
    })

    client.stop()
  })

  test('error events fan into store.data.recentErrors (newest first, capped)', () => {
    const { mock, client } = attach()

    for (let i = 0; i < 12; i++) {
      mock.message({
        type: 'error',
        payload: { message: `err-${i}`, ts: i },
      })
    }

    const errs = useDashboardStore.getState().data.recentErrors as Array<{
      message: string
    }>
    expect(errs).toHaveLength(10)
    expect(errs[0].message).toBe('err-11')
    expect(errs[9].message).toBe('err-2')

    client.stop()
  })

  test('tool_call events accumulate into store.data.dispatchCounts', () => {
    const { mock, client } = attach()

    mock.message({ type: 'tool_call', payload: { agent_kind: 'explore' } })
    mock.message({ type: 'tool_call', payload: { agent_kind: 'worker' } })
    mock.message({ type: 'tool_call', payload: { agent_kind: 'worker' } })

    expect(useDashboardStore.getState().data.dispatchCounts).toEqual({
      explore: 1,
      worker: 2,
      total: 3,
    })

    client.stop()
  })

  test('conversation-snapshot named event populates store.data.sessions', () => {
    const { mock, client } = attach()

    const sessions = [{ id: 'sess-1', startedAt: 100 }]
    mock.named('conversation-snapshot', { data: { sessions } })

    expect(useDashboardStore.getState().data.sessions).toEqual(sessions)

    client.stop()
  })

  test('shutdown event flips store.connection.sseStatus to "shutdown"', () => {
    const { mock, client } = attach()

    mock.named('shutdown', {})

    expect(useDashboardStore.getState().connection.sseStatus).toBe('shutdown')

    client.stop()
  })
})

import { describe, expect, test } from 'vitest'
import { reduceSseEvent, type SseEvent, type SseSliceState } from './sse-reducer'

const initial: SseSliceState = {
  health: null,
  agents: [],
  backgroundTasks: [],
  dispatchCounts: { explore: 0, worker: 0, total: 0 },
  recentErrors: [],
  sessions: [],
  sseStatus: 'idle',
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key])
    }
  }
  return value
}

describe('reduceSseEvent — purity', () => {
  test('unknown event returns the input by reference (no-op)', () => {
    const frozen = deepFreeze({ ...initial, recentErrors: [...initial.recentErrors] }) as SseSliceState
    const next = reduceSseEvent(frozen, { type: 'unknown' as 'shutdown' })
    expect(next).toBe(frozen)
  })

  test('does not mutate a deep-frozen input on a real event', () => {
    const frozen = deepFreeze({ ...initial, recentErrors: [...initial.recentErrors] }) as SseSliceState
    const next = reduceSseEvent(frozen, { type: 'health', payload: { uptime: 1 } } as SseEvent)
    expect(next).not.toBe(frozen)
    expect(frozen.health).toBeNull()
  })
})

describe('reduceSseEvent — health', () => {
  test('updates health slice and marks SSE connected', () => {
    const next = reduceSseEvent(initial, { type: 'health', payload: { uptime: 5, toolCalls: 2 } })
    expect(next.health).toEqual({ uptime: 5, toolCalls: 2 })
    expect(next.sseStatus).toBe('connected')
  })
})

describe('reduceSseEvent — subagentStart / subagentStop', () => {
  test('appends running agent on start', () => {
    const next = reduceSseEvent(initial, {
      type: 'subagentStart',
      payload: { agent_id: 'a1', agent_type: 'explore', startedAt: 1 },
    })
    expect(next.agents).toHaveLength(1)
    expect(next.agents[0]).toMatchObject({ agent_id: 'a1', status: 'running' })
  })

  test('dedupes by agent_id (start replaces in place)', () => {
    const s1 = reduceSseEvent(initial, {
      type: 'subagentStart',
      payload: { agent_id: 'a1', agent_type: 'explore', startedAt: 1 },
    })
    const s2 = reduceSseEvent(s1, {
      type: 'subagentStart',
      payload: { agent_id: 'a1', agent_type: 'explore', startedAt: 2 },
    })
    expect(s2.agents).toHaveLength(1)
    expect(s2.agents[0].startedAt).toBe(2)
  })

  test('stop transitions running agent to done', () => {
    const s1 = reduceSseEvent(initial, {
      type: 'subagentStart',
      payload: { agent_id: 'a1', agent_type: 'explore', startedAt: 1 },
    })
    const s2 = reduceSseEvent(s1, {
      type: 'subagentStop',
      payload: { agent_id: 'a1', stoppedAt: 2, status: 'done' },
    })
    expect(s2.agents[0]).toMatchObject({ agent_id: 'a1', status: 'done', stoppedAt: 2 })
  })

  test('stop on unknown agent_id is a no-op for that agent', () => {
    const next = reduceSseEvent(initial, {
      type: 'subagentStop',
      payload: { agent_id: 'ghost', stoppedAt: 9 },
    })
    expect(next.agents).toEqual([])
  })
})

describe('reduceSseEvent — tool_call', () => {
  test('increments explore + total counters', () => {
    const next = reduceSseEvent(initial, { type: 'tool_call', payload: { agent_kind: 'explore' } })
    expect(next.dispatchCounts.explore).toBe(1)
    expect(next.dispatchCounts.worker).toBe(0)
    expect(next.dispatchCounts.total).toBe(1)
  })

  test('increments worker + total counters', () => {
    const next = reduceSseEvent(initial, { type: 'tool_call', payload: { agent_kind: 'worker' } })
    expect(next.dispatchCounts.worker).toBe(1)
    expect(next.dispatchCounts.total).toBe(1)
  })

  test('unknown agent_kind only bumps total', () => {
    const next = reduceSseEvent(initial, { type: 'tool_call', payload: { agent_kind: 'oracle' } })
    expect(next.dispatchCounts.explore).toBe(0)
    expect(next.dispatchCounts.worker).toBe(0)
    expect(next.dispatchCounts.total).toBe(1)
  })
})

describe('reduceSseEvent — error', () => {
  test('caps recentErrors at 10 (newest first)', () => {
    let s: SseSliceState = initial
    for (let i = 0; i < 15; i++) {
      s = reduceSseEvent(s, { type: 'error', payload: { message: `err-${i}`, ts: i } })
    }
    expect(s.recentErrors).toHaveLength(10)
    expect((s.recentErrors[0] as { message: string }).message).toBe('err-14')
    expect((s.recentErrors[9] as { message: string }).message).toBe('err-5')
  })
})

describe('reduceSseEvent — conversation-snapshot', () => {
  test('replaces sessions slice', () => {
    const sessions = [{ id: 'sess-1', startedAt: 1 }]
    const next = reduceSseEvent(initial, {
      type: 'conversation-snapshot',
      payload: { sessions },
    })
    expect(next.sessions).toEqual(sessions)
  })
})

describe('reduceSseEvent — shutdown', () => {
  test('sets sseStatus to "shutdown"', () => {
    const next = reduceSseEvent(initial, { type: 'shutdown' })
    expect(next.sseStatus).toBe('shutdown')
  })
})

describe('reduceSseEvent — unknown', () => {
  test('returns the input state by reference (no-op)', () => {
    const next = reduceSseEvent(initial, { type: 'banana', payload: { foo: 1 } } as unknown as SseEvent)
    expect(next).toBe(initial)
  })
})

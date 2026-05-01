// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/react'

import SessionsTab, { type SessionRow } from './SessionsTab'
import { _resetForTests } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

const realFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>

const NOW = Date.parse('2026-05-01T12:00:00Z')

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess-axe-1234567890',
    startedAt: new Date(NOW).toISOString(),
    toolCallCount: 3,
    errorCount: 0,
    composerMode: 'agent',
    dispatchCounts: { explore: 2, worker: 1 },
    stoppedAt: null,
    recentToolTrail: [],
    ralphState: null,
    boulderState: null,
    ...overrides,
  }
}

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  mockFetch = vi.fn()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

describe('SessionsTab — axe a11y (W3.1)', () => {
  test('list render has no axe violations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([session()]))
    const { container } = render(<SessionsTab />)
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="sessions-list"]'),
      ).not.toBeNull()
    })
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('empty render has no axe violations', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse([]))
    const { container } = render(<SessionsTab />)
    await waitFor(() => {
      expect(
        container.querySelector('[data-slot="sessions-empty"]'),
      ).not.toBeNull()
    })
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})

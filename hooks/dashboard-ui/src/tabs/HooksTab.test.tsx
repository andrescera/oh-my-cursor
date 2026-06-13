import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import HooksTab from './HooksTab'
import { _resetForTests } from '@/store/dashboard'

const realFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>
let configQueue: Response[]

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  configQueue = []
  mockFetch = vi.fn((input: string) => {
    const u = String(input)
    // HooksTab embeds <ChannelMatrix />, which fetches /channel-status +
    // /introspection on mount (child effects fire before the parent's
    // /config fetch). Route by URL so the matrix never consumes a queued
    // /config response and assertions stay deterministic.
    if (u.includes('/channel-status')) return Promise.resolve(jsonResponse({ table: [] }))
    if (u.includes('/introspection')) {
      return Promise.resolve(jsonResponse({ cursorVersion: '3.7.27' }))
    }
    if (u.includes('/config')) {
      const next = configQueue.shift()
      return Promise.resolve(next ?? jsonResponse({ enabled: [], disabled: [] }))
    }
    return Promise.resolve(jsonResponse({}))
  })
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

afterEach(() => {
  cleanup()
  globalThis.fetch = realFetch
})

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function configCallCount(): number {
  return mockFetch.mock.calls.filter((call) => String(call[0]).includes('/config'))
    .length
}

describe('HooksTab', () => {
  test('renders empty-state copy when no hooks are enabled', async () => {
    configQueue.push(jsonResponse({ enabled: [], disabled: ['/preToolUse'] }))

    render(<HooksTab />)

    expect(
      await screen.findByText('No hooks enabled. Edit hooks.json to opt in.'),
    ).toBeInTheDocument()
    expect(screen.getByText('/preToolUse')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  test('renders Retry button on error and re-issues fetch on click', async () => {
    configQueue.push(new Response('boom', { status: 500 }))

    const { rerender } = render(<HooksTab />)

    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(retry).toBeInTheDocument()
    expect(configCallCount()).toBe(1)

    configQueue.push(jsonResponse({ enabled: ['/health'], disabled: [] }))
    retry.click()
    rerender(<HooksTab />)

    await waitFor(() => expect(configCallCount()).toBe(2))
    expect(await screen.findByText('/health')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  test('renders both columns with hook lists when data is present', async () => {
    configQueue.push(
      jsonResponse({
        enabled: ['/sessionStart', '/preToolUse'],
        disabled: ['/postToolUse'],
      }),
    )

    render(<HooksTab />)

    expect(await screen.findByText('/sessionStart')).toBeInTheDocument()
    expect(screen.getByText('/preToolUse')).toBeInTheDocument()
    expect(screen.getByText('/postToolUse')).toBeInTheDocument()
    expect(
      screen.queryByText('No hooks enabled. Edit hooks.json to opt in.'),
    ).toBeNull()
  })
})

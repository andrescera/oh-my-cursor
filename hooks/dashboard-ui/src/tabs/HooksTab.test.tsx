import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import HooksTab from './HooksTab'
import { _resetForTests } from '@/store/dashboard'

const realFetch = globalThis.fetch
let mockFetch: ReturnType<typeof vi.fn>

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

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('HooksTab', () => {
  test('renders empty-state copy when no hooks are enabled', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ enabled: [], disabled: ['/preToolUse'] }),
    )

    render(<HooksTab />)

    expect(
      await screen.findByText('No hooks enabled. Edit hooks.json to opt in.'),
    ).toBeInTheDocument()
    expect(screen.getByText('/preToolUse')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  test('renders Retry button on error and re-issues fetch on click', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }))

    const { rerender } = render(<HooksTab />)

    const retry = await screen.findByRole('button', { name: /retry/i })
    expect(retry).toBeInTheDocument()
    expect(mockFetch).toHaveBeenCalledTimes(1)

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ enabled: ['/health'], disabled: [] }),
    )
    retry.click()
    rerender(<HooksTab />)

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('/health')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull()
  })

  test('renders both columns with hook lists when data is present', async () => {
    mockFetch.mockResolvedValueOnce(
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

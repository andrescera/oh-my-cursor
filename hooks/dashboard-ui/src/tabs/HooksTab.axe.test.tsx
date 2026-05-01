// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import HooksTab from './HooksTab'
import { _resetForTests } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

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

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('HooksTab — axe a11y (W3.1)', () => {
  test('default render with hooks has no axe violations', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        enabled: ['/sessionStart', '/preToolUse'],
        disabled: ['/postToolUse'],
      }),
    )
    const { container } = render(<HooksTab />)
    expect(await screen.findByText('/sessionStart')).toBeInTheDocument()
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('error state has no axe violations', async () => {
    mockFetch.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const { container } = render(<HooksTab />)
    expect(
      await screen.findByRole('button', { name: /retry/i }),
    ).toBeInTheDocument()
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})

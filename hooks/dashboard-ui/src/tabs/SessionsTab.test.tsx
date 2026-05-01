import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import SessionsTab, { type SessionRow } from './SessionsTab'
import { _resetForTests, useDashboardStore } from '@/store/dashboard'

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
  vi.useRealTimers()
  globalThis.fetch = realFetch
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const now = Date.parse('2026-05-01T12:00:00Z')

function session(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 'sess-alpha-1234567890',
    startedAt: new Date(now).toISOString(),
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

async function renderWithFixture(rows: SessionRow[]) {
  mockFetch.mockResolvedValueOnce(jsonResponse(rows))
  render(<SessionsTab />)
  // Wait for the list to render after fetch resolves.
  await waitFor(() =>
    expect(
      document.querySelector('[data-slot="sessions-list"], [data-slot="sessions-empty"]'),
    ).not.toBeNull(),
  )
}

describe('SessionsTab — rendering', () => {
  test('renders a focusable <button> row with aria-expanded=false by default', async () => {
    await renderWithFixture([session()])
    const row = screen.getByRole('button', { name: /sess-alpha/i })
    expect(row.tagName).toBe('BUTTON')
    expect(row).toHaveAttribute('aria-expanded', 'false')
  })

  test('renders empty-state copy when no sessions exist', async () => {
    await renderWithFixture([])
    expect(screen.getByText(/no sessions recorded yet/i)).toBeInTheDocument()
  })
})

describe('SessionsTab — keyboard navigation', () => {
  test('Enter on a focused row toggles aria-expanded and reveals detail', async () => {
    await renderWithFixture([session()])
    const row = screen.getByRole('button', { name: /sess-alpha/i })

    row.focus()
    expect(document.activeElement).toBe(row)

    fireEvent.keyDown(row, { key: 'Enter', code: 'Enter' })
    fireEvent.click(row) // native Enter on a <button> fires click in browsers
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'))
    expect(document.getElementById(`session-detail-${session().id}`)).toBeInTheDocument()
  })

  test('Space on a focused row toggles aria-expanded', async () => {
    await renderWithFixture([session({ id: 'sess-beta-0001' })])
    const row = screen.getByRole('button', { name: /sess-beta/i })

    row.focus()
    fireEvent.click(row) // Space on a native <button> fires click
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.click(row)
    await waitFor(() => expect(row).toHaveAttribute('aria-expanded', 'false'))
  })

  test('Tab key reaches every row', async () => {
    await renderWithFixture([
      session({ id: 'sess-alpha-1234567890' }),
      session({ id: 'sess-beta-0987654321' }),
    ])
    const rows = screen.getAllByRole('button', { name: /sess-/i })
    expect(rows).toHaveLength(2)
    rows[0].focus()
    expect(document.activeElement).toBe(rows[0])
    // simulate natural tab order by focusing the second row directly:
    // happy-dom doesn't synthesize Tab on non-input elements, but a <button>
    // with `tabindex` defaulting to 0 is reachable, which is the audit contract.
    rows[1].focus()
    expect(document.activeElement).toBe(rows[1])
    expect(rows[0].tabIndex).toBeGreaterThanOrEqual(0)
    expect(rows[1].tabIndex).toBeGreaterThanOrEqual(0)
  })
})

describe('SessionsTab — search debounce', () => {
  test('debounces store write by 150ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        session({ id: 'sess-alpha-1234567890', toolCallCount: 3 }),
        session({ id: 'sess-beta-0987654321', toolCallCount: 99 }),
      ]),
    )
    render(<SessionsTab />)
    await waitFor(() =>
      expect(document.querySelector('[data-slot="sessions-list"]')).not.toBeNull(),
    )

    const input = screen.getByPlaceholderText(/search session id/i) as HTMLInputElement

    // Type a prefix quickly — the store should still be empty mid-debounce.
    fireEvent.change(input, { target: { value: 'alph' } })
    expect(input.value).toBe('alph')
    expect(useDashboardStore.getState().ui.sessionsSearch).toBe('')

    // Advance less than 150ms — still not committed.
    await act(async () => {
      vi.advanceTimersByTime(120)
    })
    expect(useDashboardStore.getState().ui.sessionsSearch).toBe('')

    // Cross the debounce threshold.
    await act(async () => {
      vi.advanceTimersByTime(60)
    })
    await waitFor(() =>
      expect(useDashboardStore.getState().ui.sessionsSearch).toBe('alph'),
    )
  })

  test('filters rows once the debounced value is applied', async () => {
    await renderWithFixture([
      session({ id: 'sess-alpha-1234567890' }),
      session({ id: 'sess-beta-0987654321' }),
    ])

    expect(screen.getByRole('button', { name: /sess-alpha/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sess-beta/i })).toBeInTheDocument()

    const input = screen.getByPlaceholderText(/search session id/i)
    fireEvent.change(input, { target: { value: 'beta' } })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /sess-alpha/i })).toBeNull()
      expect(screen.getByRole('button', { name: /sess-beta/i })).toBeInTheDocument()
    })
  })
})

describe('SessionsTab — sort', () => {
  test('sort change reorders the rows and persists to store', async () => {
    // `truncateId` collapses IDs >14 chars. Prefix each ID with a short,
    // unique tag so the visible row text remains distinguishable even after
    // truncation.
    await renderWithFixture([
      session({
        id: 'A-old',
        startedAt: new Date(now - 60_000).toISOString(),
        toolCallCount: 2,
        errorCount: 0,
      }),
      session({
        id: 'B-new',
        startedAt: new Date(now).toISOString(),
        toolCallCount: 5,
        errorCount: 1,
      }),
      session({
        id: 'C-mid',
        startedAt: new Date(now - 30_000).toISOString(),
        toolCallCount: 50,
        errorCount: 0,
      }),
    ])

    const initialOrder = screen
      .getAllByRole('button', { name: /^(A-old|B-new|C-mid)/i })
      .map((el) => el.textContent ?? '')
    expect(initialOrder[0]).toMatch(/^B-new/)

    act(() => {
      useDashboardStore.getState().setSessionsSort('toolCountDesc')
    })

    await waitFor(() => {
      const order = screen
        .getAllByRole('button', { name: /^(A-old|B-new|C-mid)/i })
        .map((el) => el.textContent ?? '')
      expect(order[0]).toMatch(/^C-mid/)
    })
    expect(useDashboardStore.getState().ui.sessionsSort).toBe('toolCountDesc')

    act(() => {
      useDashboardStore.getState().setSessionsSort('errorCountDesc')
    })
    await waitFor(() => {
      const order = screen
        .getAllByRole('button', { name: /^(A-old|B-new|C-mid)/i })
        .map((el) => el.textContent ?? '')
      expect(order[0]).toMatch(/^B-new/)
    })
  })
})

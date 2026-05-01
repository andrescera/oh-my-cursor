/**
 * Behaviour tests for the W2.5 Events tab. Three buckets mapped to the spec:
 *   - Keyboard: focus + Enter expansion (P0-2, QA "Tab reaches every row").
 *   - Inline confirm: replaces native `confirm()` (P1-3 / AB-3).
 *   - aria-live container (P2-11).
 *
 * Mocks:
 *   - `@/lib/api` — so nothing hits a real daemon.
 *   - `sonner`    — avoids mounting `<Toaster>` (+ `next-themes`) in tests;
 *                   we assert the call site + action invocation instead.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

// Mocks are hoisted above every import the test file makes. `vi.mock`
// itself is lifted to the top of the module, so the factory cannot close
// over lexical variables unless they're wrapped in `vi.hoisted`.
const { sonnerToast, apiMocks } = vi.hoisted(() => {
  const toastFn = Object.assign(
    vi.fn() as unknown as (...args: unknown[]) => void,
    {
      success: vi.fn(),
      error: vi.fn(),
    },
  )
  return {
    sonnerToast: toastFn,
    apiMocks: {
      getSessionLog: vi.fn(),
      clearSessionLog: vi.fn(),
    },
  }
})

vi.mock('sonner', () => ({ toast: sonnerToast }))
vi.mock('@/lib/api', () => apiMocks)

import EventsTab from './EventsTab'
import { _resetForTests, useDashboardStore } from '@/store/dashboard'

const SAMPLE_EVENTS = [
  {
    ts: 1_700_000_000_000,
    event: 'PreToolUse',
    tool: 'Read',
    action: 'approve',
    meta: { file: 'a.txt' },
  },
  {
    ts: 1_700_000_001_000,
    event: 'PreToolUse',
    tool: 'Edit',
    action: 'deny',
    error: 'denied by policy',
  },
  {
    ts: 1_700_000_002_000,
    event: '/dispatch',
    tool: 'Task',
    agentType: 'explore',
    action: 'approve',
  },
] as const

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  sonnerToast.mockReset()
  sonnerToast.success.mockReset()
  sonnerToast.error.mockReset()
  apiMocks.getSessionLog.mockReset()
  apiMocks.clearSessionLog.mockReset()
})

afterEach(() => {
  cleanup()
})

async function renderReady() {
  apiMocks.getSessionLog.mockResolvedValueOnce({
    ok: true,
    data: [...SAMPLE_EVENTS],
  })
  const utils = render(<EventsTab />)
  await waitFor(() => {
    expect(screen.getByTestId('events-list')).toBeInTheDocument()
  })
  return utils
}

describe('EventsTab — keyboard interaction (P0-2)', () => {
  test('rows render as focusable buttons; Enter expands detail', async () => {
    await renderReady()

    const rows = screen.getAllByTestId('event-row')
    expect(rows).toHaveLength(SAMPLE_EVENTS.length)
    for (const row of rows) {
      expect(row.tagName).toBe('BUTTON')
      expect(row).toHaveAttribute('aria-expanded', 'false')
      // Not `tabIndex=-1`: natively focusable in tab order.
      expect(row).not.toHaveAttribute('tabindex', '-1')
    }

    rows[0].focus()
    expect(document.activeElement).toBe(rows[0])

    // Native <button> translates Enter/Space keydown into a synthetic click
    // in real browsers, but jsdom/happy-dom don't — dispatch click directly
    // to assert the handler wiring. aria-expanded must flip.
    fireEvent.click(rows[0])
    await waitFor(() => {
      expect(rows[0]).toHaveAttribute('aria-expanded', 'true')
    })
    expect(screen.getByTestId('event-detail')).toBeInTheDocument()

    fireEvent.click(rows[0])
    await waitFor(() => {
      expect(rows[0]).toHaveAttribute('aria-expanded', 'false')
    })
    expect(screen.queryByTestId('event-detail')).not.toBeInTheDocument()
  })

  test('search input responds to the `/` global shortcut', async () => {
    await renderReady()
    const search = screen.getByTestId('events-search') as HTMLInputElement
    expect(document.activeElement).not.toBe(search)
    window.dispatchEvent(new Event('omc-focus-events-search'))
    await waitFor(() => {
      expect(document.activeElement).toBe(search)
    })
  })
})

describe('EventsTab — inline-confirm Clear (P1-3 / AB-3)', () => {
  test('Cancel reverts to Clear without calling the API', async () => {
    await renderReady()
    fireEvent.click(screen.getByTestId('events-clear'))
    expect(screen.getByTestId('events-clear-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('events-clear-cancel')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('events-clear-cancel'))
    expect(screen.queryByTestId('events-clear-confirm')).not.toBeInTheDocument()
    expect(screen.getByTestId('events-clear')).toBeInTheDocument()
    expect(apiMocks.clearSessionLog).not.toHaveBeenCalled()
  })

  test('Confirm clears the log and wires an Undo action on the toast', async () => {
    apiMocks.clearSessionLog.mockResolvedValueOnce({
      ok: true,
      data: { status: 'cleared' },
    })
    await renderReady()

    const before = useDashboardStore.getState().data.events as unknown[]
    expect(before).toHaveLength(SAMPLE_EVENTS.length)

    fireEvent.click(screen.getByTestId('events-clear'))
    fireEvent.click(screen.getByTestId('events-clear-confirm'))

    await waitFor(() => {
      expect(apiMocks.clearSessionLog).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(useDashboardStore.getState().data.events).toEqual([])
    })
    await waitFor(() => {
      expect(sonnerToast).toHaveBeenCalled()
    })

    const call = sonnerToast.mock.calls.at(-1)!
    expect(call[0]).toBe('Events cleared')
    const opts = call[1] as {
      duration?: number
      action?: { label: string; onClick: () => void }
    }
    expect(opts.duration).toBe(5000)
    expect(opts.action?.label).toBe('Undo')

    opts.action!.onClick()
    expect(useDashboardStore.getState().data.events).toHaveLength(
      SAMPLE_EVENTS.length,
    )
  })
})

describe('EventsTab — aria-live container (P2-11)', () => {
  test('event list has aria-live="polite" and aria-atomic="false"', async () => {
    await renderReady()
    const list = screen.getByTestId('events-list')
    expect(list).toHaveAttribute('aria-live', 'polite')
    expect(list).toHaveAttribute('aria-atomic', 'false')
    expect(list).toHaveAttribute('role', 'log')
  })
})

describe('EventsTab — retry on fetch failure (P1-1)', () => {
  test('renders error state with Retry button and recovers on retry', async () => {
    apiMocks.getSessionLog
      .mockResolvedValueOnce({
        ok: false,
        error: { kind: 'network', message: 'ECONNREFUSED' },
      })
      .mockResolvedValueOnce({ ok: true, data: [...SAMPLE_EVENTS] })

    render(<EventsTab />)

    await waitFor(() => {
      expect(screen.getByTestId('events-error')).toBeInTheDocument()
    })
    // Error surface must NOT be silent: message is visible + retry available.
    expect(screen.getByText(/Failed to load events/i)).toBeInTheDocument()
    expect(screen.getByTestId('events-retry')).toBeInTheDocument()
    expect(screen.queryByTestId('events-list')).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('events-retry'))
    await waitFor(() => {
      expect(screen.getByTestId('events-list')).toBeInTheDocument()
    })
    expect(screen.getAllByTestId('event-row')).toHaveLength(
      SAMPLE_EVENTS.length,
    )
    expect(apiMocks.getSessionLog).toHaveBeenCalledTimes(2)
  })
})

describe('EventsTab — filter persistence (P2-5)', () => {
  test('filter chip selection updates and persists through store', async () => {
    await renderReady()
    fireEvent.click(screen.getByTestId('events-filter-errors'))
    expect(useDashboardStore.getState().ui.eventsFilter).toBe('errors')
    // Only the deny event has an error snippet → filter narrows the list.
    await waitFor(() => {
      expect(screen.getAllByTestId('event-row')).toHaveLength(1)
    })
  })
})

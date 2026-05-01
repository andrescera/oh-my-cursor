/**
 * Round-trip spec for the global `/` shortcut.
 *
 * The Shell-side dispatcher and the EventsTab-side listener must agree
 * on the custom event name. Unit tests on each side in isolation
 * (Shell-only or EventsTab-only) cannot catch the mismatch — that's
 * exactly how the original `events-search-focus` ↔
 * `omc-focus-events-search` drift shipped. This spec mounts both ends
 * in the same render tree and presses `/` on `window`, so any future
 * rename that breaks the contract fails here.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    getHealth: vi.fn(),
    getSessions: vi.fn(),
    getSessionLog: vi.fn(),
    clearSessionLog: vi.fn(),
    getConfig: vi.fn(),
    getFullConfig: vi.fn(),
    saveConfig: vi.fn(),
    getBackgroundTasks: vi.fn(),
    getAgentHistory: vi.fn(),
  },
}))

vi.mock('@/lib/api', () => apiMocks)
vi.mock('sonner', () => ({ toast: vi.fn() }))

import { TooltipProvider } from '@/components/ui/tooltip'
import Shell from '@/components/Shell'
import { _resetForTests, useDashboardStore } from '@/store/dashboard'

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  apiMocks.getSessionLog.mockResolvedValue({ ok: true, data: [] })
  apiMocks.clearSessionLog.mockResolvedValue({
    ok: true,
    data: { status: 'cleared' },
  })
})

afterEach(() => {
  cleanup()
  for (const fn of Object.values(apiMocks)) fn.mockReset()
})

describe('Shell ↔ EventsTab `/` shortcut round trip', () => {
  test('pressing `/` on window focuses the events search input', async () => {
    useDashboardStore.getState().setActiveTab('events')

    render(
      <TooltipProvider>
        <Shell enableSse={false} />
      </TooltipProvider>,
    )

    const search = (await screen.findByTestId(
      'events-search',
    )) as HTMLInputElement
    expect(document.activeElement).not.toBe(search)

    fireEvent.keyDown(window, { key: '/' })

    await waitFor(() => {
      expect(document.activeElement).toBe(search)
    })
  })
})

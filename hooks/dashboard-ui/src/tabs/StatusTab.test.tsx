import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { _resetForTests, useDashboardStore } from '@/store/dashboard'

const getHealthMock = vi.fn()

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
  return {
    ...actual,
    getHealth: (...args: unknown[]) => getHealthMock(...args),
  }
})

import StatusTab from './StatusTab'

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  getHealthMock.mockReset()
  getHealthMock.mockResolvedValue({
    ok: true,
    data: {
      uptime: 42,
      toolCalls: 7,
      currentConversationId: 'conv-abc',
      conversations: 1,
      exploreCounts: 4,
      workerCounts: 2,
      continuationLoopsActive: 0,
    },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

async function flushHealth() {
  // First render kicks off the initial fetch effect; await the resolution
  // so the loading skeleton is replaced with the real card body.
  await waitFor(() =>
    expect(screen.queryByText('System status')).toBeInTheDocument(),
  )
}

describe('StatusTab: sparklines', () => {
  test('renders sparkline given mock health data', async () => {
    useDashboardStore.getState().setDispatchCounts({
      explore: 3,
      worker: 1,
      total: 4,
    })

    render(<StatusTab />)
    await flushHealth()

    // Push a couple more samples so the ring has ≥2 entries (sparkline floor).
    act(() => {
      useDashboardStore
        .getState()
        .setDispatchCounts({ explore: 5, worker: 2, total: 7 })
    })
    act(() => {
      useDashboardStore
        .getState()
        .setDispatchCounts({ explore: 8, worker: 4, total: 12 })
    })

    await waitFor(() => {
      const svgs = screen.getAllByTestId('sparkline')
      expect(svgs.length).toBeGreaterThanOrEqual(2)
      const polylines = document.querySelectorAll('svg polyline')
      expect(polylines.length).toBeGreaterThanOrEqual(2)
      const points = polylines[0].getAttribute('points') ?? ''
      expect(points).toMatch(/^[\d., ]+$/)
      expect(points.split(' ').length).toBeGreaterThanOrEqual(2)
    })
  })
})

describe('StatusTab: SSE resync (P1-7)', () => {
  test('transition offline -> connected triggers refetch', async () => {
    useDashboardStore.getState().setSseStatus('reconnecting')

    render(<StatusTab />)
    await flushHealth()

    expect(getHealthMock).toHaveBeenCalledTimes(1)

    act(() => {
      useDashboardStore.getState().setSseStatus('connected')
    })

    await waitFor(() => {
      expect(getHealthMock).toHaveBeenCalledTimes(2)
    })

    // Going connected -> connected does NOT re-fire.
    act(() => {
      useDashboardStore.getState().setSseStatus('connected')
    })
    expect(getHealthMock).toHaveBeenCalledTimes(2)

    // Going connected -> reconnecting -> connected fires the second resync.
    act(() => {
      useDashboardStore.getState().setSseStatus('reconnecting')
    })
    act(() => {
      useDashboardStore.getState().setSseStatus('connected')
    })
    await waitFor(() => {
      expect(getHealthMock).toHaveBeenCalledTimes(3)
    })
  })
})

describe('StatusTab: connected indicator (P0-4)', () => {
  test('reflects store sseStatus rather than local flag', async () => {
    useDashboardStore.getState().setSseStatus('reconnecting')
    render(<StatusTab />)
    await flushHealth()

    const badge = screen.getByTestId('sse-status')
    expect(badge.dataset.status).toBe('reconnecting')

    act(() => {
      useDashboardStore.getState().setSseStatus('shutdown')
    })
    expect(screen.getByTestId('sse-status').dataset.status).toBe('shutdown')
  })
})

describe('StatusTab: view all errors', () => {
  test('clicking the link sets eventsFilter and switches to events tab', async () => {
    render(<StatusTab />)
    await flushHealth()

    screen.getByTestId('view-all-errors').click()

    expect(useDashboardStore.getState().ui.eventsFilter).toBe('errors')
    expect(useDashboardStore.getState().ui.activeTab).toBe('events')
  })
})

describe('StatusTab: error retry (P1-1)', () => {
  test('shows retry button when getHealth fails, refetches on click', async () => {
    getHealthMock.mockReset()
    getHealthMock.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'network', message: 'boom' },
    })

    render(<StatusTab />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/Could not reach daemon/i)).toBeInTheDocument()
    expect(screen.getByText(/oh-my-cursor start/i)).toBeInTheDocument()

    getHealthMock.mockResolvedValueOnce({
      ok: true,
      data: { uptime: 9, toolCalls: 1 },
    })

    screen.getByRole('button', { name: /retry/i }).click()
    await waitFor(() => {
      expect(screen.getByText('System status')).toBeInTheDocument()
    })
    expect(getHealthMock).toHaveBeenCalledTimes(2)
  })
})

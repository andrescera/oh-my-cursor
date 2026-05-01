import { act, cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import BackgroundTab from './BackgroundTab'
import { _resetForTests, useDashboardStore } from '@/store/dashboard'

const NOW = 1_700_000_000_000
const SECOND = 1_000

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function seedTasks(tasks: unknown[]): void {
  useDashboardStore.getState().setBackgroundTasks(tasks)
}

function activeSection(): HTMLElement {
  return screen.getByText('Active').closest('[data-slot="bg-active"]') as HTMLElement
}

function recentSection(): HTMLElement {
  return screen.getByText('Recent').closest('[data-slot="bg-recent"]') as HTMLElement
}

describe('BackgroundTab', () => {
  test('splits tasks into Active vs Recent (visually distinct sections)', () => {
    seedTasks([
      {
        agentId: 'a-1',
        agentType: 'explore',
        description: 'searching files',
        status: 'running',
        startTime: NOW - 5 * SECOND,
      },
      {
        agentId: 'a-2',
        agentType: 'worker',
        description: 'building bundle',
        status: 'completed',
        startTime: NOW - 30 * SECOND,
        stoppedAt: NOW - 10 * SECOND,
      },
      {
        agentId: 'a-3',
        agentType: 'oracle',
        description: 'analyzing diff',
        status: 'failed',
        startTime: NOW - 40 * SECOND,
        stoppedAt: NOW - 20 * SECOND,
      },
    ])

    render(<BackgroundTab />)

    const active = activeSection()
    const recent = recentSection()

    expect(active).not.toBe(recent)

    expect(within(active).getByText('searching files')).toBeInTheDocument()
    expect(within(active).queryByText('building bundle')).toBeNull()
    expect(within(active).queryByText('analyzing diff')).toBeNull()

    expect(within(recent).getByText('building bundle')).toBeInTheDocument()
    expect(within(recent).getByText('analyzing diff')).toBeInTheDocument()
    expect(within(recent).queryByText('searching files')).toBeNull()

    expect(
      within(active).getByText('1', { selector: '[data-slot="bg-active-count"]' }),
    ).toBeInTheDocument()
    expect(
      within(recent).getByText('2', { selector: '[data-slot="bg-recent-count"]' }),
    ).toBeInTheDocument()
  })

  test('auto-prune ON drops finished tasks older than 60s; toggle OFF restores them', () => {
    seedTasks([
      {
        agentId: 'fresh',
        agentType: 'worker',
        description: 'fresh result',
        status: 'completed',
        startTime: NOW - 90 * SECOND,
        stoppedAt: NOW - 30 * SECOND,
      },
      {
        agentId: 'stale',
        agentType: 'worker',
        description: 'stale result',
        status: 'completed',
        startTime: NOW - 5 * 60 * SECOND,
        stoppedAt: NOW - 2 * 60 * SECOND,
      },
    ])

    render(<BackgroundTab />)

    const recent = recentSection()
    expect(within(recent).getByText('fresh result')).toBeInTheDocument()
    expect(within(recent).queryByText('stale result')).toBeNull()
    expect(
      within(recent).getByText('1', { selector: '[data-slot="bg-recent-count"]' }),
    ).toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: /auto-prune/i })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')

    act(() => {
      toggle.click()
    })

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(useDashboardStore.getState().ui.backgroundAutoPrune).toBe(false)

    const recentAfter = recentSection()
    expect(within(recentAfter).getByText('fresh result')).toBeInTheDocument()
    expect(within(recentAfter).getByText('stale result')).toBeInTheDocument()
    expect(
      within(recentAfter).getByText('2', { selector: '[data-slot="bg-recent-count"]' }),
    ).toBeInTheDocument()
  })

  test('auto-prune ON: a task that was fresh ages out after 60s on the next refresh tick', () => {
    seedTasks([
      {
        agentId: 'aging',
        agentType: 'worker',
        description: 'will expire',
        status: 'completed',
        startTime: NOW - 30 * SECOND,
        stoppedAt: NOW - 10 * SECOND,
      },
    ])

    render(<BackgroundTab />)

    expect(within(recentSection()).getByText('will expire')).toBeInTheDocument()

    act(() => {
      vi.setSystemTime(NOW + 90 * SECOND)
      vi.advanceTimersByTime(30_000)
    })

    expect(within(recentSection()).queryByText('will expire')).toBeNull()
    expect(
      within(recentSection()).getByText('0', {
        selector: '[data-slot="bg-recent-count"]',
      }),
    ).toBeInTheDocument()
  })

  test('renders empty-state copy when there are no tasks at all', () => {
    seedTasks([])
    render(<BackgroundTab />)
    expect(screen.getByText('No active background tasks.')).toBeInTheDocument()
    expect(
      screen.getByText('No finished tasks in the last 60s.'),
    ).toBeInTheDocument()
  })
})

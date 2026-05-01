// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

const { sonnerToast, apiMocks } = vi.hoisted(() => {
  const toastFn = Object.assign(
    vi.fn() as unknown as (...args: unknown[]) => void,
    { success: vi.fn(), error: vi.fn() },
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
import { _resetForTests } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

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

describe('EventsTab: axe a11y (W3.1)', () => {
  test('ready render has no axe violations', async () => {
    apiMocks.getSessionLog.mockResolvedValueOnce({
      ok: true,
      data: [...SAMPLE_EVENTS],
    })
    const { container } = render(<EventsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('events-list')).toBeInTheDocument()
    })
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('error state has no axe violations', async () => {
    apiMocks.getSessionLog.mockResolvedValueOnce({
      ok: false,
      error: { kind: 'network', message: 'ECONNREFUSED' },
    })
    const { container } = render(<EventsTab />)
    await waitFor(() => {
      expect(screen.getByTestId('events-error')).toBeInTheDocument()
    })
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})

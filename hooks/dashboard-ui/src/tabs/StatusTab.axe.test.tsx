// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'

import { _resetForTests } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

const getHealthMock = vi.fn()

vi.mock('@/lib/api', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api')>('@/lib/api')
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
      currentConversationId: 'conv-axe',
      conversations: 1,
      exploreCounts: 4,
      workerCounts: 2,
      continuationLoopsActive: 0,
    },
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('StatusTab: axe a11y (W3.1)', () => {
  test('ready render has no axe violations', async () => {
    const { container } = render(<StatusTab />)
    await waitFor(() => {
      expect(screen.getByText('System status')).toBeInTheDocument()
    })
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('loading skeleton render has no axe violations', async () => {
    // First call never resolves so the skeleton stays mounted.
    getHealthMock.mockReset()
    getHealthMock.mockReturnValue(new Promise(() => {}))
    const { container } = render(<StatusTab />)
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})

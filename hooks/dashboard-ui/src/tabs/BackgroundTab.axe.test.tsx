// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import BackgroundTab from './BackgroundTab'
import { _resetForTests, useDashboardStore } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

const NOW = 1_700_000_000_000
const SECOND = 1_000

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

afterEach(() => {
  cleanup()
})

describe('BackgroundTab — axe a11y (W3.1)', () => {
  test('empty render has no axe violations', async () => {
    const { container } = render(<BackgroundTab />)
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('populated render has no axe violations', async () => {
    useDashboardStore.getState().setBackgroundTasks([
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
    ])
    const { container } = render(<BackgroundTab />)
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})

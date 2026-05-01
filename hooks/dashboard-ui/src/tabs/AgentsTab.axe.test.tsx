// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { cleanup, render } from '@testing-library/react'

import AgentsTab, { type AgentBar } from './AgentsTab'
import { _resetForTests } from '@/store/dashboard'
import { axeComponent } from '@/test-utils/axe'

const NOW = 1_700_000_000_000

const FIXTURE: AgentBar[] = [
  {
    id: 'a-running',
    type: 'explore',
    description: 'Surveying the auth module',
    startedAt: NOW,
    stoppedAt: null,
    status: 'running',
  },
  {
    id: 'a-done',
    type: 'sisyphus-junior',
    description: 'Wrote the migration',
    startedAt: NOW + 500,
    stoppedAt: NOW + 2_500,
    status: 'done',
  },
]

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

afterEach(() => {
  cleanup()
})

describe('AgentsTab: axe a11y (W3.1)', () => {
  test('Gantt view render has no axe violations', async () => {
    const { container } = render(
      <AgentsTab agents={FIXTURE} totalCount={2} />,
    )
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })

  test('empty Gantt render has no axe violations', async () => {
    const { container } = render(<AgentsTab agents={[]} totalCount={0} />)
    const results = await axeComponent(container)
    expect(results).toHaveNoViolations()
  })
})

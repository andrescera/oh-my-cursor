/**
 * AgentsTab tests.
 *
 * Render strategy: pass `agents` + `totalCount` props to bypass the
 * /agentHistory fetch and the 250ms ticker (driven by `liveTicker`
 * defaulting to false when `agents` is supplied). That keeps the test
 * deterministic: the geometry math is the only thing under examination.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import AgentsTab, { type AgentBar } from './AgentsTab'
import { _resetForTests } from '@/store/dashboard'

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
  {
    id: 'a-failed',
    type: 'oracle',
    description: 'Strategy consult',
    startedAt: NOW + 1_000,
    stoppedAt: NOW + 1_800,
    status: 'failed',
    errorContext: 'rate limited',
  },
]

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

afterEach(() => {
  cleanup()
})

function getBarFor(id: string): SVGRectElement {
  const wrapper = document.querySelector(
    `[data-slot="agents-gantt-bar"][data-agent-id="${id}"]`,
  )
  expect(wrapper).not.toBeNull()
  const rect = wrapper!.querySelector('rect')
  expect(rect).not.toBeNull()
  return rect as SVGRectElement
}

describe('AgentsTab: Gantt geometry', () => {
  test('renders one rect per agent with correct status fills', () => {
    render(<AgentsTab agents={FIXTURE} totalCount={42} />)
    expect(getBarFor('a-running').getAttribute('fill')).toBe(
      'var(--status-running)',
    )
    expect(getBarFor('a-done').getAttribute('fill')).toBe('var(--status-ok)')
    expect(getBarFor('a-failed').getAttribute('fill')).toBe(
      'var(--status-error)',
    )
  })

  test('positions bars by startedAt; widths track duration', () => {
    // Use a fully-bounded fixture (no running rows) so geometry is fully
    // deterministic: `now` doesn't enter the math when every agent has
    // a `stoppedAt`.
    const bounded: AgentBar[] = [
      { ...FIXTURE[1]!, status: 'done' }, // 0..2000  startedAt=NOW+500 stoppedAt=NOW+2500
      { ...FIXTURE[2]!, status: 'failed' }, // 500..1300 startedAt=NOW+1000 stoppedAt=NOW+1800
    ]
    render(<AgentsTab agents={bounded} totalCount={2} />)

    // Two bars; first should start at the left padding (x=12), the second
    // should start later because its startedAt is +500ms into the range.
    const first = getBarFor('a-done')
    const second = getBarFor('a-failed')

    const x1 = Number(first.getAttribute('x'))
    const x2 = Number(second.getAttribute('x'))
    const w1 = Number(first.getAttribute('width'))
    const w2 = Number(second.getAttribute('width'))

    // First bar starts at the left padding.
    expect(x1).toBeCloseTo(12, 5)
    // Second bar starts after the first (it began later in real time).
    expect(x2).toBeGreaterThan(x1)
    // The longer bar (2000ms) should be wider than the shorter (800ms).
    expect(w1).toBeGreaterThan(w2)
    // First bar spans the full usable width because it bounds the range.
    expect(x1 + w1).toBeCloseTo(1000 - 12, 5)
  })

  test('agents are sorted by startedAt ascending', () => {
    const unordered: AgentBar[] = [FIXTURE[2]!, FIXTURE[0]!, FIXTURE[1]!]
    render(<AgentsTab agents={unordered} totalCount={3} />)
    const groups = Array.from(
      document.querySelectorAll('[data-slot="agents-gantt-bar"]'),
    )
    const ids = groups.map((g) => g.getAttribute('data-agent-id'))
    expect(ids).toEqual(['a-running', 'a-done', 'a-failed'])
  })
})

describe('AgentsTab: view toggle + list view', () => {
  test('Gantt is the default view; toggling reveals the table', () => {
    render(<AgentsTab agents={FIXTURE} totalCount={42} />)

    expect(document.querySelector('[data-slot="agents-gantt"]')).not.toBeNull()
    expect(document.querySelector('[data-slot="agents-list"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'List' }))

    expect(document.querySelector('[data-slot="agents-gantt"]')).toBeNull()
    const list = document.querySelector('[data-slot="agents-list"]')
    expect(list).not.toBeNull()

    const rows = within(list as HTMLElement).getAllByRole('row')
    // 1 header row + 3 data rows
    expect(rows).toHaveLength(4)
    expect(within(list as HTMLElement).getByText('explore')).toBeInTheDocument()
    expect(
      within(list as HTMLElement).getByText('sisyphus-junior'),
    ).toBeInTheDocument()
    expect(within(list as HTMLElement).getByText('oracle')).toBeInTheDocument()
  })
})

describe('AgentsTab: accessibility', () => {
  test('SVG advertises a role and label; bars expose aria-labels', () => {
    render(<AgentsTab agents={FIXTURE} totalCount={42} />)

    const svg = screen.getByRole('img', { name: /agent gantt waterfall/i })
    expect(svg.tagName.toLowerCase()).toBe('svg')

    const triggers = document.querySelectorAll('[data-testid^="agent-bar-"]')
    expect(triggers).toHaveLength(3)
    triggers.forEach((el) => {
      expect(el.getAttribute('aria-label')).toBeTruthy()
    })

    expect(
      screen.getByRole('button', { name: /explore running/i }),
    ).toBeInTheDocument()
  })

  test('view toggle is a labelled group with both buttons reachable', () => {
    render(<AgentsTab agents={FIXTURE} totalCount={42} />)
    const group = screen.getByRole('group', { name: /agents view/i })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Gantt', 'List'])
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[1]!.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('AgentsTab: history cap label (P1-8)', () => {
  test('reads "Showing N most recent of M total" from props', () => {
    render(<AgentsTab agents={FIXTURE} totalCount={137} />)
    expect(screen.getByTestId('agents-history-cap-label')).toHaveTextContent(
      'Showing 3 most recent of 137 total',
    )
  })

  test('falls back to shown count when totalCount is omitted', () => {
    render(<AgentsTab agents={FIXTURE} />)
    expect(screen.getByTestId('agents-history-cap-label')).toHaveTextContent(
      'Showing 3 most recent of 3 total',
    )
  })
})

describe('AgentsTab: empty + loading states', () => {
  test('seeded with no agents shows empty-state copy in Gantt view', () => {
    render(<AgentsTab agents={[]} totalCount={0} />)
    expect(
      document.querySelector('[data-slot="agents-gantt-empty"]'),
    ).not.toBeNull()
    expect(screen.getByTestId('agents-history-cap-label')).toHaveTextContent(
      'Showing 0 most recent of 0 total',
    )
  })

  test('list view also renders empty state', () => {
    render(<AgentsTab agents={[]} totalCount={0} />)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    expect(
      document.querySelector('[data-slot="agents-list-empty"]'),
    ).not.toBeNull()
  })
})

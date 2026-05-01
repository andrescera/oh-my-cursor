import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import Shell from '@/components/Shell'
import { _resetForTests, useDashboardStore } from '@/store/dashboard'

function renderShell() {
  return render(
    <TooltipProvider>
      <Shell enableSse={false} />
    </TooltipProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

afterEach(() => {
  document.body.classList.remove('dense')
})

describe('Shell: tablist keyboard navigation (P0-1)', () => {
  test('renders all tabs with role="tab" inside a labelled tablist', () => {
    renderShell()
    const list = screen.getByRole('tablist', { name: /dashboard sections/i })
    const tabs = within(list).getAllByRole('tab')
    expect(tabs).toHaveLength(7)
    expect(tabs.map((t) => t.getAttribute('data-tab-id'))).toEqual([
      'status',
      'hooks',
      'background',
      'events',
      'sessions',
      'agents',
      'config',
    ])
  })

  test('ArrowRight moves selection to the next tab', () => {
    renderShell()
    const tablist = screen.getByRole('tablist', { name: /dashboard sections/i })
    const statusTab = within(tablist).getByRole('tab', { name: /status/i })
    statusTab.focus()
    fireEvent.keyDown(statusTab, { key: 'ArrowRight' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('hooks')
  })

  test('ArrowLeft from the first tab wraps to the last tab', () => {
    renderShell()
    const tablist = screen.getByRole('tablist', { name: /dashboard sections/i })
    const statusTab = within(tablist).getByRole('tab', { name: /status/i })
    statusTab.focus()
    fireEvent.keyDown(statusTab, { key: 'ArrowLeft' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('config')
  })

  test('Home and End jump to first / last tab', () => {
    useDashboardStore.getState().setActiveTab('background')
    renderShell()
    const tablist = screen.getByRole('tablist', { name: /dashboard sections/i })
    const backgroundTab = within(tablist).getByRole('tab', { name: /background/i })
    backgroundTab.focus()
    fireEvent.keyDown(backgroundTab, { key: 'End' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('config')
    const configTab = within(tablist).getByRole('tab', { name: /config/i })
    fireEvent.keyDown(configTab, { key: 'Home' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('status')
  })

  test('digit hotkeys 1-7 jump to matching tab (P2-9)', () => {
    renderShell()
    fireEvent.keyDown(window, { key: '4' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('events')
    fireEvent.keyDown(window, { key: '7' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('config')
    fireEvent.keyDown(window, { key: '1' })
    expect(useDashboardStore.getState().ui.activeTab).toBe('status')
  })

  test('digit hotkeys are ignored when typing in an input', () => {
    renderShell()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    fireEvent.keyDown(input, { key: '5', target: input, bubbles: true })
    expect(useDashboardStore.getState().ui.activeTab).toBe('status')
    input.remove()
  })
})

describe('Shell: derived UI behavior', () => {
  test('dense mode toggle adds the body `dense` class (P2-8)', () => {
    renderShell()
    expect(document.body.classList.contains('dense')).toBe(false)
    act(() => {
      useDashboardStore.getState().toggleDense()
    })
    expect(document.body.classList.contains('dense')).toBe(true)
  })

  test('event count badge reflects store state (P1-5)', () => {
    useDashboardStore.getState().appendEvent({ id: 'e1' })
    useDashboardStore.getState().appendEvent({ id: 'e2' })
    useDashboardStore.getState().appendEvent({ id: 'e3' })
    renderShell()
    expect(screen.getByTestId('tab-count-events')).toHaveTextContent('3')
  })

  test('agents badge counts only running agents (P1-5)', () => {
    useDashboardStore.getState().setAgents([
      { agent_id: 'a1', status: 'running' },
      { agent_id: 'a2', status: 'done' },
      { agent_id: 'a3', status: 'running' },
    ])
    renderShell()
    expect(screen.getByTestId('tab-running-agents')).toHaveTextContent('2 running')
  })

  test('SSE banner shows reconnect countdown (P2-6)', () => {
    const future = Date.now() + 4500
    useDashboardStore.getState().setSseStatus('reconnecting', {
      reconnectAttempt: 1,
      reconnectAt: future,
    })
    renderShell()
    const banner = screen.getByTestId('sse-banner')
    expect(banner).toHaveAttribute('data-sse-status', 'reconnecting')
    expect(banner.textContent ?? '').toMatch(/Reconnecting in [0-9]+s/)
  })

  test('connected status hides the SSE banner', () => {
    useDashboardStore.getState().setSseStatus('connected', {
      reconnectAttempt: 0,
      reconnectAt: null,
    })
    renderShell()
    expect(screen.queryByTestId('sse-banner')).toBeNull()
  })
})

describe('ErrorBoundary recovery flow', () => {
  function Boom({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) throw new Error('kaboom')
    return <div>recovered ok</div>
  }

  test('renders the recovery card when a child throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reload dashboard/i })).toBeInTheDocument()
    expect(screen.getByTestId('error-boundary-message')).toHaveTextContent('kaboom')
    errorSpy.mockRestore()
  })

  test('"Try again" resets state and re-renders children', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    let throws = true
    function Toggling() {
      return <Boom shouldThrow={throws} />
    }
    const { rerender } = render(
      <ErrorBoundary>
        <Toggling />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    throws = false
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    rerender(
      <ErrorBoundary>
        <Toggling />
      </ErrorBoundary>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/recovered ok/i)).toBeInTheDocument()
    errorSpy.mockRestore()
  })

  test('"Reload dashboard" calls window.location.reload', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, reload },
      configurable: true,
    })
    try {
      render(
        <ErrorBoundary>
          <Boom shouldThrow />
        </ErrorBoundary>,
      )
      fireEvent.click(screen.getByRole('button', { name: /reload dashboard/i }))
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      Object.defineProperty(window, 'location', {
        value: original,
        configurable: true,
      })
      errorSpy.mockRestore()
    }
  })
})

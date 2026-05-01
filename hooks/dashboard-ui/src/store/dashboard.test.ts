import { beforeEach, describe, expect, test } from 'vitest'
import { _resetForTests, useDashboardStore } from './dashboard'

const STORAGE_KEY = 'omc-dashboard-prefs-v1'

beforeEach(() => {
  localStorage.clear()
  _resetForTests()
})

describe('useDashboardStore: initial state', () => {
  test('exposes ui, connection, data slices', () => {
    const s = useDashboardStore.getState()
    expect(s.ui).toBeDefined()
    expect(s.connection).toBeDefined()
    expect(s.data).toBeDefined()
  })

  test('default activeTab is "status"', () => {
    expect(useDashboardStore.getState().ui.activeTab).toBe('status')
  })

  test('default denseMode is false', () => {
    expect(useDashboardStore.getState().ui.denseMode).toBe(false)
  })

  test('connection.sseStatus default is "idle"', () => {
    expect(useDashboardStore.getState().connection.sseStatus).toBe('idle')
  })

  test('data slices initialise to null/empty', () => {
    const d = useDashboardStore.getState().data
    expect(d.health).toBeNull()
    expect(d.hooks).toBeNull()
    expect(d.events).toEqual([])
  })
})

describe('actions', () => {
  test('setActiveTab updates ui.activeTab', () => {
    useDashboardStore.getState().setActiveTab('events')
    expect(useDashboardStore.getState().ui.activeTab).toBe('events')
  })

  test('toggleDense flips ui.denseMode', () => {
    useDashboardStore.getState().toggleDense()
    expect(useDashboardStore.getState().ui.denseMode).toBe(true)
    useDashboardStore.getState().toggleDense()
    expect(useDashboardStore.getState().ui.denseMode).toBe(false)
  })

  test('setEventsFilter updates ui.eventsFilter', () => {
    useDashboardStore.getState().setEventsFilter('errors')
    expect(useDashboardStore.getState().ui.eventsFilter).toBe('errors')
  })

  test('setBackgroundAutoPrune toggles ui.backgroundAutoPrune (default true, persists)', () => {
    expect(useDashboardStore.getState().ui.backgroundAutoPrune).toBe(true)
    useDashboardStore.getState().setBackgroundAutoPrune(false)
    expect(useDashboardStore.getState().ui.backgroundAutoPrune).toBe(false)

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.ui.backgroundAutoPrune).toBe(false)
  })
})

describe('expandedKeys per-tab map', () => {
  test('toggleExpanded adds and removes keys per tab', () => {
    const { toggleExpanded } = useDashboardStore.getState()
    toggleExpanded('events', 'evt-1')
    expect(useDashboardStore.getState().ui.expandedKeys.events.has('evt-1')).toBe(true)
    toggleExpanded('events', 'evt-1')
    expect(useDashboardStore.getState().ui.expandedKeys.events.has('evt-1')).toBe(false)
  })

  test('clearExpanded resets one tab', () => {
    const { toggleExpanded, clearExpanded } = useDashboardStore.getState()
    toggleExpanded('events', 'evt-1')
    toggleExpanded('events', 'evt-2')
    toggleExpanded('sessions', 'sess-1')
    clearExpanded('events')
    expect(useDashboardStore.getState().ui.expandedKeys.events.size).toBe(0)
    expect(useDashboardStore.getState().ui.expandedKeys.sessions.size).toBe(1)
  })
})

describe('persist middleware', () => {
  test('only ui keys are persisted', () => {
    const s = useDashboardStore.getState()
    s.setActiveTab('agents')
    s.toggleDense()
    s.setHealth({ uptime: 999, toolCalls: 5 })

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const persisted = JSON.parse(raw!)
    expect(persisted.state.ui.activeTab).toBe('agents')
    expect(persisted.state.ui.denseMode).toBe(true)
    expect(persisted.state.data).toBeUndefined()
    expect(JSON.stringify(persisted)).not.toContain('999')
  })

  test('hydration restores ui state', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          ui: {
            activeTab: 'config',
            denseMode: true,
            eventsFilter: 'errors',
            expandedKeys: {},
            eventsAutoScroll: true,
            eventsSearch: '',
            sessionsSearch: '',
            sessionsSort: 'startTimeDesc',
          },
        },
        version: 0,
      }),
    )
    _resetForTests()
    await useDashboardStore.persist?.rehydrate?.()
    expect(useDashboardStore.getState().ui.activeTab).toBe('config')
    expect(useDashboardStore.getState().ui.denseMode).toBe(true)
  })
})

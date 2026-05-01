import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { DispatchCounts } from '@/lib/sse-reducer'

export type TabId =
  | 'status'
  | 'hooks'
  | 'background'
  | 'events'
  | 'sessions'
  | 'agents'
  | 'config'

export type EventsFilter = 'all' | 'tools' | 'dispatches' | 'errors' | 'denies'
export type SessionsSort = 'startTimeDesc' | 'toolCountDesc' | 'errorCountDesc'
export type SseStatus = 'idle' | 'connected' | 'reconnecting' | 'shutdown'

type ExpandedKeys = Record<TabId, Set<string>>

const TABS: readonly TabId[] = [
  'status',
  'hooks',
  'background',
  'events',
  'sessions',
  'agents',
  'config',
] as const

const emptyExpanded = (): ExpandedKeys =>
  TABS.reduce((acc, tab) => {
    acc[tab] = new Set<string>()
    return acc
  }, {} as ExpandedKeys)

export type UiSlice = {
  activeTab: TabId
  denseMode: boolean
  expandedKeys: ExpandedKeys
  eventsFilter: EventsFilter
  eventsAutoScroll: boolean
  eventsSearch: string
  sessionsSearch: string
  sessionsSort: SessionsSort
  backgroundAutoPrune: boolean
}

export type ConnectionSlice = {
  selectedConversation: string | null
  sseStatus: SseStatus
  reconnectAttempt: number
  reconnectAt: number | null
}

export type DataSlice = {
  health: unknown | null
  hooks: unknown | null
  backgroundTasks: unknown[] | null
  dispatchCounts: DispatchCounts
  recentErrors: unknown[]
  events: unknown[]
  config: unknown | null
  sessions: unknown[] | null
  agents: unknown[] | null
}

type Actions = {
  setActiveTab: (tab: TabId) => void
  toggleDense: () => void
  setEventsFilter: (f: EventsFilter) => void
  setEventsAutoScroll: (v: boolean) => void
  setEventsSearch: (q: string) => void
  setSessionsSearch: (q: string) => void
  setSessionsSort: (s: SessionsSort) => void
  setBackgroundAutoPrune: (v: boolean) => void
  toggleExpanded: (tab: TabId, key: string) => void
  clearExpanded: (tab: TabId) => void

  setSseStatus: (
    status: SseStatus,
    opts?: { reconnectAttempt?: number; reconnectAt?: number | null },
  ) => void
  setSelectedConversation: (id: string | null) => void

  setHealth: (h: unknown) => void
  setHooks: (h: unknown) => void
  setBackgroundTasks: (t: unknown[]) => void
  setDispatchCounts: (c: DispatchCounts) => void
  setRecentErrors: (e: unknown[]) => void
  setEvents: (e: unknown[]) => void
  appendEvent: (e: unknown) => void
  setConfig: (c: unknown) => void
  setSessions: (s: unknown[]) => void
  setAgents: (a: unknown[]) => void
}

export type DashboardState = {
  ui: UiSlice
  connection: ConnectionSlice
  data: DataSlice
} & Actions

const makeInitial = () => ({
  ui: {
    activeTab: 'status' as TabId,
    denseMode: false,
    expandedKeys: emptyExpanded(),
    eventsFilter: 'all' as EventsFilter,
    eventsAutoScroll: true,
    eventsSearch: '',
    sessionsSearch: '',
    sessionsSort: 'startTimeDesc' as SessionsSort,
    backgroundAutoPrune: true,
  } satisfies UiSlice,
  connection: {
    selectedConversation: null,
    sseStatus: 'idle' as SseStatus,
    reconnectAttempt: 0,
    reconnectAt: null,
  } satisfies ConnectionSlice,
  data: {
    health: null,
    hooks: null,
    backgroundTasks: null,
    dispatchCounts: { explore: 0, worker: 0, total: 0 },
    recentErrors: [] as unknown[],
    events: [] as unknown[],
    config: null,
    sessions: null,
    agents: null,
  } satisfies DataSlice,
})

// localStorage cannot serialize `Set`, so the persisted shape uses arrays
// for `expandedKeys` and we round-trip via `serializeUi` / `deserializeUi`.
type SerializedUi = Omit<UiSlice, 'expandedKeys'> & {
  expandedKeys: Record<TabId, string[]>
}

function serializeUi(ui: UiSlice): SerializedUi {
  const expandedKeys = {} as Record<TabId, string[]>
  for (const tab of TABS) {
    expandedKeys[tab] = Array.from(ui.expandedKeys[tab] ?? [])
  }
  return { ...ui, expandedKeys }
}

function deserializeUi(persistedUi: unknown): UiSlice {
  const base = makeInitial().ui
  if (!persistedUi || typeof persistedUi !== 'object') return base

  const p = persistedUi as Partial<SerializedUi> & {
    expandedKeys?: Partial<Record<TabId, string[]>>
  }

  const expandedKeys = emptyExpanded()
  const persistedKeys = p.expandedKeys ?? {}
  for (const tab of TABS) {
    const arr = persistedKeys[tab]
    if (Array.isArray(arr)) expandedKeys[tab] = new Set(arr)
  }

  return {
    ...base,
    ...(p as Partial<UiSlice>),
    expandedKeys,
  }
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      ...makeInitial(),

      setActiveTab: (tab) => set((s) => ({ ui: { ...s.ui, activeTab: tab } })),
      toggleDense: () =>
        set((s) => ({ ui: { ...s.ui, denseMode: !s.ui.denseMode } })),
      setEventsFilter: (f) =>
        set((s) => ({ ui: { ...s.ui, eventsFilter: f } })),
      setEventsAutoScroll: (v) =>
        set((s) => ({ ui: { ...s.ui, eventsAutoScroll: v } })),
      setEventsSearch: (q) =>
        set((s) => ({ ui: { ...s.ui, eventsSearch: q } })),
      setSessionsSearch: (q) =>
        set((s) => ({ ui: { ...s.ui, sessionsSearch: q } })),
      setSessionsSort: (srt) =>
        set((s) => ({ ui: { ...s.ui, sessionsSort: srt } })),
      setBackgroundAutoPrune: (v) =>
        set((s) => ({ ui: { ...s.ui, backgroundAutoPrune: v } })),

      toggleExpanded: (tab, key) =>
        set((s) => {
          const nextSet = new Set(s.ui.expandedKeys[tab])
          if (nextSet.has(key)) nextSet.delete(key)
          else nextSet.add(key)
          return {
            ui: {
              ...s.ui,
              expandedKeys: { ...s.ui.expandedKeys, [tab]: nextSet },
            },
          }
        }),
      clearExpanded: (tab) =>
        set((s) => ({
          ui: {
            ...s.ui,
            expandedKeys: { ...s.ui.expandedKeys, [tab]: new Set<string>() },
          },
        })),

      setSseStatus: (status, opts = {}) =>
        set((s) => ({
          connection: {
            ...s.connection,
            sseStatus: status,
            reconnectAttempt:
              opts.reconnectAttempt ?? s.connection.reconnectAttempt,
            reconnectAt: opts.reconnectAt ?? s.connection.reconnectAt,
          },
        })),
      setSelectedConversation: (id) =>
        set((s) => ({
          connection: { ...s.connection, selectedConversation: id },
        })),

      setHealth: (h) => set((s) => ({ data: { ...s.data, health: h } })),
      setHooks: (h) => set((s) => ({ data: { ...s.data, hooks: h } })),
      setBackgroundTasks: (t) =>
        set((s) => ({ data: { ...s.data, backgroundTasks: t } })),
      setDispatchCounts: (c) =>
        set((s) => ({ data: { ...s.data, dispatchCounts: c } })),
      setRecentErrors: (e) =>
        set((s) => ({ data: { ...s.data, recentErrors: e } })),
      setEvents: (e) => set((s) => ({ data: { ...s.data, events: e } })),
      appendEvent: (e) =>
        set((s) => ({ data: { ...s.data, events: [...s.data.events, e] } })),
      setConfig: (c) => set((s) => ({ data: { ...s.data, config: c } })),
      setSessions: (ss) => set((s) => ({ data: { ...s.data, sessions: ss } })),
      setAgents: (a) => set((s) => ({ data: { ...s.data, agents: a } })),
    }),
    {
      name: 'omc-dashboard-prefs-v1',
      version: 0,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) =>
        ({ ui: serializeUi(state.ui) }) as unknown as DashboardState,
      merge: (persisted, current) => {
        const ui = deserializeUi((persisted as { ui?: unknown } | undefined)?.ui)
        return { ...current, ui }
      },
    },
  ),
)

// Test-only helper: wipe the store's slices back to their initial shape
// while keeping the action functions intact. The persist middleware writes
// to storage on every `setState`, so we snapshot localStorage before the
// reset and restore it afterward — that lets a test pre-seed storage,
// call `_resetForTests()`, and then exercise `persist.rehydrate()` without
// the reset clobbering its fixture.
export function _resetForTests(): void {
  const before =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('omc-dashboard-prefs-v1')
      : null
  useDashboardStore.setState(makeInitial())
  if (typeof localStorage === 'undefined') return
  if (before === null) localStorage.removeItem('omc-dashboard-prefs-v1')
  else localStorage.setItem('omc-dashboard-prefs-v1', before)
}

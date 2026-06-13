import { useCallback, useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SseBanner } from '@/components/SseBanner'
import { ShortcutsSheet } from '@/components/ShortcutsSheet'

import { useDashboardStore, type SseStatus, type TabId } from '@/store/dashboard'
import {
  useActiveTab,
  useConnection,
  useDenseMode,
} from '@/store/selectors'
import { createSseClient, type SseClient } from '@/lib/sse'
import { dashboardSseBindings } from '@/lib/sse-dashboard-binding'

import { TAB_DEFINITIONS } from '@/tabs/registry'

import StatusTab from '@/tabs/StatusTab'
import HooksTab from '@/tabs/HooksTab'
import BackgroundTab from '@/tabs/BackgroundTab'
import EventsTab from '@/tabs/EventsTab'
import SessionsTab from '@/tabs/SessionsTab'
import AgentsTab from '@/tabs/AgentsTab'
import ConfigTab from '@/tabs/ConfigTab'
import ModelsRoutingTab from '@/tabs/models-routing/ModelsRoutingTab'

import { ShellHeader } from './ShellHeader'
import { useShellHotkeys } from './ShellHotkeys'
import { useDashboardBootstrap } from './useDashboardBootstrap'

const TAB_PANELS: Record<TabId, () => React.JSX.Element> = {
  status: () => <StatusTab />,
  hooks: () => <HooksTab />,
  background: () => <BackgroundTab />,
  events: () => <EventsTab />,
  sessions: () => <SessionsTab />,
  agents: () => <AgentsTab />,
  config: () => <ConfigTab />,
  'models-routing': () => <ModelsRoutingTab />,
}

// Keep in sync with sse.ts (BASE_BACKOFF_MS / MAX_BACKOFF_MS).
const SSE_BASE_BACKOFF_MS = 1000
const SSE_MAX_BACKOFF_MS = 30_000

function nextReconnectAt(attempt: number, now: number): number {
  const backoff = Math.min(SSE_BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), SSE_MAX_BACKOFF_MS)
  return now + backoff
}

function useTabBadgeCounts(): Partial<Record<TabId, number>> {
  return useDashboardStore(
    useShallow((s) => {
      const events = Array.isArray(s.data.events) ? s.data.events.length : 0
      const sessions = Array.isArray(s.data.sessions) ? s.data.sessions.length : 0
      const backgroundRunning = Array.isArray(s.data.backgroundTasks)
        ? s.data.backgroundTasks.filter(
            (t) => (t as { status?: unknown })?.status === 'running',
          ).length
        : 0
      const agentsRunning = Array.isArray(s.data.agents)
        ? s.data.agents.filter(
            (a) => (a as { status?: unknown })?.status === 'running',
          ).length
        : 0
      return {
        events,
        sessions,
        background: backgroundRunning,
        agents: agentsRunning,
      }
    }),
  )
}

type ShellProps = {
  /** Test seam: skip the real EventSource connect when running in jsdom/happy-dom. */
  enableSse?: boolean
  /** Test seam: skip initial REST preloads when assertions don't need them. */
  enableDataBootstrap?: boolean
}

export default function Shell({
  enableSse = true,
  enableDataBootstrap = true,
}: ShellProps) {
  const activeTab = useActiveTab()
  const setActiveTab = useDashboardStore((s) => s.setActiveTab)
  const setSseStatus = useDashboardStore((s) => s.setSseStatus)
  const denseMode = useDenseMode()
  const { sseStatus } = useConnection()
  const counts = useTabBadgeCounts()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useDashboardBootstrap(enableDataBootstrap)

  // Toggle the body-level `dense` class so descendant components can opt in
  // to a denser variant via Tailwind's arbitrary-variant `:where(.dense &)`.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.body
    if (denseMode) root.classList.add('dense')
    else root.classList.remove('dense')
    return () => root.classList.remove('dense')
  }, [denseMode])

  // SSE bootstrap. Runs once on mount; status callback marshals reconnect
  // metadata into the store so SseBanner can render its countdown.
  const sseRef = useRef<SseClient | null>(null)
  useEffect(() => {
    if (!enableSse) return
    if (typeof window === 'undefined') return
    const port = window.OMC_DAEMON_PORT ?? 27847
    const url = `http://localhost:${port}/events/stream`
    let client: SseClient | null = null
    try {
      client = createSseClient({
        url,
        ...dashboardSseBindings(),
        onStatusChange(next) {
          if (next === 'connected') {
            setSseStatus('connected', { reconnectAttempt: 0, reconnectAt: null })
            return
          }
          if (next === 'reconnecting') {
            const attempt = client?.attemptCount ?? 1
            setSseStatus('reconnecting', {
              reconnectAttempt: attempt,
              reconnectAt: nextReconnectAt(attempt, Date.now()),
            })
            return
          }
          if (next === 'offline') {
            setSseStatus('reconnecting', {
              reconnectAttempt: client?.attemptCount ?? 0,
              reconnectAt: null,
            })
            return
          }
          setSseStatus(next as SseStatus)
        },
      })
      sseRef.current = client
      client.start()
    } catch {
      setSseStatus('reconnecting', { reconnectAttempt: 0, reconnectAt: null })
    }
    return () => {
      client?.stop()
      sseRef.current = null
    }
  }, [enableSse, setSseStatus])

  useShellHotkeys({ setActiveTab, setShortcutsOpen })

  // Arrow-key tablist navigation. Radix Tabs ships with this, but we
  // supplement it so the keyboard contract is enforceable in tests + works
  // even when Radix's roving focus group is bypassed.
  const handleTablistKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const ids = TAB_DEFINITIONS.map((t) => t.id)
      const current = ids.indexOf(activeTab)
      if (current === -1) return
      let nextIdx: number | null = null
      if (e.key === 'ArrowRight') nextIdx = (current + 1) % ids.length
      else if (e.key === 'ArrowLeft') nextIdx = (current - 1 + ids.length) % ids.length
      else if (e.key === 'Home') nextIdx = 0
      else if (e.key === 'End') nextIdx = ids.length - 1
      if (nextIdx == null) return
      e.preventDefault()
      const nextId = ids[nextIdx]!
      setActiveTab(nextId)
      const list = e.currentTarget
      const trigger = list.querySelector<HTMLButtonElement>(
        `[role="tab"][data-tab-id="${nextId}"]`,
      )
      trigger?.focus()
    },
    [activeTab, setActiveTab],
  )

  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-dense={denseMode || undefined}
      data-sse-status={sseStatus}
    >
      <ShellHeader onOpenShortcuts={() => setShortcutsOpen(true)} />
      <SseBanner />
      <main className="flex flex-1 flex-col px-4 py-3">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabId)}
          className="flex-1"
        >
          <TabsList
            aria-label="Dashboard sections"
            onKeyDown={handleTablistKeyDown}
            className="flex flex-wrap gap-1"
          >
            {TAB_DEFINITIONS.map((t) => {
              const count = counts[t.id]
              const showCount =
                (t.id === 'events' || t.id === 'sessions') && typeof count === 'number'
              const showRunning =
                (t.id === 'background' || t.id === 'agents') &&
                typeof count === 'number' &&
                count > 0
              return (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  data-tab-id={t.id}
                  aria-keyshortcuts={t.hotkey}
                  className="gap-2"
                >
                  <span>{t.label}</span>
                  {showCount ? (
                    <Badge
                      variant="secondary"
                      data-testid={`tab-count-${t.id}`}
                      className="h-4 px-1.5 text-[10px] font-mono"
                    >
                      {count}
                    </Badge>
                  ) : null}
                  {showRunning ? (
                    <Badge
                      variant="default"
                      data-testid={`tab-running-${t.id}`}
                      className="h-4 px-1.5 text-[10px] font-mono"
                    >
                      {count} running
                    </Badge>
                  ) : null}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {TAB_DEFINITIONS.map((t) => {
            const Panel = TAB_PANELS[t.id]
            return (
              <TabsContent
                key={t.id}
                value={t.id}
                className="mt-3 flex-1 motion-safe:animate-in motion-safe:fade-in-50"
              >
                <ErrorBoundary>
                  <Panel />
                </ErrorBoundary>
              </TabsContent>
            )
          })}
        </Tabs>
      </main>
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}

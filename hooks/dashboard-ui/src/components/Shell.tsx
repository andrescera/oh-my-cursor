import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { KeyboardIcon, MoonIcon, SunIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

import { HOTKEY_TO_TAB, TAB_DEFINITIONS } from '@/tabs/registry'

import StatusTab from '@/tabs/StatusTab'
import HooksTab from '@/tabs/HooksTab'
import BackgroundTab from '@/tabs/BackgroundTab'
import EventsTab from '@/tabs/EventsTab'
import SessionsTab from '@/tabs/SessionsTab'
import AgentsTab from '@/tabs/AgentsTab'
import ConfigTab from '@/tabs/ConfigTab'

const TAB_PANELS: Record<TabId, () => React.JSX.Element> = {
  status: () => <StatusTab />,
  hooks: () => <HooksTab />,
  background: () => <BackgroundTab />,
  events: () => <EventsTab />,
  sessions: () => <SessionsTab />,
  agents: () => <AgentsTab />,
  config: () => <ConfigTab />,
}

// Keep in sync with sse.ts (BASE_BACKOFF_MS / MAX_BACKOFF_MS).
const SSE_BASE_BACKOFF_MS = 1000
const SSE_MAX_BACKOFF_MS = 30_000

function nextReconnectAt(attempt: number, now: number): number {
  const backoff = Math.min(SSE_BASE_BACKOFF_MS * 2 ** Math.max(0, attempt - 1), SSE_MAX_BACKOFF_MS)
  return now + backoff
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
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

function ConversationSelector() {
  const selectedConversation = useDashboardStore(
    (s) => s.connection.selectedConversation,
  )
  const setSelectedConversation = useDashboardStore(
    (s) => s.setSelectedConversation,
  )
  const sessions = useDashboardStore((s) => s.data.sessions)

  const options = useMemo<{ value: string; label: string }[]>(() => {
    if (!Array.isArray(sessions) || sessions.length === 0) return []
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    for (const raw of sessions) {
      const s = raw as { conversationId?: string; id?: string; title?: string }
      const value = s?.conversationId ?? s?.id
      if (typeof value !== 'string' || seen.has(value)) continue
      seen.add(value)
      out.push({ value, label: s?.title ?? value })
    }
    return out
  }, [sessions])

  if (options.length === 0) {
    return (
      <Badge variant="outline" className="font-mono text-[11px]">
        no conversation
      </Badge>
    )
  }

  return (
    <Select
      value={selectedConversation ?? options[0]!.value}
      onValueChange={setSelectedConversation}
    >
      <SelectTrigger size="sm" aria-label="Select conversation" className="min-w-40">
        <SelectValue placeholder="Conversation" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ShellHeader({
  onOpenShortcuts,
}: {
  onOpenShortcuts: () => void
}) {
  const denseMode = useDenseMode()
  const toggleDense = useDashboardStore((s) => s.toggleDense)

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card/30 px-4 py-2">
      <h1 className="text-sm font-semibold tracking-tight text-foreground">
        oh-my-cursor
        <span className="ml-2 text-muted-foreground">Dashboard</span>
      </h1>
      <Badge variant="outline" className="font-mono text-[11px]">
        v0
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <ConversationSelector />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={denseMode ? 'Switch to comfortable density' : 'Switch to dense density'}
              aria-pressed={denseMode}
              onClick={toggleDense}
            >
              {denseMode ? <SunIcon /> : <MoonIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {denseMode ? 'Comfortable mode' : 'Dense mode'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Show keyboard shortcuts"
              onClick={onOpenShortcuts}
            >
              <KeyboardIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

type ShellProps = {
  /** Test seam — skip the real EventSource connect when running in jsdom/happy-dom. */
  enableSse?: boolean
}

export default function Shell({ enableSse = true }: ShellProps) {
  const activeTab = useActiveTab()
  const setActiveTab = useDashboardStore((s) => s.setActiveTab)
  const setSseStatus = useDashboardStore((s) => s.setSseStatus)
  const denseMode = useDenseMode()
  const { sseStatus } = useConnection()
  const counts = useTabBadgeCounts()
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

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

  // Global keyboard shortcuts. Skips IME composition + editable targets so
  // typing into the events search input doesn't hijack the digit keys.
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      // `?` opens the shortcuts sheet even from within an editable target —
      // that's the conventional escape hatch from any context.
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((open) => !open)
        return
      }
      if (isEditableTarget(e.target)) return
      const tabFromHotkey = HOTKEY_TO_TAB[e.key]
      if (tabFromHotkey) {
        e.preventDefault()
        setActiveTab(tabFromHotkey)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        if (useDashboardStore.getState().ui.activeTab !== 'events') {
          setActiveTab('events')
        }
        window.dispatchEvent(new CustomEvent('events-search-focus'))
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        const tab = useDashboardStore.getState().ui.activeTab
        window.dispatchEvent(
          new CustomEvent('tab-refresh', { detail: { tab } }),
        )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveTab])

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
                aria-labelledby={`tab-trigger-${t.id}`}
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

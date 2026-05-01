/**
 * Events tab — W2.5.
 *
 * Wires the dashboard store (`ui.eventsFilter|AutoScroll|Search`,
 * `data.events`, `expandedKeys.events`) to the `/session-log` endpoint.
 *
 * Audit wins covered here:
 *   - P0-2  focusable rows: every row is a `<button>` with `aria-expanded`,
 *           Enter/Space toggle handled natively by the button element.
 *   - P1-1  retry on initial fetch failure (no silent swallow).
 *   - P1-3  inline-confirm Clear with 5s Undo toast — replaces `confirm()`
 *           per AB-3.
 *   - P2-2  real-time text search across event type / tool / agent / message.
 *   - P2-5  filter + search + autoscroll persisted through the store
 *           `persist` middleware.
 *   - P2-11 `aria-live="polite" aria-atomic="false"` on the list container
 *           so SRs announce new events appended via SSE.
 *
 * Virtualization note (spec W2.5): `@tanstack/react-virtual` is NOT installed
 * and adding it would bloat the single-file bundle. The spec explicitly
 * permits plain rendering — "the audit goal is smooth scroll, not must
 * virtualize." We render everything; if the session-log ever grows past
 * ~1k events we revisit this.
 * TODO(W2.5-followup): add windowing once the event volume justifies it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clearSessionLog, getSessionLog, type ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { type EventsFilter, useDashboardStore } from '@/store/dashboard'
import { useExpanded, useUi } from '@/store/selectors'

// Loose structural shape — the daemon emits a heterogeneous union (tool
// calls, dispatches, errors, etc.). We only rely on the fields used for
// rendering / filtering / search; everything else is preserved verbatim
// in the detail pane via `JSON.stringify`.
export type DashboardEvent = {
  ts?: number
  event?: string
  tool?: string
  agentType?: string
  action?: string
  error?: string | null
  meta?: Record<string, unknown>
  sessionId?: string
  message?: string
  [extra: string]: unknown
}

type FilterOption = { id: EventsFilter; label: string }

const FILTER_OPTIONS: readonly FilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'tools', label: 'Tools' },
  { id: 'dispatches', label: 'Dispatches' },
  { id: 'errors', label: 'Errors' },
  { id: 'denies', label: 'Denies' },
] as const

const UNDO_WINDOW_MS = 5000
const FETCH_LIMIT = 200
const FOCUS_SEARCH_EVENT = 'omc-focus-events-search'

function eventKey(e: DashboardEvent, idx: number): string {
  return `${e.ts ?? 0}:${e.event ?? ''}:${e.tool ?? ''}:${idx}`
}

// Ported verbatim from `hooks/dashboard/render.ts:839-845` so the filter
// semantics match the legacy dashboard exactly.
function applyFilter(
  events: readonly DashboardEvent[],
  filter: EventsFilter,
): DashboardEvent[] {
  switch (filter) {
    case 'tools':
      return events.filter(
        (e) =>
          typeof e.tool === 'string' &&
          !['Task', 'task', 'Agent', 'agent'].includes(e.tool),
      )
    case 'dispatches':
      return events.filter((e) => Boolean(e.agentType))
    case 'errors':
      return events.filter(
        (e) => Boolean(e.error) || e.event === '/postToolUseFailure',
      )
    case 'denies':
      return events.filter((e) => e.action === 'deny')
    case 'all':
    default:
      return events.slice()
  }
}

function applySearch(
  events: readonly DashboardEvent[],
  query: string,
): DashboardEvent[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return events.slice()
  return events.filter((e) => {
    const hay = [e.event, e.tool, e.agentType, e.message]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ')
      .toLowerCase()
    return hay.includes(needle)
  })
}

function formatApiError(err: ApiError): string {
  if (err.kind === 'http') {
    return `HTTP ${err.status}${err.message ? `: ${err.message}` : ''}`
  }
  return err.kind === 'network'
    ? `Network error: ${err.message}`
    : `Parse error: ${err.message}`
}

function formatTime(ts: number | undefined): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return ''
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

type EventRowProps = {
  event: DashboardEvent
  rowId: string
  expanded: boolean
  onToggle: () => void
}

function EventRow({ event, rowId, expanded, onToggle }: EventRowProps) {
  const detailId = `${rowId}-detail`
  const errSnippet =
    typeof event.error === 'string' ? event.error.slice(0, 80) : null

  return (
    <>
      <button
        type="button"
        data-testid="event-row"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="w-[68px] shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {formatTime(event.ts)}
        </span>
        <span className="w-[160px] shrink-0 truncate font-mono text-xs text-muted-foreground">
          {event.event ?? ''}
        </span>
        <span className="flex-1 truncate">
          {event.agentType ? (
            <span className="mr-1 rounded bg-muted px-1 py-0.5 text-xs text-foreground">
              [{event.agentType}]
            </span>
          ) : null}
          {event.tool ?? ''}
        </span>
        <span
          className={cn(
            'w-[56px] shrink-0 text-xs',
            event.action === 'deny' && 'text-destructive',
            event.action === 'approve' && 'text-emerald-500',
          )}
        >
          {event.action ?? '-'}
        </span>
        {errSnippet ? (
          <span className="max-w-[240px] shrink truncate text-xs text-destructive">
            {errSnippet}
          </span>
        ) : null}
        <span aria-hidden className="ml-1 text-xs text-muted-foreground">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded ? (
        <pre
          id={detailId}
          data-testid="event-detail"
          className="mx-3 mb-2 max-h-80 overflow-auto rounded border border-border/70 bg-muted/30 p-2 font-mono text-xs text-foreground"
        >
          {JSON.stringify(event, null, 2)}
        </pre>
      ) : null}
    </>
  )
}

export default function EventsTab() {
  const { eventsFilter, eventsAutoScroll, eventsSearch } = useUi()
  const expanded = useExpanded('events')
  const events = useDashboardStore(
    (s) => s.data.events,
  ) as readonly DashboardEvent[]
  const setEvents = useDashboardStore((s) => s.setEvents)
  const setEventsFilter = useDashboardStore((s) => s.setEventsFilter)
  const setEventsAutoScroll = useDashboardStore((s) => s.setEventsAutoScroll)
  const setEventsSearch = useDashboardStore((s) => s.setEventsSearch)
  const toggleExpanded = useDashboardStore((s) => s.toggleExpanded)

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Snapshot lives in a ref (not state) so the Undo toast callback closes
  // over a stable reference — no stale closure after further list edits.
  const undoSnapshotRef = useRef<DashboardEvent[] | null>(null)

  const fetchEvents = useCallback(async () => {
    setStatus('loading')
    setErrorMsg(null)
    const res = await getSessionLog({ limit: FETCH_LIMIT })
    if (res.ok) {
      const data = Array.isArray(res.data) ? (res.data as DashboardEvent[]) : []
      setEvents(data)
      setStatus('ready')
      return
    }
    setErrorMsg(formatApiError(res.error))
    setStatus('error')
  }, [setEvents])

  useEffect(() => {
    void fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    const handler = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select?.()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, handler)
    return () => window.removeEventListener(FOCUS_SEARCH_EVENT, handler)
  }, [])

  useEffect(() => {
    if (!eventsAutoScroll) return
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [events.length, eventsAutoScroll, eventsFilter, eventsSearch])

  const visibleEvents = useMemo(
    () => applySearch(applyFilter(events, eventsFilter), eventsSearch),
    [events, eventsFilter, eventsSearch],
  )

  const copyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(events, null, 2))
      toast.success('Copied events as JSON')
    } catch (err) {
      toast.error(
        `Copy failed: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }, [events])

  const downloadJsonl = useCallback(() => {
    const lines = events.map((e) => JSON.stringify(e)).join('\n')
    const blob = new Blob([lines], { type: 'application/x-ndjson' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'session-log.jsonl'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [events])

  const beginClear = useCallback(() => setConfirmingClear(true), [])
  const cancelClear = useCallback(() => setConfirmingClear(false), [])

  const confirmClear = useCallback(async () => {
    setConfirmingClear(false)
    const snapshot = events.slice()
    undoSnapshotRef.current = snapshot
    const res = await clearSessionLog()
    if (!res.ok) {
      undoSnapshotRef.current = null
      toast.error(`Clear failed: ${formatApiError(res.error)}`)
      return
    }
    setEvents([])
    toast('Events cleared', {
      duration: UNDO_WINDOW_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          const snap = undoSnapshotRef.current
          if (!snap) return
          setEvents(snap)
          undoSnapshotRef.current = null
        },
      },
      onAutoClose: () => {
        undoSnapshotRef.current = null
      },
      onDismiss: () => {
        undoSnapshotRef.current = null
      },
    })
  }, [events, setEvents])

  return (
    <div
      data-slot="events-tab"
      data-testid="events-tab"
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-2">
        <div
          role="group"
          aria-label="Filter events"
          className="flex items-center gap-1"
        >
          {FILTER_OPTIONS.map((f) => {
            const active = eventsFilter === f.id
            return (
              <Button
                key={f.id}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={active}
                data-testid={`events-filter-${f.id}`}
                className={cn(
                  active &&
                    'bg-muted text-foreground ring-1 ring-inset ring-border',
                )}
                onClick={() => setEventsFilter(f.id)}
              >
                {f.label}
              </Button>
            )
          })}
        </div>

        <Input
          ref={searchInputRef}
          type="search"
          aria-label="Search events"
          placeholder="Search events…  (press / to focus)"
          value={eventsSearch}
          onChange={(e) => setEventsSearch(e.currentTarget.value)}
          data-testid="events-search"
          className="h-7 w-56"
        />

        <div className="ml-auto flex items-center gap-1">
          <span
            className="px-1 text-xs text-muted-foreground"
            data-testid="events-count"
          >
            {visibleEvents.length} shown
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={eventsAutoScroll}
            data-testid="events-autoscroll"
            className={cn(
              eventsAutoScroll &&
                'bg-muted text-foreground ring-1 ring-inset ring-border',
            )}
            onClick={() => setEventsAutoScroll(!eventsAutoScroll)}
            title="Auto-scroll to bottom when new events arrive"
          >
            ↓ Auto
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={downloadJsonl}
            data-testid="events-download"
          >
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyJson}
            data-testid="events-copy"
          >
            Copy JSON
          </Button>
          {confirmingClear ? (
            <>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="events-clear-confirm"
                onClick={confirmClear}
              >
                Confirm clear?
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-testid="events-clear-cancel"
                onClick={cancelClear}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="events-clear"
              onClick={beginClear}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {status === 'loading' ? (
        <div
          className="p-4 text-sm text-muted-foreground"
          data-testid="events-loading"
        >
          Loading events…
        </div>
      ) : status === 'error' ? (
        <div
          role="alert"
          data-testid="events-error"
          className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <span>
            Failed to load events{errorMsg ? `: ${errorMsg}` : '.'} The daemon
            may be offline.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchEvents}
            data-testid="events-retry"
          >
            Retry
          </Button>
        </div>
      ) : (
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          aria-atomic="false"
          aria-label="Session events"
          data-testid="events-list"
          className="flex-1 overflow-auto"
        >
          {visibleEvents.length === 0 ? (
            <div
              className="p-4 text-sm text-muted-foreground"
              data-testid="events-empty"
            >
              {events.length === 0
                ? 'No events recorded for this session yet.'
                : 'No events match this filter.'}
            </div>
          ) : (
            <ul className="flex flex-col">
              {visibleEvents.map((e, i) => {
                const key = eventKey(e, i)
                return (
                  <li
                    key={key}
                    className="border-b border-border/60 last:border-b-0"
                  >
                    <EventRow
                      event={e}
                      rowId={key}
                      expanded={expanded.has(key)}
                      onToggle={() => toggleExpanded('events', key)}
                    />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

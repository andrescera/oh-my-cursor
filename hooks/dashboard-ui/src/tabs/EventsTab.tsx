/**
 * Events tab (W2.5).
 *
 * Wires the dashboard store (`ui.eventsFilter|AutoScroll|Search`,
 * `data.events`, `expandedKeys.events`) to the `/session-log` endpoint.
 *
 * Audit wins covered here:
 *   - P0-2  focusable rows: every row is a `<button>` with `aria-expanded`,
 *           Enter/Space toggle handled natively by the button element.
 *   - P1-1  retry on initial fetch failure (no silent swallow).
 *   - P1-3  inline-confirm Clear with 5s Undo toast: replaces `confirm()`
 *           per AB-3.
 *   - P2-2  real-time text search across event type / tool / agent / message.
 *   - P2-5  filter + search + autoscroll persisted through the store
 *           `persist` middleware.
 *   - P2-11 `aria-live="polite" aria-atomic="false"` on the list container
 *           so SRs announce new events appended via SSE.
 *
 * Virtualization note (spec W2.5): `@tanstack/react-virtual` is NOT installed
 * and adding it would bloat the single-file bundle. The spec explicitly
 * permits plain rendering: "the audit goal is smooth scroll, not must
 * virtualize." We render everything; if the session-log ever grows past
 * ~1k events we revisit this.
 * TODO(W2.5-followup): add windowing once the event volume justifies it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { clearSessionLog, getSessionLog, type ApiError } from '@/lib/api'
import { describeApiError, formatApiErrorInline } from '@/lib/api-error'
import { useDashboardStore } from '@/store/dashboard'
import { useExpanded, useUi } from '@/store/selectors'

import { type DashboardEvent, EventRow, eventKey } from './EventsRow'
import { EventsToolbar } from './EventsToolbar'
import {
  applyFilter,
  applySearch,
  FETCH_LIMIT,
  FOCUS_SEARCH_EVENT,
  UNDO_WINDOW_MS,
} from './events-undo'

export type { DashboardEvent }

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
  const [fetchError, setFetchError] = useState<ApiError | null>(null)
  const [confirmingClear, setConfirmingClear] = useState(false)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Snapshot lives in a ref (not state) so the Undo toast callback closes
  // over a stable reference: no stale closure after further list edits.
  const undoSnapshotRef = useRef<DashboardEvent[] | null>(null)

  const fetchEvents = useCallback(async () => {
    setStatus('loading')
    setFetchError(null)
    const res = await getSessionLog({ limit: FETCH_LIMIT })
    if (res.ok) {
      const data = Array.isArray(res.data) ? (res.data as DashboardEvent[]) : []
      setEvents(data)
      setStatus('ready')
      return
    }
    setFetchError(res.error)
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
      toast.error(`Clear failed: ${formatApiErrorInline(res.error)}`)
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
      <EventsToolbar
        filter={eventsFilter}
        search={eventsSearch}
        autoScroll={eventsAutoScroll}
        confirmingClear={confirmingClear}
        visibleCount={visibleEvents.length}
        searchInputRef={searchInputRef}
        onFilterChange={setEventsFilter}
        onSearchChange={setEventsSearch}
        onAutoscrollToggle={() => setEventsAutoScroll(!eventsAutoScroll)}
        onDownload={downloadJsonl}
        onCopy={copyJson}
        onClear={beginClear}
        onConfirmClear={confirmClear}
        onCancelClear={cancelClear}
      />

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
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">
              {fetchError ? describeApiError(fetchError).title : 'Could not load events'}
            </span>
            <span className="text-xs text-destructive/80">
              {fetchError
                ? describeApiError(fetchError).subtitle
                : 'Retry, or check daemon logs.'}
            </span>
          </div>
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

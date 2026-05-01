import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { type ApiError, getSessions } from '@/lib/api'
import {
  type SessionsSort,
  useDashboardStore,
} from '@/store/dashboard'

export type SessionRow = {
  id: string
  conversationId?: string | null
  startedAt?: string | null
  stoppedAt?: string | null
  displayTitle?: string | null
  composerMode?: 'plan' | 'agent' | null
  toolCallCount?: number
  errorCount?: number
  dispatchCounts?: Record<string, number> | null
  ralphState?: {
    active?: boolean
    iteration?: number
    maxIterations?: number
    startedAt?: string | null
  } | null
  boulderState?: { active?: boolean } | null
  recentToolTrail?: Array<{
    tool?: string
    path?: string
    commandSnippet?: string
  }> | null
}

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready' }

const SORT_LABELS: Record<SessionsSort, string> = {
  startTimeDesc: 'Start time (newest)',
  toolCountDesc: 'Tool count (highest)',
  errorCountDesc: 'Error count (highest)',
}

const SEARCH_DEBOUNCE_MS = 150

function truncateId(id: string, max = 14): string {
  if (!id) return '--'
  return id.length > max ? `${id.slice(0, max - 1)}…` : id
}

function describeError(err: ApiError): string {
  switch (err.kind) {
    case 'http':
      return `HTTP ${err.status}${err.message ? ` — ${err.message}` : ''}`
    case 'network':
      return `Network error — ${err.message}`
    case 'parse':
      return `Bad response — ${err.message}`
  }
}

function isSessionRowArray(v: unknown): v is SessionRow[] {
  return Array.isArray(v) && v.every((r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
}

function matchesQuery(row: SessionRow, needle: string): boolean {
  if (!needle) return true
  const haystacks: string[] = [
    row.id ?? '',
    row.conversationId ?? '',
    String(row.toolCallCount ?? ''),
    row.displayTitle ?? '',
  ]
  const n = needle.toLowerCase()
  return haystacks.some((h) => h.toLowerCase().includes(n))
}

function compareRows(a: SessionRow, b: SessionRow, sort: SessionsSort): number {
  switch (sort) {
    case 'toolCountDesc':
      return (b.toolCallCount ?? 0) - (a.toolCallCount ?? 0)
    case 'errorCountDesc':
      return (b.errorCount ?? 0) - (a.errorCount ?? 0)
    case 'startTimeDesc':
    default: {
      const ta = a.startedAt ? Date.parse(a.startedAt) : 0
      const tb = b.startedAt ? Date.parse(b.startedAt) : 0
      return tb - ta
    }
  }
}

function ComposerBadge({ mode }: { mode?: 'plan' | 'agent' | null }) {
  if (mode === 'plan') return <Badge variant="secondary">plan</Badge>
  if (mode === 'agent') return <Badge variant="default">agent</Badge>
  return <Badge variant="outline">auto</Badge>
}

function DispatchList({ counts }: { counts: Record<string, number> | null | undefined }) {
  const entries = Object.entries(counts ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )
  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground" data-slot="sessions-dispatch-empty">
        No dispatches recorded
      </p>
    )
  }
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" data-slot="sessions-dispatch-list">
      {entries.map(([name, count]) => (
        <li key={name} className="flex items-center justify-between font-mono">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="truncate text-muted-foreground">{name}</span>
              </TooltipTrigger>
              <TooltipContent>Dispatches: {name}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="tabular-nums text-foreground">{count}</span>
        </li>
      ))}
    </ul>
  )
}

function SessionDetail({ session }: { session: SessionRow }) {
  const ralph = session.ralphState
  const boulder = session.boulderState
  const trail = session.recentToolTrail ?? []
  return (
    <div
      className="flex flex-col gap-3 border-t bg-muted/30 px-4 py-3 text-sm"
      data-slot="sessions-detail"
      id={`session-detail-${session.id}`}
    >
      <section className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Dispatch counts
        </h3>
        <DispatchList counts={session.dispatchCounts} />
      </section>

      {(ralph?.active || boulder?.active) && (
        <section className="flex flex-col gap-1.5" data-slot="sessions-continuation">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Continuation loop
          </h3>
          {ralph?.active ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    Active — iter {ralph.iteration ?? 0} / {ralph.maxIterations ?? 0}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  Started {ralph.startedAt ? new Date(ralph.startedAt).toLocaleString() : '--'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Boulder continuation active
            </p>
          )}
        </section>
      )}

      {session.stoppedAt && (
        <p className="text-xs text-muted-foreground">
          Stopped at {new Date(session.stoppedAt).toLocaleString()}
        </p>
      )}

      <section className="flex flex-col gap-1.5" data-slot="sessions-trail">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Recent tool trail
        </h3>
        {trail.length === 0 ? (
          <p className="text-xs text-muted-foreground">Empty</p>
        ) : (
          <ol className="flex flex-col gap-1 text-xs">
            {trail.map((t, i) => {
              const extra = t.path || t.commandSnippet || ''
              return (
                <li key={i} className="truncate font-mono text-muted-foreground">
                  <span className="text-foreground">{t.tool ?? '--'}</span>
                  {extra && ` — ${String(extra).slice(0, 120)}`}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

function SessionRowItem({
  session,
  expanded,
  onToggle,
}: {
  session: SessionRow
  expanded: boolean
  onToggle: () => void
}) {
  const started = session.startedAt
    ? new Date(session.startedAt).toLocaleString()
    : '--'
  const active = !session.stoppedAt
  const statusLabel = active ? 'active' : 'stopped'
  const errorCount = session.errorCount ?? 0
  const detailId = `session-detail-${session.id}`

  return (
    <li className="flex flex-col" data-slot="sessions-row">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        onClick={onToggle}
        className="group/row flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-slot="sessions-row-button"
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
                {session.displayTitle || truncateId(session.id)}
              </span>
            </TooltipTrigger>
            <TooltipContent>{session.id}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {started}
        </span>
        <Badge variant={active ? 'secondary' : 'outline'}>{statusLabel}</Badge>
        <ComposerBadge mode={session.composerMode} />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          tools {session.toolCallCount ?? 0}
        </span>
        <span
          className={
            errorCount > 0
              ? 'shrink-0 text-xs tabular-nums text-destructive'
              : 'shrink-0 text-xs tabular-nums text-muted-foreground'
          }
        >
          err {errorCount}
        </span>
      </button>
      {expanded && <SessionDetail session={session} />}
    </li>
  )
}

export default function SessionsTab() {
  const sessions = useDashboardStore((s) => s.data.sessions) as SessionRow[] | null
  const setSessions = useDashboardStore((s) => s.setSessions)
  const { sessionsSearch, sessionsSort } = useDashboardStore(
    useShallow((s) => ({
      sessionsSearch: s.ui.sessionsSearch,
      sessionsSort: s.ui.sessionsSort,
    })),
  )
  const setSessionsSearch = useDashboardStore((s) => s.setSessionsSearch)
  const setSessionsSort = useDashboardStore((s) => s.setSessionsSort)
  const expandedKeys = useDashboardStore(
    useShallow((s) => s.ui.expandedKeys.sessions),
  )
  const toggleExpanded = useDashboardStore((s) => s.toggleExpanded)

  const [draft, setDraft] = useState(sessionsSearch)
  const [state, setState] = useState<FetchState>(() =>
    isSessionRowArray(sessions) ? { status: 'ready' } : { status: 'loading' },
  )

  // Sync local draft if the store value changes externally (e.g. hydration).
  const lastExternalRef = useRef(sessionsSearch)
  useEffect(() => {
    if (sessionsSearch !== lastExternalRef.current && sessionsSearch !== draft) {
      setDraft(sessionsSearch)
      lastExternalRef.current = sessionsSearch
    } else {
      lastExternalRef.current = sessionsSearch
    }
  }, [sessionsSearch, draft])

  // Debounce draft → store.
  useEffect(() => {
    if (draft === sessionsSearch) return
    const id = setTimeout(() => {
      setSessionsSearch(draft)
      lastExternalRef.current = draft
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [draft, sessionsSearch, setSessionsSearch])

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    const r = await getSessions()
    if (!r.ok) {
      setState({ status: 'error', error: r.error })
      return
    }
    if (!isSessionRowArray(r.data)) {
      setState({
        status: 'error',
        error: { kind: 'parse', message: 'Unexpected /sessions response shape' },
      })
      return
    }
    setSessions(r.data)
    setState({ status: 'ready' })
  }, [setSessions])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : []
    const query = sessionsSearch.trim()
    const filteredList = query ? list.filter((row) => matchesQuery(row, query)) : list
    return [...filteredList].sort((a, b) => compareRows(a, b, sessionsSort))
  }, [sessions, sessionsSearch, sessionsSort])

  if (state.status === 'error') {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="sessions-error"
      >
        <p className="text-sm font-medium text-foreground">Failed to load sessions.</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {describeError(state.error)}
        </p>
        <Button onClick={() => void load()} size="sm" variant="outline">
          Retry
        </Button>
      </div>
    )
  }

  const isLoading = state.status === 'loading' && !isSessionRowArray(sessions)

  return (
    <div className="flex flex-col gap-3 p-3" data-slot="sessions-tab">
      <div className="flex flex-wrap items-center gap-2" data-slot="sessions-toolbar">
        <label className="sr-only" htmlFor="sessions-search">
          Search sessions
        </label>
        <Input
          id="sessions-search"
          type="search"
          placeholder="Search session ID, conversation ID, tool count…"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          className="max-w-sm"
          data-slot="sessions-search"
        />
        <label className="sr-only" htmlFor="sessions-sort">
          Sort sessions
        </label>
        <Select
          value={sessionsSort}
          onValueChange={(v) => setSessionsSort(v as SessionsSort)}
        >
          <SelectTrigger
            id="sessions-sort"
            aria-label="Sort sessions"
            data-slot="sessions-sort"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as SessionsSort[]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground" data-slot="sessions-count">
          {isLoading
            ? 'Loading…'
            : `${filtered.length} of ${sessions?.length ?? 0}`}
        </span>
      </div>

      <div
        className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
        data-slot="sessions-list-wrapper"
      >
        {isLoading ? (
          <div className="flex flex-col gap-2 p-3" data-slot="sessions-skeleton">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p
            className="p-6 text-center text-sm text-muted-foreground"
            data-slot="sessions-empty"
          >
            {sessionsSearch.trim()
              ? 'No sessions match your search.'
              : 'No sessions recorded yet.'}
          </p>
        ) : (
          <ul className="divide-y" data-slot="sessions-list">
            {filtered.map((session) => (
              <SessionRowItem
                key={session.id}
                session={session}
                expanded={expandedKeys.has(session.id)}
                onToggle={() => toggleExpanded('sessions', session.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/shallow'

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
import { getSessions } from '@/lib/api'
import { describeApiError } from '@/lib/api-error'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'
import {
  type SessionsSort,
  useDashboardStore,
} from '@/store/dashboard'

import { SessionRowItem } from './SessionsRow'
import {
  type FetchState,
  type SessionRow,
  SEARCH_DEBOUNCE_MS,
  SORT_LABELS,
  compareRows,
  isSessionRowArray,
  matchesQuery,
} from './sessions-filters'

export type { SessionRow } from './sessions-filters'

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

  useEffect(() => {
    const handler = () => {
      void load()
    }
    window.addEventListener(TAB_REFRESH_EVENT, handler)
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handler)
  }, [load])

  const filtered = useMemo(() => {
    const list = Array.isArray(sessions) ? sessions : []
    const query = sessionsSearch.trim()
    const filteredList = query ? list.filter((row) => matchesQuery(row, query)) : list
    return [...filteredList].sort((a, b) => compareRows(a, b, sessionsSort))
  }, [sessions, sessionsSearch, sessionsSort])

  if (state.status === 'error') {
    const copy = describeApiError(state.error)
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="sessions-error"
      >
        <p className="text-sm font-medium text-foreground">{copy.title}</p>
        <p className="max-w-md text-xs text-muted-foreground">
          {copy.subtitle}
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

/**
 * Agents tab: Gantt waterfall + list view of subagent runs.
 *
 * Data sources:
 * - GET `/agentHistory` (loaded once on mount). The handler returns
 *   `{ entries, count }` (see hooks/handlers/agent-history.ts). We fetch
 *   `?limit=20` so the Gantt stays legible; the `count` field is what the
 *   handler currently echoes back (= entries.length). For the cap label we
 *   prefer that field when present and fall back to `entries.length`.
 *   TODO(daemon): expose a true historical total separate from the page
 *   limit so the label can read "X of TRUE_TOTAL"; today the daemon caps
 *   at DEFAULT_QUERY_LIMIT=200 internally and `count` only reflects the
 *   page returned.
 * - SSE `data.agents` slice via `useDashboardStore`: overlays live
 *   `running` rows that haven't been persisted to history yet.
 *
 * Live updates:
 * - A 250ms `setInterval` bumps a `now` timestamp in state. Bars for
 *   running agents are recomputed via React on each tick (1 reflow / 250ms
 *   regardless of agent count). We DO NOT animate `width` per `rAF`
 *   per-agent: that would be ~60×N writes/s and is the explicit anti-rule
 *   from the W2.7 spec for >20 agents.
 *
 * Visual contract:
 * - One `<svg>` with `viewBox`. `preserveAspectRatio="none"` lets the SVG
 *   scale to container width while rows stay at fixed pixel height. Bar
 *   colors come from CSS status tokens (`--status-running`, `--status-ok`,
 *   `--status-error`, `--status-warn`).
 * - Tooltips: each bar has a transparent HTML `<button>` overlay sized to
 *   the bar's pixel bounds. Wrapping the button in a Radix `Tooltip` keeps
 *   keyboard focus + hover affordances trivial to wire (SVG `<rect>`
 *   inside an `asChild` Slot is finicky on jsdom/happy-dom in tests).
 *
 * Test seam:
 * - `agents` and `totalCount` props bypass the network fetch + store
 *   subscription so unit tests can render deterministic geometry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { type ApiError, getAgentHistory } from '@/lib/api'
import { describeApiError } from '@/lib/api-error'
import type { AgentRow as SseAgentRow } from '@/lib/sse-reducer'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'
import { useDashboardStore } from '@/store/dashboard'

import { GanttSkeleton, GanttView } from './AgentsGantt'
import { ListView, ViewToggle } from './AgentsList'
import {
  type AgentBar,
  type FetchState,
  type ViewMode,
  HISTORY_LIMIT,
  isObject,
  mergeAgents,
  normalizeHistoryEntry,
  normalizeSseAgent,
  useNow,
} from './agent-utils'

export type { AgentStatus, AgentBar } from './agent-utils'

type AgentsTabProps = {
  /** Test seam: when supplied, bypasses fetch and store subscription. */
  agents?: AgentBar[]
  /** Test seam: pairs with `agents` to drive the cap-label denominator. */
  totalCount?: number
  /** Test seam: disables the 250ms ticker. Defaults to `true`. */
  liveTicker?: boolean
}

export default function AgentsTab(props: AgentsTabProps = {}) {
  const isSeeded = props.agents !== undefined
  const liveTicker = props.liveTicker ?? !isSeeded
  const now = useNow(liveTicker)

  const sseAgents = useDashboardStore((s) => s.data.agents)
  const setStoreAgents = useDashboardStore((s) => s.setAgents)

  const [view, setView] = useState<ViewMode>('gantt')
  const [state, setState] = useState<FetchState>(() =>
    isSeeded ? { status: 'ready', entries: [], total: 0 } : { status: 'loading' },
  )
  const mounted = useRef(true)
  useEffect(() => () => { mounted.current = false }, [])

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    const r = await getAgentHistory({ limit: HISTORY_LIMIT })
    if (!mounted.current) return
    if (!r.ok) {
      setState({ status: 'error', error: r.error })
      return
    }
    const body = r.data
    let rawEntries: unknown[] = []
    let total = 0
    if (Array.isArray(body)) {
      rawEntries = body
      total = body.length
    } else if (isObject(body)) {
      const entries = body.entries
      rawEntries = Array.isArray(entries) ? entries : []
      const count = body.count
      total = typeof count === 'number' && Number.isFinite(count) ? count : rawEntries.length
    }
    const normalized = rawEntries
      .map(normalizeHistoryEntry)
      .filter((x): x is AgentBar => x !== null)
    setState({ status: 'ready', entries: normalized, total })
    setStoreAgents(rawEntries)
  }, [setStoreAgents])

  useEffect(() => {
    if (isSeeded) return
    void load()
  }, [isSeeded, load])

  useEffect(() => {
    if (isSeeded) return
    const handler = () => {
      void load()
    }
    window.addEventListener(TAB_REFRESH_EVENT, handler)
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handler)
  }, [isSeeded, load])

  const merged = useMemo<AgentBar[]>(() => {
    if (props.agents) return [...props.agents].sort((a, b) => a.startedAt - b.startedAt)
    if (state.status !== 'ready') return []
    const sse = Array.isArray(sseAgents)
      ? sseAgents
          .filter((x): x is SseAgentRow =>
            isObject(x) && typeof (x as { agent_id?: unknown }).agent_id === 'string',
          )
          .map(normalizeSseAgent)
      : []
    return mergeAgents(state.entries, sse)
  }, [props.agents, state, sseAgents])

  const fallbackTotal = isSeeded
    ? merged.length
    : state.status === 'ready'
      ? state.total
      : merged.length
  const totalCount = props.totalCount ?? fallbackTotal
  const shownCount = merged.length

  if (state.status === 'error') {
    const copy = describeApiError(state.error)
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="agents-error"
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

  const isLoading = state.status === 'loading' && merged.length === 0

  return (
    <div className="flex flex-col gap-3 p-3" data-slot="agents-tab">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Agents</span>
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-normal text-muted-foreground"
                data-testid="agents-history-cap-label"
              >
                {`Showing ${shownCount} most recent of ${totalCount} total`}
              </span>
              <ViewToggle view={view} onChange={setView} />
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <GanttSkeleton />
          ) : view === 'gantt' ? (
            <GanttView agents={merged} now={now} />
          ) : (
            <ListView agents={merged} now={now} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

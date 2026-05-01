/**
 * Agents tab — Gantt waterfall + list view of subagent runs.
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
 * - SSE `data.agents` slice via `useDashboardStore` — overlays live
 *   `running` rows that haven't been persisted to history yet.
 *
 * Live updates:
 * - A 250ms `setInterval` bumps a `now` timestamp in state. Bars for
 *   running agents are recomputed via React on each tick (1 reflow / 250ms
 *   regardless of agent count). We DO NOT animate `width` per `rAF`
 *   per-agent — that would be ~60×N writes/s and is the explicit anti-rule
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
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { type ApiError, getAgentHistory } from '@/lib/api'
import type { AgentRow as SseAgentRow } from '@/lib/sse-reducer'
import { useDashboardStore } from '@/store/dashboard'

export type AgentStatus = 'running' | 'done' | 'failed' | 'abandoned'

export type AgentBar = {
  id: string
  type: string
  description?: string
  startedAt: number
  stoppedAt: number | null
  status: AgentStatus
  errorContext?: string | null
}

const HISTORY_LIMIT = 20
const TICK_MS = 250
const BAR_HEIGHT = 18
const ROW_HEIGHT = 26
const GUTTER_TOP = 28
const GUTTER_BOTTOM = 8
const VIEW_W = 1000
const PAD_X = 12
const TICK_COUNT = 5

const STATUS_FILL: Record<AgentStatus, string> = {
  running: 'var(--status-running)',
  done: 'var(--status-ok)',
  failed: 'var(--status-error)',
  abandoned: 'var(--status-warn)',
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'Running',
  done: 'Completed',
  failed: 'Failed',
  abandoned: 'Abandoned',
}

type ViewMode = 'gantt' | 'list'

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; entries: AgentBar[]; total: number }

type AgentsTabProps = {
  /** Test seam — when supplied, bypasses fetch and store subscription. */
  agents?: AgentBar[]
  /** Test seam — pairs with `agents` to drive the cap-label denominator. */
  totalCount?: number
  /** Test seam — disables the 250ms ticker. Defaults to `true`. */
  liveTicker?: boolean
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

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeStatus(raw: unknown): AgentStatus {
  if (raw === 'running' || raw === 'failed' || raw === 'abandoned') return raw
  if (raw === 'done' || raw === 'completed') return 'done'
  return 'done'
}

function normalizeHistoryEntry(raw: unknown): AgentBar | null {
  if (!isObject(raw)) return null
  const id = typeof raw.agentId === 'string' ? raw.agentId : null
  const startedAt = typeof raw.startTime === 'number' ? raw.startTime : null
  if (!id || startedAt === null) return null
  const completedAt =
    typeof raw.completedAt === 'number' ? raw.completedAt : null
  return {
    id,
    type: typeof raw.agentType === 'string' ? raw.agentType : 'unknown',
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    startedAt,
    stoppedAt: completedAt,
    status: normalizeStatus(raw.status),
    errorContext:
      typeof raw.errorContext === 'string' ? raw.errorContext : null,
  }
}

function normalizeSseAgent(raw: SseAgentRow): AgentBar {
  return {
    id: raw.agent_id,
    type: raw.agent_type,
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    startedAt: raw.startedAt,
    stoppedAt: typeof raw.stoppedAt === 'number' ? raw.stoppedAt : null,
    status: normalizeStatus(raw.status),
    errorContext:
      typeof raw.errorContext === 'string' ? raw.errorContext : null,
  }
}

/**
 * Merge live SSE rows into the historical list, preferring the SSE row
 * (it carries fresher status flips). Sort by startedAt ascending so the
 * Gantt reads top-down chronologically.
 */
function mergeAgents(history: AgentBar[], sse: AgentBar[]): AgentBar[] {
  const byId = new Map<string, AgentBar>()
  for (const a of history) byId.set(a.id, a)
  for (const a of sse) byId.set(a.id, a)
  return Array.from(byId.values()).sort((a, b) => a.startedAt - b.startedAt)
}

function useNow(enabled: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

type Geometry = {
  rowH: number
  bars: Array<{ x: number; y: number; w: number; h: number }>
  ticks: Array<{ x: number; label: string }>
  minStart: number
  maxEnd: number
  rangeMs: number
}

function formatRelative(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < 1000) return `${ms.toFixed(0)}ms`
  if (abs < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (abs < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

function computeGeometry(agents: AgentBar[], now: number): Geometry {
  const rowH = GUTTER_TOP + agents.length * ROW_HEIGHT + GUTTER_BOTTOM
  if (agents.length === 0) {
    return { rowH, bars: [], ticks: [], minStart: 0, maxEnd: 0, rangeMs: 0 }
  }
  const minStart = agents.reduce(
    (m, a) => (a.startedAt < m ? a.startedAt : m),
    agents[0]!.startedAt,
  )
  const maxEnd = agents.reduce(
    (m, a) => Math.max(m, a.stoppedAt ?? now),
    minStart,
  )
  const rangeMs = Math.max(maxEnd - minStart, 1)
  const usable = VIEW_W - PAD_X * 2
  const bars = agents.map((a, i) => {
    const x = PAD_X + ((a.startedAt - minStart) / rangeMs) * usable
    const end = a.stoppedAt ?? now
    const w = Math.max(((end - a.startedAt) / rangeMs) * usable, 2)
    const y = GUTTER_TOP + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
    return { x, y, w, h: BAR_HEIGHT }
  })
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const frac = i / (TICK_COUNT - 1)
    return {
      x: PAD_X + frac * usable,
      label: formatRelative(frac * rangeMs),
    }
  })
  return { rowH, bars, ticks, minStart, maxEnd, rangeMs }
}

function ariaForBar(a: AgentBar, now: number): string {
  const end = a.stoppedAt ?? now
  const dur = Math.max(0, end - a.startedAt)
  return `${a.type} ${STATUS_LABEL[a.status].toLowerCase()} for ${formatRelative(dur)}${
    a.description ? ` — ${a.description}` : ''
  }`
}

function GanttView({
  agents,
  now,
}: {
  agents: AgentBar[]
  now: number
}) {
  const geom = useMemo(() => computeGeometry(agents, now), [agents, now])

  if (agents.length === 0) {
    return (
      <p
        className="px-3 py-8 text-center text-sm text-muted-foreground"
        data-slot="agents-gantt-empty"
      >
        No agent activity in the recent history window.
      </p>
    )
  }

  const { rowH, bars, ticks } = geom

  return (
    <div className="relative w-full" data-slot="agents-gantt">
      <svg
        viewBox={`0 0 ${VIEW_W} ${rowH}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Agent Gantt waterfall"
        className="block w-full"
        style={{ height: `${rowH}px` }}
      >
        <g aria-hidden="true">
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={t.x}
                x2={t.x}
                y1={GUTTER_TOP - 6}
                y2={rowH - GUTTER_BOTTOM}
                stroke="var(--border)"
                strokeWidth={0.5}
                strokeDasharray="2 4"
              />
              <text
                x={t.x}
                y={GUTTER_TOP - 10}
                textAnchor={i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}
                fontSize={10}
                fill="var(--muted-foreground)"
                fontFamily="var(--font-sans)"
              >
                {t.label}
              </text>
            </g>
          ))}
        </g>
        {agents.map((a, i) => {
          const b = bars[i]!
          return (
            <g key={a.id} data-slot="agents-gantt-bar" data-agent-id={a.id}>
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={2}
                ry={2}
                fill={STATUS_FILL[a.status]}
                opacity={0.85}
                data-status={a.status}
                aria-hidden="true"
              >
                <title>{ariaForBar(a, now)}</title>
              </rect>
            </g>
          )
        })}
      </svg>

      <div
        className="pointer-events-none absolute inset-0"
        data-slot="agents-gantt-overlay"
      >
        <TooltipProvider delayDuration={150}>
          {agents.map((a, i) => {
            const b = bars[i]!
            const leftPct = (b.x / VIEW_W) * 100
            const widthPct = (b.w / VIEW_W) * 100
            return (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="pointer-events-auto absolute rounded-sm bg-transparent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                    style={{
                      left: `${leftPct}%`,
                      top: `${b.y}px`,
                      width: `${widthPct}%`,
                      height: `${b.h}px`,
                    }}
                    aria-label={ariaForBar(a, now)}
                    data-testid={`agent-bar-${a.id}`}
                    data-status={a.status}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <AgentTooltipBody agent={a} now={now} />
                </TooltipContent>
              </Tooltip>
            )
          })}
        </TooltipProvider>
      </div>
    </div>
  )
}

function AgentTooltipBody({ agent, now }: { agent: AgentBar; now: number }) {
  const end = agent.stoppedAt ?? now
  const dur = Math.max(0, end - agent.startedAt)
  return (
    <div className="flex max-w-xs flex-col gap-0.5">
      <div className="font-medium">
        <span className="font-mono text-[11px] opacity-80">{agent.type}</span>
        <span className="ml-1.5">{STATUS_LABEL[agent.status]}</span>
      </div>
      {agent.description ? (
        <div className="line-clamp-3 text-[11px] opacity-90">{agent.description}</div>
      ) : null}
      <div className="font-mono text-[10px] opacity-70">
        {formatRelative(dur)}
        {agent.stoppedAt === null ? ' (live)' : ''} · id {agent.id}
      </div>
      {agent.errorContext ? (
        <div className="mt-1 line-clamp-3 text-[11px] text-status-error opacity-90">
          {agent.errorContext}
        </div>
      ) : null}
    </div>
  )
}

function ListView({ agents, now }: { agents: AgentBar[]; now: number }) {
  if (agents.length === 0) {
    return (
      <p
        className="px-3 py-8 text-center text-sm text-muted-foreground"
        data-slot="agents-list-empty"
      >
        No agent activity in the recent history window.
      </p>
    )
  }
  return (
    <div className="overflow-x-auto" data-slot="agents-list">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-2 py-1.5 font-medium">Type</th>
            <th className="px-2 py-1.5 font-medium">Status</th>
            <th className="px-2 py-1.5 font-medium">Started</th>
            <th className="px-2 py-1.5 font-medium">Duration</th>
            <th className="px-2 py-1.5 font-medium">Description</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => {
            const end = a.stoppedAt ?? now
            const dur = Math.max(0, end - a.startedAt)
            return (
              <tr
                key={a.id}
                className="border-b border-border/50 hover:bg-muted/30"
                data-agent-id={a.id}
                data-status={a.status}
              >
                <td className="px-2 py-1.5 font-mono text-[12px]">{a.type}</td>
                <td className="px-2 py-1.5">
                  <span
                    className="inline-flex items-center gap-1.5 text-xs"
                    data-slot="agents-list-status"
                  >
                    <span
                      aria-hidden="true"
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: STATUS_FILL[a.status] }}
                    />
                    {STATUS_LABEL[a.status]}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                  {new Date(a.startedAt).toLocaleTimeString()}
                </td>
                <td className="px-2 py-1.5 font-mono text-[11px]">
                  {formatRelative(dur)}
                  {a.stoppedAt === null ? ' (live)' : ''}
                </td>
                <td className="px-2 py-1.5 text-[12px] text-muted-foreground">
                  {a.description ?? <span className="opacity-60">—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode
  onChange: (next: ViewMode) => void
}) {
  return (
    <div
      role="group"
      aria-label="Agents view"
      className="inline-flex overflow-hidden rounded-md border border-border"
      data-slot="agents-view-toggle"
    >
      <Button
        size="xs"
        variant={view === 'gantt' ? 'secondary' : 'ghost'}
        onClick={() => onChange('gantt')}
        aria-pressed={view === 'gantt'}
        className="rounded-none border-0"
      >
        Gantt
      </Button>
      <Button
        size="xs"
        variant={view === 'list' ? 'secondary' : 'ghost'}
        onClick={() => onChange('list')}
        aria-pressed={view === 'list'}
        className="rounded-none border-0 border-l border-border"
      >
        List
      </Button>
    </div>
  )
}

function GanttSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" data-slot="agents-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  )
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
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
        data-slot="agents-error"
      >
        <p className="text-sm font-medium text-foreground">
          Failed to load agent history.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          {describeError(state.error)}
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

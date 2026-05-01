import { useEffect, useMemo, useRef, useState } from 'react'

import { Sparkline } from '@/components/Sparkline'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { type ApiError, getHealth, type Result } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useDashboardStore } from '@/store/dashboard'
import {
  useDispatchCounts,
  useHealth,
  useRecentErrors,
  useSseStatus,
} from '@/store/selectors'

type Health = {
  uptime?: number
  toolCalls?: number
  conversations?: number
  currentConversationId?: string
  exploreCounts?: number
  workerCounts?: number
  continuationLoopsActive?: number
}

type RecentError = {
  ts?: number
  hook?: string
  event?: string
  action?: string
  message?: string
  msg?: string
  error?: string
}

const SAMPLE_CAP = 30
const ERROR_DISPLAY_CAP = 5

const STATUS_LABEL: Record<
  'idle' | 'connected' | 'reconnecting' | 'shutdown',
  string
> = {
  idle: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  shutdown: 'Offline',
}

export default function StatusTab() {
  const sseStatus = useSseStatus()
  const storeHealth = useHealth() as Health | null
  const dispatchCounts = useDispatchCounts()
  const recentErrors = useRecentErrors() as RecentError[]
  const setHealth = useDashboardStore((s) => s.setHealth)
  const setActiveTab = useDashboardStore((s) => s.setActiveTab)
  const setEventsFilter = useDashboardStore((s) => s.setEventsFilter)

  const [loading, setLoading] = useState(storeHealth === null)
  const [error, setError] = useState<ApiError | null>(null)
  const [exploreSeries, setExploreSeries] = useState<number[]>([])
  const [workerSeries, setWorkerSeries] = useState<number[]>([])

  // Snapshot dispatch counts into a 30-sample ring whenever the store slice
  // changes. Sparklines need a sequence of values; the store only holds the
  // latest counter, so we keep history locally for the lifetime of this tab.
  useEffect(() => {
    setExploreSeries((prev) => [...prev, dispatchCounts.explore].slice(-SAMPLE_CAP))
    setWorkerSeries((prev) => [...prev, dispatchCounts.worker].slice(-SAMPLE_CAP))
  }, [dispatchCounts])

  const fetchHealth = useMemo(
    () => async () => {
      const r: Result<unknown> = await getHealth()
      if (r.ok) {
        setHealth(r.data)
        setError(null)
      } else {
        setError(r.error)
      }
      setLoading(false)
    },
    [setHealth],
  )

  // Initial load: fetch once on mount. SSE will keep the slice fresh after.
  const didInitialFetch = useRef(false)
  useEffect(() => {
    if (didInitialFetch.current) return
    didInitialFetch.current = true
    void fetchHealth()
  }, [fetchHealth])

  // P1-7: when SSE reconnects, stale counters can drift from the server's
  // truth (we may have missed `tool_call` events while offline). Refetch
  // /health on the offline → connected edge to resync.
  const lastStatusRef = useRef(sseStatus)
  useEffect(() => {
    if (lastStatusRef.current !== 'connected' && sseStatus === 'connected') {
      void fetchHealth()
    }
    lastStatusRef.current = sseStatus
  }, [sseStatus, fetchHealth])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-status-error">{describeError(error)}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true)
              setError(null)
              void fetchHealth()
            }}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    )
  }

  const health = storeHealth ?? {}
  const errorsToShow = recentErrors.slice(0, ERROR_DISPLAY_CAP)

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>System status</CardTitle>
        <CardAction>
          <ConnectionBadge status={sseStatus} />
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-6 pt-2">
        <IdentityStrip health={health} />

        <Separator />

        <DispatchGrid
          health={health}
          dispatchCounts={dispatchCounts}
          exploreSeries={exploreSeries}
          workerSeries={workerSeries}
        />

        <Separator />

        <RecentErrorsSection
          errors={errorsToShow}
          totalCount={recentErrors.length}
          onViewAll={() => {
            setEventsFilter('errors')
            setActiveTab('events')
          }}
        />
      </CardContent>
    </Card>
  )
}

function ConnectionBadge({
  status,
}: {
  status: 'idle' | 'connected' | 'reconnecting' | 'shutdown'
}) {
  const isLive = status === 'connected'
  const tone =
    status === 'connected'
      ? 'text-status-ok'
      : status === 'reconnecting'
        ? 'text-status-warn'
        : status === 'shutdown'
          ? 'text-status-error'
          : 'text-muted-foreground'
  return (
    <Badge
      variant="outline"
      className="gap-1.5"
      data-testid="sse-status"
      data-status={status}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block size-1.5 rounded-full bg-current',
          tone,
          isLive && 'animate-pulse',
        )}
      />
      <span className={cn('text-xs', tone)}>{STATUS_LABEL[status]}</span>
    </Badge>
  )
}

function IdentityStrip({ health }: { health: Health }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
      <Field label="Session" value={truncSessionId(health.currentConversationId)} mono />
      <Field label="Uptime" value={formatUptime(health.uptime)} />
      <Field
        label="Active sessions"
        value={health.conversations?.toString() ?? '—'}
      />
    </dl>
  )
}

function DispatchGrid({
  health,
  dispatchCounts,
  exploreSeries,
  workerSeries,
}: {
  health: Health
  dispatchCounts: { explore: number; worker: number; total: number }
  exploreSeries: number[]
  workerSeries: number[]
}) {
  const toolCalls =
    typeof health.toolCalls === 'number' ? health.toolCalls : dispatchCounts.total
  const continuationLoops = health.continuationLoopsActive ?? 0
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      <DispatchCell label="Tool calls" value={toolCalls}>
        <span className="text-xs text-muted-foreground">
          {continuationLoops > 0
            ? `${continuationLoops} continuation loop${continuationLoops === 1 ? '' : 's'}`
            : 'No active loops'}
        </span>
      </DispatchCell>
      <DispatchCell
        label="Explore dispatches"
        value={dispatchCounts.explore || (health.exploreCounts ?? 0)}
      >
        <Sparkline
          data={exploreSeries}
          ariaLabel="Explore dispatch trend"
          className="h-6 w-full text-chart-1"
        />
      </DispatchCell>
      <DispatchCell
        label="Worker dispatches"
        value={dispatchCounts.worker || (health.workerCounts ?? 0)}
      >
        <Sparkline
          data={workerSeries}
          ariaLabel="Worker dispatch trend"
          className="h-6 w-full text-chart-2"
        />
      </DispatchCell>
    </div>
  )
}

function DispatchCell({
  label,
  value,
  children,
}: {
  label: string
  value: number
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-xl tabular-nums">{value}</span>
      </div>
      {children}
    </div>
  )
}

function RecentErrorsSection({
  errors,
  totalCount,
  onViewAll,
}: {
  errors: RecentError[]
  totalCount: number
  onViewAll: () => void
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm">Recent errors</h2>
        <Button
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={onViewAll}
          data-testid="view-all-errors"
        >
          View all errors
          {totalCount > ERROR_DISPLAY_CAP ? ` (${totalCount})` : ''}
        </Button>
      </header>
      {errors.length === 0 ? (
        <p className="text-xs text-muted-foreground">No recent errors.</p>
      ) : (
        <ul className="space-y-1.5" data-testid="recent-errors">
          {errors.map((e, i) => (
            <li
              key={`${e.ts ?? i}-${i}`}
              className="flex items-start gap-3 text-xs"
            >
              <span className="shrink-0 w-20 text-muted-foreground tabular-nums">
                {formatTime(e.ts)}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {e.hook ?? e.event ?? e.action ?? 'error'}
              </span>
              <span
                className="truncate text-status-error"
                title={errorMessage(e)}
              >
                {errorMessage(e)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={cn('truncate text-sm', mono && 'font-mono text-xs')}>
        {value}
      </dd>
    </div>
  )
}

function formatUptime(seconds?: number): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '—'
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function truncSessionId(id?: string): string {
  if (!id) return '—'
  return id.length > 14 ? `${id.slice(0, 12)}…` : id
}

function formatTime(ts?: number): string {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) return '--:--:--'
  return new Date(ts).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function errorMessage(e: RecentError): string {
  return e.message ?? e.msg ?? e.error ?? 'Error'
}

function describeError(err: ApiError): string {
  switch (err.kind) {
    case 'http':
      return `Daemon returned HTTP ${err.status}${err.message ? ` — ${err.message}` : ''}.`
    case 'network':
      return `Daemon unreachable: ${err.message}`
    case 'parse':
      return `Daemon response could not be parsed: ${err.message}`
  }
}

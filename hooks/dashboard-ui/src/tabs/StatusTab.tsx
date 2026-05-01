import { useEffect, useMemo, useRef, useState } from 'react'

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
import { describeApiError } from '@/lib/api-error'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'
import { useDashboardStore } from '@/store/dashboard'
import {
  useDispatchCounts,
  useHealth,
  useRecentErrors,
  useSseStatus,
} from '@/store/selectors'

import { DispatchGrid, IdentityStrip, type Health } from './StatusDispatchPanel'
import {
  ConnectionBadge,
  ERROR_DISPLAY_CAP,
  RecentErrorsSection,
  type RecentError,
} from './StatusErrorsPanel'

const SAMPLE_CAP = 30

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

  useEffect(() => {
    const handler = () => {
      void fetchHealth()
    }
    window.addEventListener(TAB_REFRESH_EVENT, handler)
    return () => window.removeEventListener(TAB_REFRESH_EVENT, handler)
  }, [fetchHealth])

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
    const copy = describeApiError(error)
    return (
      <Card>
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm font-medium text-status-error">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.subtitle}</p>
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

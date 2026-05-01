import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type RecentError = {
  ts?: number
  hook?: string
  event?: string
  action?: string
  message?: string
  msg?: string
  error?: string
}

export const ERROR_DISPLAY_CAP = 5

const STATUS_LABEL: Record<
  'idle' | 'connected' | 'reconnecting' | 'shutdown',
  string
> = {
  idle: 'Connecting',
  connected: 'Live',
  reconnecting: 'Reconnecting',
  shutdown: 'Offline',
}

export function ConnectionBadge({
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

export function RecentErrorsSection({
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

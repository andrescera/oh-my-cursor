import { cn } from '@/lib/utils'

// Loose structural shape: the daemon emits a heterogeneous union (tool
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

export function eventKey(e: DashboardEvent, idx: number): string {
  return `${e.ts ?? 0}:${e.event ?? ''}:${e.tool ?? ''}:${idx}`
}

export function formatTime(ts: number | undefined): string {
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

export function EventRow({ event, rowId, expanded, onToggle }: EventRowProps) {
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

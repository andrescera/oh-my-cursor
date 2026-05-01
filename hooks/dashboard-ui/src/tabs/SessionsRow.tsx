import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { type SessionRow, truncateId } from './sessions-filters'

export type { SessionRow }

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
                    Active: iteration {ralph.iteration ?? 0} of {ralph.maxIterations ?? 0}
                  </p>
                </TooltipTrigger>
                <TooltipContent>
                  {ralph.startedAt
                    ? `Started ${new Date(ralph.startedAt).toLocaleString()}`
                    : 'Start time unavailable'}
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
                  <span className="text-foreground">{t.tool ?? 'tool'}</span>
                  {extra && `: ${String(extra).slice(0, 120)}`}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </div>
  )
}

export function SessionRowItem({
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
    : ''
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
          {session.toolCallCount ?? 0} tool calls
        </span>
        <span
          className={
            errorCount > 0
              ? 'shrink-0 text-xs tabular-nums text-destructive'
              : 'shrink-0 text-xs tabular-nums text-muted-foreground'
          }
        >
          {errorCount} errors
        </span>
      </button>
      {expanded && <SessionDetail session={session} />}
    </li>
  )
}

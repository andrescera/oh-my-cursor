import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/components/ui/badge'
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
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { getChannelStatus, getIntrospection, type ApiError } from '@/lib/api'
import { describeApiError } from '@/lib/api-error'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'

/**
 * Read-only hook channel-status matrix. Renders the typed knowledge table
 * served by the daemon's `GET /channel-status` route (source of truth:
 * `hooks/lib/channel-status.ts`). Rows = hook events, columns = output fields;
 * each cell is a status chip. No live probing, no editable cells.
 */

type ChannelStatusValue = 'works' | 'broken' | 'unsupported' | 'unconfirmed'

type ChannelField =
  | 'permission'
  | 'updated_input'
  | 'additional_context'
  | 'followup_message'
  | 'env'

type ChannelCell = {
  status: ChannelStatusValue
  evidenceRef?: string
  asOfVersion?: string
  threadUrl?: string
}

type ChannelRow = {
  event: string
  cells: Partial<Record<ChannelField, ChannelCell>>
}

const FIELDS: readonly ChannelField[] = [
  'permission',
  'updated_input',
  'additional_context',
  'followup_message',
  'env',
]

const FIELD_LABELS: Record<ChannelField, string> = {
  permission: 'permission',
  updated_input: 'updated_input',
  additional_context: 'additional_context',
  followup_message: 'followup_message',
  env: 'env',
}

const STATUS_LABELS: Record<ChannelStatusValue, string> = {
  works: 'works',
  broken: 'broken',
  unsupported: 'unsup',
  unconfirmed: 'uncfm',
}

const STATUS_CHIP: Record<ChannelStatusValue, string> = {
  works:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  broken: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400',
  unconfirmed:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  unsupported: 'border-border bg-muted text-muted-foreground',
}

const STATUS_LEGEND: readonly { status: ChannelStatusValue; copy: string }[] = [
  { status: 'works', copy: 'works' },
  { status: 'broken', copy: 'broken' },
  { status: 'unconfirmed', copy: 'unconfirmed' },
  { status: 'unsupported', copy: 'unsupported' },
]

const DEFAULT_CELL: ChannelCell = { status: 'unconfirmed' }

type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; rows: ChannelRow[]; cursorVersion?: string }

function isChannelStatusResponse(v: unknown): v is { table: ChannelRow[] } {
  if (!v || typeof v !== 'object') return false
  const table = (v as Record<string, unknown>).table
  return Array.isArray(table) && table.every(isChannelRow)
}

function isChannelRow(v: unknown): v is ChannelRow {
  if (!v || typeof v !== 'object') return false
  const r = v as Record<string, unknown>
  return typeof r.event === 'string' && typeof r.cells === 'object' && r.cells !== null
}

function extractCursorVersion(v: unknown): string | undefined {
  if (!v || typeof v !== 'object') return undefined
  const cv = (v as Record<string, unknown>).cursorVersion
  return typeof cv === 'string' && cv.length > 0 ? cv : undefined
}

function StatusChip({ cell }: { cell: ChannelCell }) {
  return (
    <span
      className={`inline-flex min-w-[3.25rem] items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[cell.status]}`}
      aria-label={`${cell.status}`}
    >
      {STATUS_LABELS[cell.status]}
    </span>
  )
}

function MatrixCell({
  event,
  field,
  cell,
}: {
  event: string
  field: ChannelField
  cell: ChannelCell
}) {
  return (
    <td
      className="px-2 py-1.5 text-center align-middle"
      data-slot="channel-cell"
      data-event={event}
      data-field={field}
      data-status={cell.status}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="cursor-default rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <StatusChip cell={cell} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="flex max-w-xs flex-col gap-1 text-left">
          <span className="font-mono text-[11px]">
            {event}.{field}
          </span>
          <span className="font-semibold capitalize">{cell.status}</span>
          {cell.evidenceRef ? (
            <span className="text-[11px] opacity-90">{cell.evidenceRef}</span>
          ) : (
            <span className="text-[11px] opacity-75">
              No live-fire verdict yet.
            </span>
          )}
          {cell.asOfVersion ? (
            <span className="text-[11px] opacity-75">
              as of Cursor {cell.asOfVersion}
            </span>
          ) : null}
          {cell.threadUrl ? (
            <a
              href={cell.threadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] underline underline-offset-2"
            >
              forum thread
            </a>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </td>
  )
}

export default function ChannelMatrix() {
  const [state, setState] = useState<FetchState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    // /channel-status is the source of truth; /introspection only decorates the
    // header. A failed introspection must not block the matrix.
    let channelResult: Awaited<ReturnType<typeof getChannelStatus>>
    let introspectionResult: Awaited<ReturnType<typeof getIntrospection>>
    try {
      ;[channelResult, introspectionResult] = await Promise.all([
        getChannelStatus(),
        getIntrospection(),
      ])
    } catch (err) {
      setState({
        status: 'error',
        error: {
          kind: 'network',
          message: err instanceof Error ? err.message : String(err),
        },
      })
      return
    }

    if (!channelResult.ok) {
      setState({ status: 'error', error: channelResult.error })
      return
    }
    if (!isChannelStatusResponse(channelResult.data)) {
      setState({
        status: 'error',
        error: { kind: 'parse', message: 'Unexpected /channel-status shape' },
      })
      return
    }

    const cursorVersion =
      introspectionResult.ok ? extractCursorVersion(introspectionResult.data) : undefined

    setState({
      status: 'ready',
      rows: channelResult.data.table,
      cursorVersion,
    })
  }, [])

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

  return (
    <Card data-slot="channel-matrix">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Hook channel status</span>
          {state.status === 'ready' && (
            <Badge variant="outline" data-slot="channel-matrix-version">
              {state.cursorVersion
                ? `Cursor ${state.cursorVersion}`
                : 'version unknown'}
            </Badge>
          )}
        </CardTitle>
        <div
          className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground"
          data-slot="channel-matrix-legend"
        >
          {STATUS_LEGEND.map((entry) => (
            <span key={entry.status} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={`size-2 rounded-full border ${STATUS_CHIP[entry.status]}`}
              />
              {entry.copy}
            </span>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {state.status === 'loading' ? (
          <div className="flex flex-col gap-2" data-slot="channel-matrix-skeleton">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : state.status === 'error' ? (
          <div
            className="flex flex-col items-center justify-center gap-3 py-8 text-center"
            data-slot="channel-matrix-error"
          >
            <p className="text-sm font-medium text-foreground">
              {describeApiError(state.error).title}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              Channel matrix unavailable. {describeApiError(state.error).subtitle}
            </p>
            <Button onClick={() => void load()} size="sm" variant="outline">
              Retry
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-sm"
              data-slot="channel-matrix-table"
            >
              <caption className="sr-only">
                Hook event by output field channel status matrix
              </caption>
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-2 py-2 text-left text-xs font-semibold text-muted-foreground"
                  >
                    event
                  </th>
                  {FIELDS.map((field) => (
                    <th
                      key={field}
                      scope="col"
                      className="px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground"
                    >
                      {FIELD_LABELS[field]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.rows.map((row) => (
                  <tr
                    key={row.event}
                    className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                    data-slot="channel-matrix-row"
                    data-event={row.event}
                  >
                    <th
                      scope="row"
                      className="px-2 py-1.5 text-left font-mono text-[12px] font-normal whitespace-nowrap"
                    >
                      {row.event}
                    </th>
                    {FIELDS.map((field) => (
                      <MatrixCell
                        key={field}
                        event={row.event}
                        field={field}
                        cell={row.cells[field] ?? DEFAULT_CELL}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

import type { ReactNode } from 'react'

import { Sparkline } from '@/components/Sparkline'
import { cn } from '@/lib/utils'

export type Health = {
  uptime?: number
  toolCalls?: number
  conversations?: number
  currentConversationId?: string
  exploreCounts?: number
  workerCounts?: number
  continuationLoopsActive?: number
}

export function IdentityStrip({ health }: { health: Health }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
      <Field label="Session" value={truncSessionId(health.currentConversationId)} mono />
      <Field label="Uptime" value={formatUptime(health.uptime)} />
      <Field
        label="Active sessions"
        value={health.conversations?.toString() ?? '0'}
      />
    </dl>
  )
}

export function DispatchGrid({
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
  children: ReactNode
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
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return 'starting'
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
  if (!id) return 'N/A'
  return id.length > 14 ? `${id.slice(0, 12)}…` : id
}

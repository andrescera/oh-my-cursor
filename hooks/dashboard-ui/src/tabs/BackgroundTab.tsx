import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useDashboardStore } from '@/store/dashboard'

const RECENT_WINDOW_MS = 10 * 60 * 1000
const PRUNE_WINDOW_MS = 60 * 1000
const REFRESH_TICK_MS = 30_000

type TaskStatus = 'running' | 'completed' | 'failed' | 'done' | 'abandoned'

type RawTask = Record<string, unknown>

type NormalizedTask = {
  id: string
  type: string
  description?: string
  status: TaskStatus
  startTime: number
  finishedAt?: number
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

function isTaskStatus(v: unknown): v is TaskStatus {
  return (
    v === 'running' ||
    v === 'completed' ||
    v === 'failed' ||
    v === 'done' ||
    v === 'abandoned'
  )
}

// The store's `data.backgroundTasks` slot is fed by the SSE reducer's agent
// stream and the `/backgroundTasks` REST seed. Field names diverge between
// the two sources (camelCase vs snake_case), so normalize defensively.
function normalize(raw: RawTask): NormalizedTask | null {
  const id = pickString(raw.agentId, raw.agent_id, raw.id)
  if (!id) return null
  const type = pickString(raw.agentType, raw.agent_type, raw.type) ?? 'agent'
  const description = pickString(raw.description, raw.summary as string)
  const startTime = pickNumber(raw.startTime, raw.startedAt, raw.start_time) ?? 0
  const finishedAt = pickNumber(
    raw.stoppedAt,
    raw.completedAt,
    raw.finishedAt,
    raw.endedAt,
  )
  const status: TaskStatus = isTaskStatus(raw.status) ? raw.status : 'running'
  return { id, type, description, status, startTime, finishedAt }
}

function isFinished(t: NormalizedTask): boolean {
  return t.status !== 'running'
}

function formatRelative(ts: number, now: number): string {
  const delta = Math.max(0, now - ts)
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  return `${hr}h ago`
}

export default function BackgroundTab() {
  const tasks = useDashboardStore((s) => s.data.backgroundTasks)
  const autoPrune = useDashboardStore((s) => s.ui.backgroundAutoPrune)
  const setAutoPrune = useDashboardStore((s) => s.setBackgroundAutoPrune)

  // Tick every REFRESH_TICK_MS so the time-based prune window recomputes
  // even when the SSE store hasn't published a new event.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), REFRESH_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const { active, recent, now } = useMemo(() => {
    const list = Array.isArray(tasks)
      ? tasks
          .map((t) => normalize(t as RawTask))
          .filter((t): t is NormalizedTask => t !== null)
      : []
    const now = Date.now()
    const cutoff = now - (autoPrune ? PRUNE_WINDOW_MS : RECENT_WINDOW_MS)
    const active = list.filter((t) => !isFinished(t))
    const recent = list
      .filter(isFinished)
      .filter((t) => (t.finishedAt ?? t.startTime) >= cutoff)
      .sort(
        (a, b) =>
          (b.finishedAt ?? b.startTime) - (a.finishedAt ?? a.startTime),
      )
    return { active, recent, now }
    // `tick` is intentional: it forces re-evaluation of `Date.now()`
    // every REFRESH_TICK_MS so old entries fall out of the prune window.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, autoPrune, tick])

  const recentEmptyCopy = autoPrune
    ? 'No finished tasks in the last 60s.'
    : 'No finished tasks in the last 10 minutes.'

  return (
    <div className="flex flex-col gap-4 p-3" data-slot="background-tab">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-base font-medium">
            Background tasks
          </h2>
          <p className="text-xs text-muted-foreground">
            Active runs, plus recently finished agents.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAutoPrune(!autoPrune)}
          aria-pressed={autoPrune}
          data-slot="auto-prune-toggle"
          title={
            autoPrune
              ? 'Auto-prune is ON — finished tasks fall off after 60s.'
              : 'Auto-prune is OFF — finished tasks linger for 10 minutes.'
          }
        >
          <span
            aria-hidden="true"
            className={
              autoPrune
                ? 'size-1.5 rounded-full bg-status-ok'
                : 'size-1.5 rounded-full bg-muted-foreground/50'
            }
          />
          <span>Auto-prune {autoPrune ? 'on' : 'off'}</span>
        </Button>
      </header>

      <Card data-slot="bg-active">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-status-running"
            />
            <span>Active</span>
            <Badge variant="secondary" data-slot="bg-active-count">
              {active.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {active.length === 0 ? (
            <p
              className="py-3 text-center text-sm text-muted-foreground"
              data-slot="bg-active-empty"
            >
              No active background tasks.
            </p>
          ) : (
            <TaskList tasks={active} mode="active" now={now} />
          )}
        </CardContent>
      </Card>

      <Separator className="opacity-60" data-slot="bg-divider" />

      <Card data-slot="bg-recent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-muted-foreground/60"
            />
            <span>Recent</span>
            <Badge variant="outline" data-slot="bg-recent-count">
              {recent.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p
              className="py-3 text-center text-sm text-muted-foreground"
              data-slot="bg-recent-empty"
            >
              {recentEmptyCopy}
            </p>
          ) : (
            <TaskList tasks={recent} mode="recent" now={now} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function TaskList({
  tasks,
  mode,
  now,
}: {
  tasks: NormalizedTask[]
  mode: 'active' | 'recent'
  now: number
}) {
  return (
    <ul
      className="flex flex-col divide-y divide-border/60"
      data-slot="task-list"
    >
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} mode={mode} now={now} />
      ))}
    </ul>
  )
}

function TaskRow({
  task,
  mode,
  now,
}: {
  task: NormalizedTask
  mode: 'active' | 'recent'
  now: number
}) {
  const tone =
    task.status === 'failed'
      ? 'destructive'
      : task.status === 'running'
        ? 'secondary'
        : 'outline'
  const ts = mode === 'active' ? task.startTime : task.finishedAt ?? task.startTime
  const tsLabel = mode === 'active' ? 'Started' : 'Finished'
  return (
    <li
      className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
      data-slot="task-row"
      data-status={task.status}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-foreground">{task.type}</span>
          {task.description ? (
            <span className="truncate text-xs text-muted-foreground">
              {task.description}
            </span>
          ) : (
            <span className="truncate text-xs text-muted-foreground/70">
              {task.id}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {tsLabel} {formatRelative(ts, now)}
        </p>
      </div>
      <Badge variant={tone}>{task.status}</Badge>
    </li>
  )
}

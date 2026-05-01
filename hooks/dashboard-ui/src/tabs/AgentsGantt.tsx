import { useMemo } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  type AgentBar,
  GUTTER_BOTTOM,
  GUTTER_TOP,
  STATUS_FILL,
  STATUS_LABEL,
  VIEW_W,
  ariaForBar,
  computeGeometry,
  formatRelative,
} from './agent-utils'

export function GanttView({
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

export function AgentTooltipBody({ agent, now }: { agent: AgentBar; now: number }) {
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

export function GanttSkeleton() {
  return (
    <div className="flex flex-col gap-2 p-3" data-slot="agents-skeleton">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-5 w-full" />
      ))}
    </div>
  )
}

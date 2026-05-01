import { Button } from '@/components/ui/button'

import {
  type AgentBar,
  type ViewMode,
  STATUS_FILL,
  STATUS_LABEL,
  formatRelative,
} from './agent-utils'

export function ListView({ agents, now }: { agents: AgentBar[]; now: number }) {
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
                  {a.description ?? <span className="opacity-60">N/A</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ViewToggle({
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

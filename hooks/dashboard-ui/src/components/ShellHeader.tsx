import { useMemo } from 'react'
import { KeyboardIcon, MoonIcon, SunIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import { useDashboardStore } from '@/store/dashboard'
import { useDenseMode } from '@/store/selectors'

function ConversationSelector() {
  const selectedConversation = useDashboardStore(
    (s) => s.connection.selectedConversation,
  )
  const setSelectedConversation = useDashboardStore(
    (s) => s.setSelectedConversation,
  )
  const sessions = useDashboardStore((s) => s.data.sessions)

  const options = useMemo<{ value: string; label: string }[]>(() => {
    if (!Array.isArray(sessions) || sessions.length === 0) return []
    const seen = new Set<string>()
    const out: { value: string; label: string }[] = []
    for (const raw of sessions) {
      const s = raw as { conversationId?: string; id?: string; title?: string }
      const value = s?.conversationId ?? s?.id
      if (typeof value !== 'string' || seen.has(value)) continue
      seen.add(value)
      out.push({ value, label: s?.title ?? value })
    }
    return out
  }, [sessions])

  if (options.length === 0) {
    return (
      <Badge variant="outline" className="font-mono text-[11px]">
        no conversation
      </Badge>
    )
  }

  return (
    <Select
      value={selectedConversation ?? options[0]!.value}
      onValueChange={setSelectedConversation}
    >
      <SelectTrigger size="sm" aria-label="Select conversation" className="min-w-40">
        <SelectValue placeholder="Conversation" />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ShellHeader({
  onOpenShortcuts,
}: {
  onOpenShortcuts: () => void
}) {
  const denseMode = useDenseMode()
  const toggleDense = useDashboardStore((s) => s.toggleDense)

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card/30 px-4 py-2">
      <h1 className="text-sm font-semibold tracking-tight text-foreground">
        oh-my-cursor
        <span className="ml-2 text-muted-foreground">Dashboard</span>
      </h1>
      <Badge variant="outline" className="font-mono text-[11px]">
        v0
      </Badge>
      <div className="ml-auto flex items-center gap-2">
        <ConversationSelector />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={denseMode ? 'Switch to comfortable density' : 'Switch to dense density'}
              aria-pressed={denseMode}
              onClick={toggleDense}
            >
              {denseMode ? <SunIcon /> : <MoonIcon />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {denseMode ? 'Comfortable mode' : 'Dense mode'}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Show keyboard shortcuts"
              onClick={onOpenShortcuts}
            >
              <KeyboardIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Keyboard shortcuts (?)</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

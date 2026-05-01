import { useEffect, useState } from 'react'

import type { AgentRow as SseAgentRow } from '@/lib/sse-reducer'

export type AgentStatus = 'running' | 'done' | 'failed' | 'abandoned'

export type AgentBar = {
  id: string
  type: string
  description?: string
  startedAt: number
  stoppedAt: number | null
  status: AgentStatus
  errorContext?: string | null
}

export type ViewMode = 'gantt' | 'list'

export type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: import('@/lib/api').ApiError }
  | { status: 'ready'; entries: AgentBar[]; total: number }

export type Geometry = {
  rowH: number
  bars: Array<{ x: number; y: number; w: number; h: number }>
  ticks: Array<{ x: number; label: string }>
  minStart: number
  maxEnd: number
  rangeMs: number
}

export const HISTORY_LIMIT = 20
export const TICK_MS = 250
export const BAR_HEIGHT = 18
export const ROW_HEIGHT = 26
export const GUTTER_TOP = 28
export const GUTTER_BOTTOM = 8
export const VIEW_W = 1000
export const PAD_X = 12
export const TICK_COUNT = 5
export const MIN_RANGE_MS = 60_000

export const STATUS_FILL: Record<AgentStatus, string> = {
  running: 'var(--status-running)',
  done: 'var(--status-ok)',
  failed: 'var(--status-error)',
  abandoned: 'var(--status-warn)',
}

export const STATUS_LABEL: Record<AgentStatus, string> = {
  running: 'Running',
  done: 'Completed',
  failed: 'Failed',
  abandoned: 'Abandoned',
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function normalizeStatus(raw: unknown): AgentStatus {
  if (raw === 'running' || raw === 'failed' || raw === 'abandoned') return raw
  if (raw === 'done' || raw === 'completed') return 'done'
  return 'done'
}

export function normalizeHistoryEntry(raw: unknown): AgentBar | null {
  if (!isObject(raw)) return null
  const id = typeof raw.agentId === 'string' ? raw.agentId : null
  const startedAt = typeof raw.startTime === 'number' ? raw.startTime : null
  if (!id || startedAt === null) return null
  const completedAt =
    typeof raw.completedAt === 'number' ? raw.completedAt : null
  return {
    id,
    type: typeof raw.agentType === 'string' ? raw.agentType : 'unknown',
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    startedAt,
    stoppedAt: completedAt,
    status: normalizeStatus(raw.status),
    errorContext:
      typeof raw.errorContext === 'string' ? raw.errorContext : null,
  }
}

export function normalizeSseAgent(raw: SseAgentRow): AgentBar {
  return {
    id: raw.agent_id,
    type: raw.agent_type,
    description:
      typeof raw.description === 'string' ? raw.description : undefined,
    startedAt: raw.startedAt,
    stoppedAt: typeof raw.stoppedAt === 'number' ? raw.stoppedAt : null,
    status: normalizeStatus(raw.status),
    errorContext:
      typeof raw.errorContext === 'string' ? raw.errorContext : null,
  }
}

/**
 * Merge live SSE rows into the historical list, preferring the SSE row
 * (it carries fresher status flips). Sort by startedAt ascending so the
 * Gantt reads top-down chronologically.
 */
export function mergeAgents(history: AgentBar[], sse: AgentBar[]): AgentBar[] {
  const byId = new Map<string, AgentBar>()
  for (const a of history) byId.set(a.id, a)
  for (const a of sse) byId.set(a.id, a)
  return Array.from(byId.values()).sort((a, b) => a.startedAt - b.startedAt)
}

export function formatRelative(ms: number): string {
  const abs = Math.abs(ms)
  if (abs < 1000) return `${ms.toFixed(0)}ms`
  if (abs < 60_000) return `${(ms / 1000).toFixed(1)}s`
  if (abs < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

export function computeGeometry(agents: AgentBar[], now: number): Geometry {
  const rowH = GUTTER_TOP + agents.length * ROW_HEIGHT + GUTTER_BOTTOM
  if (agents.length === 0) {
    return { rowH, bars: [], ticks: [], minStart: 0, maxEnd: 0, rangeMs: 0 }
  }
  const minStart = agents.reduce(
    (m, a) => (a.startedAt < m ? a.startedAt : m),
    agents[0]!.startedAt,
  )
  const rawMaxEnd = agents.reduce(
    (m, a) => Math.max(m, a.stoppedAt ?? now),
    minStart,
  )
  const maxEnd = Math.max(rawMaxEnd, minStart + MIN_RANGE_MS)
  const rangeMs = Math.max(maxEnd - minStart, 1)
  const usable = VIEW_W - PAD_X * 2
  const bars = agents.map((a, i) => {
    const x = PAD_X + ((a.startedAt - minStart) / rangeMs) * usable
    const end = a.stoppedAt ?? now
    const w = Math.max(((end - a.startedAt) / rangeMs) * usable, 2)
    const y = GUTTER_TOP + i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2
    return { x, y, w, h: BAR_HEIGHT }
  })
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const frac = i / (TICK_COUNT - 1)
    return {
      x: PAD_X + frac * usable,
      label: formatRelative(frac * rangeMs),
    }
  })
  return { rowH, bars, ticks, minStart, maxEnd, rangeMs }
}

export function ariaForBar(a: AgentBar, now: number): string {
  const end = a.stoppedAt ?? now
  const dur = Math.max(0, end - a.startedAt)
  return `${a.type} ${STATUS_LABEL[a.status].toLowerCase()} for ${formatRelative(dur)}${
    a.description ? `: ${a.description}` : ''
  }`
}

export function useNow(enabled: boolean): number {
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

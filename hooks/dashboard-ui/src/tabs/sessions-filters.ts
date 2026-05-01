import type { SessionsSort } from '@/store/dashboard'
import type { ApiError } from '@/lib/api'

export type SessionRow = {
  id: string
  conversationId?: string | null
  startedAt?: string | null
  stoppedAt?: string | null
  displayTitle?: string | null
  composerMode?: 'plan' | 'agent' | null
  toolCallCount?: number
  errorCount?: number
  dispatchCounts?: Record<string, number> | null
  ralphState?: {
    active?: boolean
    iteration?: number
    maxIterations?: number
    startedAt?: string | null
  } | null
  boulderState?: { active?: boolean } | null
  recentToolTrail?: Array<{
    tool?: string
    path?: string
    commandSnippet?: string
  }> | null
}

export type FetchState =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready' }

export const SORT_LABELS: Record<SessionsSort, string> = {
  startTimeDesc: 'Start time (newest)',
  toolCountDesc: 'Tool count (highest)',
  errorCountDesc: 'Error count (highest)',
}

export const SEARCH_DEBOUNCE_MS = 150

export function truncateId(id: string, max = 14): string {
  if (!id) return ''
  return id.length > max ? `${id.slice(0, max - 1)}…` : id
}

export function isSessionRowArray(v: unknown): v is SessionRow[] {
  return Array.isArray(v) && v.every((r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string')
}

export function matchesQuery(row: SessionRow, needle: string): boolean {
  if (!needle) return true
  const haystacks: string[] = [
    row.id ?? '',
    row.conversationId ?? '',
    String(row.toolCallCount ?? ''),
    row.displayTitle ?? '',
  ]
  const n = needle.toLowerCase()
  return haystacks.some((h) => h.toLowerCase().includes(n))
}

export function compareRows(a: SessionRow, b: SessionRow, sort: SessionsSort): number {
  switch (sort) {
    case 'toolCountDesc':
      return (b.toolCallCount ?? 0) - (a.toolCallCount ?? 0)
    case 'errorCountDesc':
      return (b.errorCount ?? 0) - (a.errorCount ?? 0)
    case 'startTimeDesc':
    default: {
      const ta = a.startedAt ? Date.parse(a.startedAt) : 0
      const tb = b.startedAt ? Date.parse(b.startedAt) : 0
      return tb - ta
    }
  }
}

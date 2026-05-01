import { type EventsFilter } from '@/store/dashboard'
import { type DashboardEvent } from './EventsRow'

export type FilterOption = { id: EventsFilter; label: string }

export const FILTER_OPTIONS: readonly FilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'tools', label: 'Tools' },
  { id: 'dispatches', label: 'Dispatches' },
  { id: 'errors', label: 'Errors' },
  { id: 'denies', label: 'Denies' },
] as const

export const UNDO_WINDOW_MS = 5000
export const FETCH_LIMIT = 200
export const FOCUS_SEARCH_EVENT = 'omc-focus-events-search'

// Ported verbatim from `hooks/dashboard/render.ts:839-845` so the filter
// semantics match the legacy dashboard exactly.
export function applyFilter(
  events: readonly DashboardEvent[],
  filter: EventsFilter,
): DashboardEvent[] {
  switch (filter) {
    case 'tools':
      return events.filter(
        (e) =>
          typeof e.tool === 'string' &&
          !['Task', 'task', 'Agent', 'agent'].includes(e.tool),
      )
    case 'dispatches':
      return events.filter((e) => Boolean(e.agentType))
    case 'errors':
      return events.filter(
        (e) => Boolean(e.error) || e.event === '/postToolUseFailure',
      )
    case 'denies':
      return events.filter((e) => e.action === 'deny')
    case 'all':
    default:
      return events.slice()
  }
}

export function applySearch(
  events: readonly DashboardEvent[],
  query: string,
): DashboardEvent[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return events.slice()
  return events.filter((e) => {
    const hay = [e.event, e.tool, e.agentType, e.message]
      .filter((v): v is string => typeof v === 'string' && v.length > 0)
      .join(' ')
      .toLowerCase()
    return hay.includes(needle)
  })
}

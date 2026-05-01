import { useEffect } from 'react'

import {
  getAgentHistory,
  getBackgroundTasks,
  getHealth,
  getSessionLog,
  getSessions,
} from '@/lib/api'
import { useDashboardStore } from '@/store/dashboard'

function arrayFromAgentHistory(body: unknown): unknown[] {
  if (Array.isArray(body)) return body
  if (body && typeof body === 'object' && Array.isArray((body as { entries?: unknown[] }).entries)) {
    return (body as { entries: unknown[] }).entries
  }
  return []
}

// Seed shared store slices used by shell badges and the conversation selector.
// Individual tabs still own rich loading/error UI; this lightweight bootstrap
// prevents counts from looking empty until a tab has been visited.
export function useDashboardBootstrap(enabled: boolean): void {
  const setHealth = useDashboardStore((s) => s.setHealth)
  const setSessions = useDashboardStore((s) => s.setSessions)
  const setEvents = useDashboardStore((s) => s.setEvents)
  const setBackgroundTasks = useDashboardStore((s) => s.setBackgroundTasks)
  const setAgents = useDashboardStore((s) => s.setAgents)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    void Promise.all([
      getHealth().then((r) => {
        if (!cancelled && r.ok) setHealth(r.data)
      }),
      getSessions().then((r) => {
        if (!cancelled && r.ok && Array.isArray(r.data)) setSessions(r.data)
      }),
      getSessionLog({ limit: 500 }).then((r) => {
        if (!cancelled && r.ok && Array.isArray(r.data)) setEvents(r.data)
      }),
      getBackgroundTasks().then((r) => {
        if (!cancelled && r.ok && Array.isArray(r.data)) setBackgroundTasks(r.data)
      }),
      getAgentHistory({ limit: 20 }).then((r) => {
        if (!cancelled && r.ok) setAgents(arrayFromAgentHistory(r.data))
      }),
    ])

    return () => {
      cancelled = true
    }
  }, [enabled, setAgents, setBackgroundTasks, setEvents, setHealth, setSessions])
}

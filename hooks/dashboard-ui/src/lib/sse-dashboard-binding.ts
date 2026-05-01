/**
 * Glue between the schema-agnostic `createSseClient` (sse.ts) and the
 * dashboard's Zustand store. `sse.ts` deliberately avoids importing the
 * store; this file owns the translation between the reducer's
 * `SseSliceState` and the store's `data` / `connection` slices.
 *
 * Both `Shell.tsx` and `sse.test.ts` consume `dashboardSseBindings()` so the
 * mapping (which is wide — six `data.*` fields plus `connection.sseStatus`)
 * lives in one place and a future reducer field gets one update site.
 */

import type { SseClientOpts, SseClientStore } from './sse'
import type { AgentRow, SseSliceState } from './sse-reducer'
import { useDashboardStore, type DashboardState } from '@/store/dashboard'

export function projectDashboardSlice(state: DashboardState): SseSliceState {
  return {
    health: state.data.health,
    agents: Array.isArray(state.data.agents)
      ? (state.data.agents as AgentRow[])
      : [],
    backgroundTasks: Array.isArray(state.data.backgroundTasks)
      ? state.data.backgroundTasks
      : [],
    dispatchCounts: state.data.dispatchCounts,
    recentErrors: state.data.recentErrors,
    sessions: Array.isArray(state.data.sessions) ? state.data.sessions : [],
    sseStatus: state.connection.sseStatus,
  }
}

export function applyDashboardSlice(
  state: DashboardState,
  next: SseSliceState,
): Partial<DashboardState> {
  return {
    data: {
      ...state.data,
      health: next.health,
      agents: next.agents,
      backgroundTasks: next.backgroundTasks,
      dispatchCounts: next.dispatchCounts,
      recentErrors: next.recentErrors,
      sessions: next.sessions,
    },
    connection: {
      ...state.connection,
      sseStatus: next.sseStatus,
    },
  }
}

function dashboardStoreAdapter(): SseClientStore<DashboardState> {
  return {
    getState: () => useDashboardStore.getState(),
    setState: (updater) => {
      // Zustand's setState accepts the same `(state) => Partial<state>` shape
      // the SSE client emits; the cast just narrows the wider Zustand
      // overload set down to what `SseClientStore` exposes.
      useDashboardStore.setState(updater as Parameters<typeof useDashboardStore.setState>[0])
    },
  }
}

export function dashboardSseBindings(): Pick<
  SseClientOpts<DashboardState>,
  'store' | 'projectSlice' | 'applySlice'
> {
  return {
    store: dashboardStoreAdapter(),
    projectSlice: projectDashboardSlice,
    applySlice: applyDashboardSlice,
  }
}

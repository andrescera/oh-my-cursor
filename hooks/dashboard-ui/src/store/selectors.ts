import { useShallow } from 'zustand/shallow'
import { type TabId, useDashboardStore } from './dashboard'

// Object/array selectors go through `useShallow` so consumers don't
// re-render when an unrelated slice ref changes. Scalar selectors return
// primitives, so the default identity comparison is already optimal.

export const useUi = () => useDashboardStore(useShallow((s) => s.ui))
export const useConnection = () =>
  useDashboardStore(useShallow((s) => s.connection))

export const useActiveTab = () => useDashboardStore((s) => s.ui.activeTab)
export const useDenseMode = () => useDashboardStore((s) => s.ui.denseMode)
export const useSseStatus = () =>
  useDashboardStore((s) => s.connection.sseStatus)

export const useExpanded = (tab: TabId) =>
  useDashboardStore(useShallow((s) => s.ui.expandedKeys[tab]))

export const useDispatchCounts = () =>
  useDashboardStore(useShallow((s) => s.data.dispatchCounts))
export const useRecentErrors = () =>
  useDashboardStore(useShallow((s) => s.data.recentErrors))
export const useHealth = () => useDashboardStore((s) => s.data.health)

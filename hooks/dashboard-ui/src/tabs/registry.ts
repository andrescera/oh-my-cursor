import type { TabId } from '@/store/dashboard'

export type TabDefinition = {
  id: TabId
  label: string
  hotkey: string
}

export const TAB_DEFINITIONS: readonly TabDefinition[] = [
  { id: 'status', label: 'Status', hotkey: '1' },
  { id: 'hooks', label: 'Hooks', hotkey: '2' },
  { id: 'background', label: 'Background', hotkey: '3' },
  { id: 'events', label: 'Events', hotkey: '4' },
  { id: 'sessions', label: 'Sessions', hotkey: '5' },
  { id: 'agents', label: 'Agents', hotkey: '6' },
  { id: 'config', label: 'Config', hotkey: '7' },
  { id: 'models-routing', label: 'Models & Routing', hotkey: '8' },
] as const

export const HOTKEY_TO_TAB: Readonly<Record<string, TabId>> = TAB_DEFINITIONS.reduce(
  (acc, t) => {
    acc[t.hotkey] = t.id
    return acc
  },
  {} as Record<string, TabId>,
)

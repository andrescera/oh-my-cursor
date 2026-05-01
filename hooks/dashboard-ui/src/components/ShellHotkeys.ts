import { useEffect } from 'react'

import { useDashboardStore, type TabId } from '@/store/dashboard'
import { TAB_REFRESH_EVENT } from '@/lib/tab-refresh'
import { HOTKEY_TO_TAB } from '@/tabs/registry'

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

type ShellHotkeysArgs = {
  setActiveTab: (tab: TabId) => void
  setShortcutsOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
}

export function useShellHotkeys({ setActiveTab, setShortcutsOpen }: ShellHotkeysArgs): void {
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      // `?` opens the shortcuts sheet even from within an editable target;
      // that's the conventional escape hatch from any context.
      if (e.key === '?') {
        e.preventDefault()
        setShortcutsOpen((open) => !open)
        return
      }
      if (isEditableTarget(e.target)) return
      const tabFromHotkey = HOTKEY_TO_TAB[e.key]
      if (tabFromHotkey) {
        e.preventDefault()
        setActiveTab(tabFromHotkey)
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        if (useDashboardStore.getState().ui.activeTab !== 'events') {
          setActiveTab('events')
        }
        // Listener lives in EventsTab.tsx (FOCUS_SEARCH_EVENT). Names must
        // stay aligned; the round-trip spec in Shell.events-shortcut.test.tsx
        // mounts both sides together so a future rename can't drift again.
        window.dispatchEvent(new CustomEvent('omc-focus-events-search'))
        return
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        const tab = useDashboardStore.getState().ui.activeTab
        // Active tab listens via TAB_REFRESH_EVENT and re-runs its loader.
        // Radix Tabs unmounts inactive panels, so this fires only on the
        // tab the user is currently looking at.
        window.dispatchEvent(
          new CustomEvent(TAB_REFRESH_EVENT, { detail: { tab } }),
        )
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setActiveTab, setShortcutsOpen])
}

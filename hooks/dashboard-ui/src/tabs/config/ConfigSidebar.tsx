import type { KeyboardEvent, RefObject } from 'react'

import type { SectionDef } from './helpers'

type ConfigSidebarProps = {
  sections: SectionDef[]
  activeId: string
  setActiveId: (id: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
  tablistRef: RefObject<HTMLElement | null>
}

export function ConfigSidebar({
  sections,
  activeId,
  setActiveId,
  onKeyDown,
  tablistRef,
}: ConfigSidebarProps) {
  return (
    <nav
      ref={tablistRef as RefObject<HTMLElement>}
      role="tablist"
      aria-orientation="vertical"
      aria-label="Configuration sections"
      className="flex h-fit flex-col gap-0.5 rounded-lg border border-border bg-card p-1"
      onKeyDown={onKeyDown}
      data-slot="config-sidebar"
    >
      {sections.map((s) => {
        const isActive = s.id === activeId
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            id={`config-tab-${s.id}`}
            aria-controls={`config-panel-${s.id}`}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-testid={`config-section-${s.id}`}
            onClick={() => setActiveId(s.id)}
            className={
              'flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ' +
              (isActive
                ? 'bg-primary/10 font-medium text-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground')
            }
          >
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

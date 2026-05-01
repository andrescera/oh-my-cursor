import { type RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { type EventsFilter } from '@/store/dashboard'

import { FILTER_OPTIONS } from './events-undo'

type EventsToolbarProps = {
  filter: EventsFilter
  search: string
  autoScroll: boolean
  confirmingClear: boolean
  visibleCount: number
  searchInputRef: RefObject<HTMLInputElement | null>
  onFilterChange: (f: EventsFilter) => void
  onSearchChange: (q: string) => void
  onAutoscrollToggle: () => void
  onDownload: () => void
  onCopy: () => void
  onClear: () => void
  onConfirmClear: () => void
  onCancelClear: () => void
}

export function EventsToolbar({
  filter,
  search,
  autoScroll,
  confirmingClear,
  visibleCount,
  searchInputRef,
  onFilterChange,
  onSearchChange,
  onAutoscrollToggle,
  onDownload,
  onCopy,
  onClear,
  onConfirmClear,
  onCancelClear,
}: EventsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-2">
      <div
        role="group"
        aria-label="Filter events"
        className="flex items-center gap-1"
      >
        {FILTER_OPTIONS.map((f) => {
          const active = filter === f.id
          return (
            <Button
              key={f.id}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={active}
              data-testid={`events-filter-${f.id}`}
              className={cn(
                active &&
                  'bg-muted text-foreground ring-1 ring-inset ring-border',
              )}
              onClick={() => onFilterChange(f.id)}
            >
              {f.label}
            </Button>
          )
        })}
      </div>

      <Input
        ref={searchInputRef}
        type="search"
        aria-label="Search events"
        placeholder="Search events…  (press / to focus)"
        value={search}
        onChange={(e) => onSearchChange(e.currentTarget.value)}
        data-testid="events-search"
        className="h-7 w-56"
      />

      <div className="ml-auto flex items-center gap-1">
        <span
          className="px-1 text-xs text-muted-foreground"
          data-testid="events-count"
        >
          {visibleCount} shown
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={autoScroll}
          data-testid="events-autoscroll"
          className={cn(
            autoScroll &&
              'bg-muted text-foreground ring-1 ring-inset ring-border',
          )}
          onClick={onAutoscrollToggle}
          title="Auto-scroll to bottom when new events arrive"
        >
          ↓ Auto
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onDownload}
          data-testid="events-download"
        >
          Download
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCopy}
          data-testid="events-copy"
        >
          Copy JSON
        </Button>
        {confirmingClear ? (
          <>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              data-testid="events-clear-confirm"
              onClick={onConfirmClear}
            >
              Confirm clear?
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="events-clear-cancel"
              onClick={onCancelClear}
            >
              Cancel
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="sm"
            data-testid="events-clear"
            onClick={onClear}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}

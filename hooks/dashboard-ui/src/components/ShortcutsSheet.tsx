import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { TAB_DEFINITIONS } from '@/tabs/registry'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const META_SHORTCUTS: { keys: string[]; description: string }[] = [
  { keys: ['/'], description: 'Focus the events search input' },
  { keys: ['r'], description: 'Refresh the active tab' },
  { keys: ['?'], description: 'Open this shortcuts panel' },
  { keys: ['←', '→'], description: 'Move between tabs' },
  { keys: ['Home', 'End'], description: 'Jump to first / last tab' },
]

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 font-mono text-[11px] text-foreground">
      {children}
    </kbd>
  )
}

export function ShortcutsSheet({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 max-w-full">
        <SheetHeader>
          <SheetTitle>Keyboard shortcuts</SheetTitle>
          <SheetDescription>
            Move around the dashboard without leaving the keyboard.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tabs
            </h3>
            <ul className="flex flex-col gap-1.5">
              {TAB_DEFINITIONS.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-muted/50"
                >
                  <span>{t.label}</span>
                  <Kbd>{t.hotkey}</Kbd>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Navigation
            </h3>
            <ul className="flex flex-col gap-1.5">
              {META_SHORTCUTS.map((s) => (
                <li
                  key={s.description}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">{s.description}</span>
                  <span className="flex items-center gap-1">
                    {s.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export default function TabPlaceholder({ label }: { label?: string } = {}) {
  return (
    <div
      className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground"
      data-slot="tab-placeholder"
    >
      {label ? `${label} tab — coming soon` : 'Tab content not yet available'}
    </div>
  )
}
